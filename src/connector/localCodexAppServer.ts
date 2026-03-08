import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { cp, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { BridgePendingServerRequest, BridgeServerRequestReply } from '../shared/serverRequestBridge.js'
import type { BridgeSkillInstallPayload, BridgeSkillUninstallPayload } from '../shared/serverSkillsBridge.js'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

type JsonRpcResponse = {
  id?: number
  result?: unknown
  error?: {
    code: number
    message: string
  }
  method?: string
  params?: unknown
}

export class LocalCodexAppServer {
  private readonly command: string
  private process: ChildProcessWithoutNullStreams | null = null
  private initialized = false
  private initializePromise: Promise<void> | null = null
  private readBuffer = ''
  private nextId = 1
  private stopping = false
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()
  private readonly pendingServerRequests = new Map<number, BridgePendingServerRequest>()
  private readonly notificationListeners = new Set<(value: { method: string; params: unknown }) => void>()
  private methodCatalogCache: string[] | null = null
  private notificationCatalogCache: string[] | null = null

  constructor(command = 'codex') {
    this.command = command
  }

  private start(): void {
    if (this.process) return

    this.stopping = false
    const proc = spawn(this.command, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.process = proc

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      this.readBuffer += chunk

      let lineEnd = this.readBuffer.indexOf('\n')
      while (lineEnd !== -1) {
        const line = this.readBuffer.slice(0, lineEnd).trim()
        this.readBuffer = this.readBuffer.slice(lineEnd + 1)

        if (line.length > 0) {
          this.handleLine(line)
        }

        lineEnd = this.readBuffer.indexOf('\n')
      }
    })

    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', () => {
      // Keep stderr silent; failures are surfaced through JSON-RPC responses.
    })

    proc.on('exit', () => {
      const failure = new Error(this.stopping ? 'codex app-server stopped' : 'codex app-server exited unexpectedly')
      for (const request of this.pending.values()) {
        request.reject(failure)
      }
      this.pending.clear()
      this.process = null
      this.initialized = false
      this.initializePromise = null
      this.readBuffer = ''
    })
  }

  private sendLine(payload: Record<string, unknown>): void {
    if (!this.process) {
      throw new Error('codex app-server is not running')
    }
    this.process.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse
    try {
      message = JSON.parse(line) as JsonRpcResponse
    } catch {
      return
    }

    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pendingRequest = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (!pendingRequest) return

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message))
      } else {
        pendingRequest.resolve(message.result)
      }
      return
    }

    if (typeof message.method === 'string') {
      const record = asRecord(message)
      if (typeof record?.id === 'number' && Number.isInteger(record.id)) {
        this.handleServerRequest(record.id, message.method, message.params ?? null)
        return
      }
      for (const listener of this.notificationListeners) {
        listener({
          method: message.method,
          params: message.params ?? null,
        })
      }
    }
  }

  private emitNotification(notification: { method: string; params: unknown }): void {
    for (const listener of this.notificationListeners) {
      listener(notification)
    }
  }

  private getCodexHomeDir(): string {
    const codexHome = process.env.CODEX_HOME?.trim()
    return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
  }

  private getSkillsInstallDir(): string {
    return join(this.getCodexHomeDir(), 'skills')
  }

  private async runCommand(command: string, args: string[], cwd?: string): Promise<void> {
    await new Promise<void>((resolvePromise, reject) => {
      const proc = spawn(command, args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) {
          resolvePromise()
          return
        }
        const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
        reject(new Error(details.length > 0 ? details : `Command failed: ${command}`))
      })
    })
  }

  private async runGenerateSchemaCommand(outDir: string): Promise<void> {
    await this.runCommand(this.command, ['app-server', 'generate-json-schema', '--out', outDir])
  }

  private extractMethodsFromSchema(payload: unknown): string[] {
    const root = asRecord(payload)
    const oneOf = Array.isArray(root?.oneOf) ? root.oneOf : []
    const methods = new Set<string>()

    for (const entry of oneOf) {
      const row = asRecord(entry)
      const properties = asRecord(row?.properties)
      const methodDef = asRecord(properties?.method)
      const methodEnum = Array.isArray(methodDef?.enum) ? methodDef.enum : []

      for (const item of methodEnum) {
        if (typeof item === 'string' && item.length > 0) {
          methods.add(item)
        }
      }
    }

    return Array.from(methods).sort((a, b) => a.localeCompare(b))
  }

  private async detectUserSkillsDir(): Promise<string> {
    try {
      const result = (await this.rpc('skills/list', {})) as {
        data?: Array<{ skills?: Array<{ scope?: string; path?: string }> }>
      }
      for (const entry of result.data ?? []) {
        for (const skill of entry.skills ?? []) {
          if (skill.scope !== 'user' || !skill.path) continue
          const normalizedPath = skill.path.split('/').filter(Boolean)
          if (normalizedPath.length < 2) continue
          return `/${normalizedPath.slice(0, -2).join('/')}`
        }
      }
    } catch {}
    return this.getSkillsInstallDir()
  }

  private async ensureInstalledSkillIsValid(skillPath: string): Promise<void> {
    const result = (await this.rpc('skills/list', { forceReload: true })) as {
      data?: Array<{ errors?: Array<{ path?: string; message?: string }> }>
    }
    const normalized = skillPath.endsWith('/SKILL.md') ? skillPath : `${skillPath}/SKILL.md`
    for (const entry of result.data ?? []) {
      for (const error of entry.errors ?? []) {
        if (error.path === normalized) {
          throw new Error(error.message || 'Installed skill is invalid')
        }
      }
    }
  }

  async installSkillFromHub(payload: BridgeSkillInstallPayload): Promise<{ ok: true; path: string }> {
    await this.ensureInitialized()
    const owner = typeof payload?.owner === 'string' ? payload.owner.trim() : ''
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    if (!owner || !name) {
      throw new Error('Missing owner or name')
    }

    const repoDir = await mkdtemp(join(tmpdir(), 'codexui-skill-installer-'))
    const sparsePath = `skills/${owner}/${name}`
    try {
      await this.runCommand('git', [
        'clone',
        '--depth', '1',
        '--filter=blob:none',
        '--sparse',
        'https://github.com/openclaw/skills.git',
        repoDir,
      ])
      await this.runCommand('git', ['sparse-checkout', 'set', sparsePath], repoDir)
      const installDest = await this.detectUserSkillsDir()
      const sourceDir = join(repoDir, 'skills', owner, name)
      const targetDir = join(installDest, name)
      await rm(targetDir, { recursive: true, force: true })
      await mkdir(installDest, { recursive: true })
      await cp(sourceDir, targetDir, { recursive: true })
      await this.ensureInstalledSkillIsValid(targetDir)
      return { ok: true, path: targetDir }
    } finally {
      await rm(repoDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async listMethods(): Promise<string[]> {
    if (this.methodCatalogCache) return this.methodCatalogCache
    const outDir = await mkdtemp(join(tmpdir(), 'codexui-schema-'))
    try {
      await this.runGenerateSchemaCommand(outDir)
      const parsed = JSON.parse(await readFile(join(outDir, 'ClientRequest.json'), 'utf8')) as unknown
      const methods = this.extractMethodsFromSchema(parsed)
      this.methodCatalogCache = methods
      return methods
    } finally {
      await rm(outDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async listNotificationMethods(): Promise<string[]> {
    if (this.notificationCatalogCache) return this.notificationCatalogCache
    const outDir = await mkdtemp(join(tmpdir(), 'codexui-schema-'))
    try {
      await this.runGenerateSchemaCommand(outDir)
      const parsed = JSON.parse(await readFile(join(outDir, 'ServerNotification.json'), 'utf8')) as unknown
      const methods = this.extractMethodsFromSchema(parsed)
      this.notificationCatalogCache = methods
      return methods
    } finally {
      await rm(outDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async uninstallSkillFromHub(payload: BridgeSkillUninstallPayload): Promise<{ ok: true; deletedPath: string }> {
    await this.ensureInitialized()
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(name)) {
      throw new Error('Invalid skill name')
    }
    const skillsRoot = resolve(this.getSkillsInstallDir())
    const target = join(skillsRoot, name)
    if (!target.startsWith(`${skillsRoot}/`) && target !== skillsRoot) {
      throw new Error('Refusing to delete outside skills directory')
    }
    await rm(target, { recursive: true, force: true })
    try {
      await this.rpc('skills/list', { forceReload: true })
    } catch {}
    return { ok: true, deletedPath: target }
  }

  private sendServerRequestReply(requestId: number, reply: { result?: unknown; error?: { code: number; message: string } }): void {
    if (reply.error) {
      this.sendLine({
        jsonrpc: '2.0',
        id: requestId,
        error: reply.error,
      })
      return
    }

    this.sendLine({
      jsonrpc: '2.0',
      id: requestId,
      result: reply.result ?? {},
    })
  }

  private resolvePendingServerRequest(
    requestId: number,
    reply: { result?: unknown; error?: { code: number; message: string } },
  ): void {
    const pendingRequest = this.pendingServerRequests.get(requestId)
    if (!pendingRequest) {
      throw new Error(`No pending server request found for id ${String(requestId)}`)
    }

    this.pendingServerRequests.delete(requestId)
    this.sendServerRequestReply(requestId, reply)

    const requestParams = asRecord(pendingRequest.params)
    const threadId =
      typeof requestParams?.threadId === 'string' && requestParams.threadId.length > 0
        ? requestParams.threadId
        : ''

    this.emitNotification({
      method: 'server/request/resolved',
      params: {
        id: requestId,
        method: pendingRequest.method,
        threadId,
        mode: 'manual',
        resolvedAtIso: new Date().toISOString(),
      },
    })
  }

  private handleServerRequest(requestId: number, method: string, params: unknown): void {
    const pendingRequest: BridgePendingServerRequest = {
      id: requestId,
      method,
      params,
      receivedAtIso: new Date().toISOString(),
    }
    this.pendingServerRequests.set(requestId, pendingRequest)

    this.emitNotification({
      method: 'server/request',
      params: pendingRequest,
    })
  }

  private async call(method: string, params: unknown): Promise<unknown> {
    this.start()
    const id = this.nextId++

    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.sendLine({
        jsonrpc: '2.0',
        id,
        method,
        params,
      })
    })
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    if (this.initializePromise) {
      await this.initializePromise
      return
    }

    this.initializePromise = this.call('initialize', {
      clientInfo: {
        name: 'codexui-connector',
        version: '0.1.0',
      },
    }).then(() => {
      this.initialized = true
    }).finally(() => {
      this.initializePromise = null
    })

    await this.initializePromise
  }

  async rpc(method: string, params: unknown): Promise<unknown> {
    await this.ensureInitialized()
    return await this.call(method, params)
  }

  onNotification(listener: (value: { method: string; params: unknown }) => void): () => void {
    this.notificationListeners.add(listener)
    return () => {
      this.notificationListeners.delete(listener)
    }
  }

  async respondToServerRequest(payload: BridgeServerRequestReply): Promise<void> {
    await this.ensureInitialized()

    const body = asRecord(payload)
    if (!body) {
      throw new Error('Invalid response payload: expected object')
    }

    const id = body.id
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error('Invalid response payload: "id" must be an integer')
    }

    const rawError = asRecord(body.error)
    if (rawError) {
      const message = typeof rawError.message === 'string' && rawError.message.trim().length > 0
        ? rawError.message.trim()
        : 'Server request rejected by client'
      const code = typeof rawError.code === 'number' && Number.isFinite(rawError.code)
        ? Math.trunc(rawError.code)
        : -32000
      this.resolvePendingServerRequest(id, { error: { code, message } })
      return
    }

    if (!('result' in body)) {
      throw new Error('Invalid response payload: expected "result" or "error"')
    }

    this.resolvePendingServerRequest(id, { result: body.result })
  }

  listPendingServerRequests(): BridgePendingServerRequest[] {
    return Array.from(this.pendingServerRequests.values())
  }

  dispose(): void {
    if (!this.process) return

    const proc = this.process
    this.process = null
    this.stopping = true
    this.initialized = false
    this.initializePromise = null
    this.readBuffer = ''

    const failure = new Error('codex app-server stopped')
    for (const request of this.pending.values()) {
      request.reject(failure)
    }
    this.pending.clear()
    this.pendingServerRequests.clear()

    try {
      proc.stdin.end()
    } catch {}

    try {
      proc.kill('SIGTERM')
    } catch {}

    const forceKillTimer = setTimeout(() => {
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL')
        } catch {}
      }
    }, 1500)
    forceKillTimer.unref()
  }
}
