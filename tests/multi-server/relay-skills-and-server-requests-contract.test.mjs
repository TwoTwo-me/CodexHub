import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { accessSync, constants as fsConstants } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const distCliPath = join(repoRoot, 'dist-cli', 'index.js')
const connectorCliPath = join(repoRoot, 'dist-cli', 'connector.js')

accessSync(distCliPath, fsConstants.F_OK)
accessSync(connectorCliPath, fsConstants.F_OK)

function createBaseEnv(overrides = {}) {
  const env = {
    ...process.env,
    CODEXUI_SKIP_CODEX_LOGIN: 'true',
    CODEXUI_OPEN_BROWSER: 'false',
  }

  delete env.CODEXUI_ADMIN_PASSWORD
  delete env.CODEXUI_ADMIN_PASSWORD_HASH
  delete env.CODEXUI_ADMIN_PASSWORD_FILE
  delete env.CODEXUI_ADMIN_PASSWORD_HASH_FILE

  return {
    ...env,
    ...overrides,
  }
}

async function loadConnectorModule() {
  const moduleUrl = pathToFileURL(connectorCliPath).href
  return await import(`${moduleUrl}?t=${Date.now()}`)
}

async function getAvailablePort() {
  const server = createServer((_req, res) => {
    res.statusCode = 204
    res.end()
  })

  await new Promise((resolvePromise, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error) {
        reject(error)
        return
      }
      resolvePromise()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to reserve a free port')
  }

  await new Promise((resolvePromise, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolvePromise()
    })
  })

  return address.port
}

async function runProcess(command, args, { env, input, cwd = repoRoot } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: createBaseEnv(env),
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  if (input !== undefined) {
    child.stdin.end(input)
  } else {
    child.stdin.end()
  }

  const exitCode = await new Promise((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('close', resolvePromise)
  })

  return { exitCode, stdout, stderr }
}

async function generatePasswordHash(password) {
  const result = await runProcess('node', ['dist-cli/index.js', 'hash-password', '--password-stdin'], {
    input: password,
  })
  assert.equal(result.exitCode, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

async function waitForServerReady(baseUrl, child, outputRef) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`codexui exited early (${String(child.exitCode)}):\n${outputRef.stdout}\n${outputRef.stderr}`)
    }

    try {
      const response = await fetch(`${baseUrl}/auth/session`)
      if (response.ok) {
        return
      }
    } catch {}

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }

  throw new Error(`Timed out waiting for ${baseUrl}\n${outputRef.stdout}\n${outputRef.stderr}`)
}

async function startServer({ password, username = 'relay-admin', extraEnv = {} }) {
  const passwordHash = await generatePasswordHash(password)
  const port = await getAvailablePort()
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-relay-skills-hooks-'))
  const child = spawn('node', ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--username', username, '--password-hash', passwordHash], {
    cwd: repoRoot,
    env: createBaseEnv({
      CODEX_HOME: codeHome,
      ...extraEnv,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const outputRef = { stdout: '', stderr: '' }
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    outputRef.stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    outputRef.stderr += chunk
  })

  const baseUrl = `http://127.0.0.1:${String(port)}`
  await waitForServerReady(baseUrl, child, outputRef)

  return {
    baseUrl,
    outputRef,
    async stop() {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await new Promise((resolvePromise) => child.once('close', resolvePromise))
    },
  }
}

async function postJson(url, payload, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  })
}

async function loginAndCompleteBootstrap(baseUrl, username, password, rotatedUsername, rotatedPassword) {
  const loginResponse = await postJson(`${baseUrl}/auth/login`, { username, password })
  assert.equal(loginResponse.status, 200)
  const bootstrapCookie = loginResponse.headers.get('set-cookie')
  assert.ok(bootstrapCookie)

  const setupResponse = await postJson(
    `${baseUrl}/auth/bootstrap/complete`,
    {
      currentPassword: password,
      newUsername: rotatedUsername,
      newPassword: rotatedPassword,
    },
    { Cookie: bootstrapCookie },
  )
  assert.equal(setupResponse.status, 200)

  const rotatedLoginResponse = await postJson(`${baseUrl}/auth/login`, {
    username: rotatedUsername,
    password: rotatedPassword,
  })
  assert.equal(rotatedLoginResponse.status, 200)
  const rotatedCookie = rotatedLoginResponse.headers.get('set-cookie')
  assert.ok(rotatedCookie)
  return rotatedCookie
}

async function createConnectorCredential(baseUrl, cookie, connectorId) {
  const createResponse = await postJson(
    `${baseUrl}/codex-api/connectors`,
    {
      id: connectorId,
      name: connectorId,
      hubAddress: baseUrl,
    },
    { Cookie: cookie },
  )
  assert.equal(createResponse.status, 201)
  const createBody = await createResponse.json()
  const bootstrapToken = createBody.data.bootstrapToken
  assert.equal(typeof bootstrapToken, 'string')

  const exchangeResponse = await postJson(
    `${baseUrl}/codex-api/connectors/${encodeURIComponent(connectorId)}/bootstrap-exchange`,
    {
      hostname: connectorId,
      platform: 'linux',
      connectorVersion: '0.1.4',
    },
    {
      Authorization: `Bearer ${bootstrapToken}`,
    },
  )
  assert.equal(exchangeResponse.status, 200)
  const exchangeBody = await exchangeResponse.json()
  const credentialToken = exchangeBody.data.credentialToken
  assert.equal(typeof credentialToken, 'string')
  return credentialToken
}

async function startFakeSkillsHub() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')

    if (url.pathname === '/api/github/tree') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        tree: [
          { path: 'skills/openclaw/docker/_meta.json', type: 'blob' },
        ],
      }))
      return
    }

    if (url.pathname === '/raw/skills/openclaw/docker/_meta.json') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        displayName: 'Docker Toolkit',
        latest: {
          publishedAt: 1_735_900_000,
        },
      }))
      return
    }

    if (url.pathname === '/raw/skills/openclaw/docker/SKILL.md') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
      res.end('# Docker Toolkit\n\nRemote connector skill readme')
      return
    }

    res.statusCode = 404
    res.end('Not found')
  })

  await new Promise((resolvePromise, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error) {
        reject(error)
        return
      }
      resolvePromise()
    })
  })

  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${String(address.port)}`

  return {
    baseUrl,
    async stop() {
      await new Promise((resolvePromise, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolvePromise()
        })
      })
    },
  }
}

function createNotificationSource() {
  const listeners = new Set()
  return {
    emit(notification) {
      for (const listener of listeners) {
        listener(notification)
      }
    },
    onNotification(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function startConnectorLoop(connector) {
  let stopped = false
  const loop = (async () => {
    while (!stopped) {
      try {
        await connector.pollOnce()
      } catch {
        if (stopped) break
      }
    }
  })()
  return {
    loop,
    stop() {
      stopped = true
      connector.dispose()
    },
  }
}

test('relay-backed skills hub uses the selected connector instead of returning 502', async () => {
  const skillsHub = await startFakeSkillsHub()
  const server = await startServer({
    password: 'relay-skills-bootstrap-1',
    extraEnv: {
      CODEXUI_SKILLS_HUB_TREE_URL: `${skillsHub.baseUrl}/api/github/tree`,
      CODEXUI_SKILLS_HUB_RAW_BASE_URL: `${skillsHub.baseUrl}/raw`,
      CODEXUI_SKILLS_HUB_WEB_BASE_URL: 'https://skills.example.test',
    },
  })
  const connectorModule = await loadConnectorModule()

  try {
    const cookie = await loginAndCompleteBootstrap(
      server.baseUrl,
      'relay-admin',
      'relay-skills-bootstrap-1',
      'relay-skills-admin',
      'relay-skills-bootstrap-2',
    )
    const credentialToken = await createConnectorCredential(server.baseUrl, cookie, 'remote-skills')

    const rpcCalls = []
    const transport = new connectorModule.HttpRelayHubTransport(server.baseUrl, { allowInsecureHttp: true })
    const connector = new connectorModule.CodexRelayConnector({
      token: credentialToken,
      transport,
      connectorId: 'remote-skills',
      pollWaitMs: 50,
      notificationFlushDelayMs: 0,
      appServer: {
        async rpc(method, params) {
          rpcCalls.push({ method, params })
          if (method === 'skills/list') {
            return {
              data: [
                {
                  cwd: '/remote/project',
                  skills: [
                    {
                      name: 'docker',
                      description: 'Remote docker toolkit',
                      path: '/remote/.codex/skills/docker/SKILL.md',
                      scope: 'user',
                      enabled: true,
                    },
                  ],
                },
              ],
            }
          }
          throw new Error(`Unexpected relay method: ${method}`)
        },
        onNotification() {
          return () => {}
        },
      },
    })
    const connectorLoop = startConnectorLoop(connector)

    try {
      const response = await fetch(`${server.baseUrl}/codex-api/skills-hub?serverId=remote-skills&q=docker&limit=10`, {
        headers: {
          Accept: 'application/json',
          Cookie: cookie,
        },
      })
      const payload = await response.json()

      assert.equal(response.status, 200)
      assert.equal(payload.installed?.[0]?.name, 'docker')
      assert.equal(payload.installed?.[0]?.path, '/remote/.codex/skills/docker/SKILL.md')
      assert.equal(payload.data?.[0]?.name, 'docker')
      assert.equal(payload.data?.[0]?.displayName, 'Docker Toolkit')
      assert.ok(rpcCalls.some((call) => call.method === 'skills/list'))
    } finally {
      connectorLoop.stop()
      await Promise.race([
        connectorLoop.loop,
        new Promise((resolvePromise) => setTimeout(resolvePromise, 200)),
      ])
    }
  } finally {
    await server.stop()
    await skillsHub.stop()
  }
})

test('relay-backed skill install and uninstall run on the selected connector host', async () => {
  const server = await startServer({ password: 'relay-skills-install-bootstrap-1' })
  const connectorModule = await loadConnectorModule()

  try {
    const cookie = await loginAndCompleteBootstrap(
      server.baseUrl,
      'relay-admin',
      'relay-skills-install-bootstrap-1',
      'relay-skills-install-admin',
      'relay-skills-install-bootstrap-2',
    )
    const credentialToken = await createConnectorCredential(server.baseUrl, cookie, 'remote-skills-install')
    const rpcCalls = []

    const transport = new connectorModule.HttpRelayHubTransport(server.baseUrl, { allowInsecureHttp: true })
    const connector = new connectorModule.CodexRelayConnector({
      token: credentialToken,
      transport,
      connectorId: 'remote-skills-install',
      pollWaitMs: 50,
      notificationFlushDelayMs: 0,
      appServer: {
        async rpc(method, params) {
          rpcCalls.push({ method, params })
          if (method === 'codexui/skills/install') {
            return {
              ok: true,
              path: '/remote/.codex/skills/docker-toolkit',
            }
          }
          if (method === 'codexui/skills/uninstall') {
            return {
              ok: true,
              deletedPath: '/remote/.codex/skills/docker-toolkit',
            }
          }
          if (method === 'skills/list') {
            return { data: [] }
          }
          throw new Error(`Unexpected relay method: ${method}`)
        },
        onNotification() {
          return () => {}
        },
      },
    })
    const connectorLoop = startConnectorLoop(connector)

    try {
      const installResponse = await postJson(
        `${server.baseUrl}/codex-api/skills-hub/install?serverId=remote-skills-install`,
        {
          owner: 'openclaw',
          name: 'docker-toolkit',
        },
        {
          Cookie: cookie,
          Origin: server.baseUrl,
        },
      )
      const installPayload = await installResponse.json()
      assert.equal(installResponse.status, 200, JSON.stringify(installPayload))
      assert.equal(installPayload.ok, true)
      assert.equal(installPayload.path, '/remote/.codex/skills/docker-toolkit')

      const uninstallResponse = await postJson(
        `${server.baseUrl}/codex-api/skills-hub/uninstall?serverId=remote-skills-install`,
        {
          name: 'docker-toolkit',
        },
        {
          Cookie: cookie,
          Origin: server.baseUrl,
        },
      )
      const uninstallPayload = await uninstallResponse.json()
      assert.equal(uninstallResponse.status, 200, JSON.stringify(uninstallPayload))
      assert.equal(uninstallPayload.ok, true)
      assert.ok(rpcCalls.some((call) => call.method === 'codexui/skills/install'))
      assert.ok(rpcCalls.some((call) => call.method === 'codexui/skills/uninstall'))
    } finally {
      connectorLoop.stop()
      await Promise.race([
        connectorLoop.loop,
        new Promise((resolvePromise) => setTimeout(resolvePromise, 200)),
      ])
    }
  } finally {
    await server.stop()
  }
})

test('relay-backed pending server requests can be hydrated and replied to', async () => {
  const server = await startServer({ password: 'relay-hooks-bootstrap-1' })
  const connectorModule = await loadConnectorModule()

  try {
    const cookie = await loginAndCompleteBootstrap(
      server.baseUrl,
      'relay-admin',
      'relay-hooks-bootstrap-1',
      'relay-hooks-admin',
      'relay-hooks-bootstrap-2',
    )
    const credentialToken = await createConnectorCredential(server.baseUrl, cookie, 'remote-hooks')

    const pending = [
      {
        id: 101,
        method: 'item/commandExecution/requestApproval',
        params: {
          threadId: 'thread-relay',
          turnId: 'turn-relay',
          itemId: 'item-relay',
          command: 'hostname',
          reason: 'Need to inspect the connector hostname',
        },
        receivedAtIso: '2026-03-08T12:00:00.000Z',
      },
    ]
    const rpcCalls = []
    const notifications = createNotificationSource()

    const transport = new connectorModule.HttpRelayHubTransport(server.baseUrl, { allowInsecureHttp: true })
    const connector = new connectorModule.CodexRelayConnector({
      token: credentialToken,
      transport,
      connectorId: 'remote-hooks',
      pollWaitMs: 50,
      notificationFlushDelayMs: 0,
      appServer: {
        async rpc(method, params) {
          rpcCalls.push({ method, params })
          if (method === 'codexui/server-requests/pending') {
            return pending
          }
          if (method === 'codexui/server-requests/respond') {
            assert.equal(params?.id, 101)
            pending.splice(0, pending.length)
            notifications.emit({
              method: 'server/request/resolved',
              params: {
                id: 101,
                threadId: 'thread-relay',
              },
            })
            return { ok: true }
          }
          if (method === 'thread/list') {
            return { data: [] }
          }
          throw new Error(`Unexpected relay method: ${method}`)
        },
        onNotification(listener) {
          return notifications.onNotification(listener)
        },
      },
    })
    const connectorLoop = startConnectorLoop(connector)

    try {
      const pendingResponse = await fetch(`${server.baseUrl}/codex-api/server-requests/pending?serverId=remote-hooks`, {
        headers: {
          Accept: 'application/json',
          Cookie: cookie,
        },
      })
      const pendingPayload = await pendingResponse.json()
      assert.equal(pendingResponse.status, 200)
      assert.equal(Array.isArray(pendingPayload.data), true)
      assert.equal(pendingPayload.data.length, 1)
      assert.equal(pendingPayload.data[0].method, 'item/commandExecution/requestApproval')

      const respondResponse = await postJson(
        `${server.baseUrl}/codex-api/server-requests/respond?serverId=remote-hooks`,
        {
          id: 101,
          result: { decision: 'accept' },
        },
        { Cookie: cookie },
      )
      const respondPayload = await respondResponse.json()
      assert.equal(respondResponse.status, 200, JSON.stringify(respondPayload))

      const refreshedResponse = await fetch(`${server.baseUrl}/codex-api/server-requests/pending?serverId=remote-hooks`, {
        headers: {
          Accept: 'application/json',
          Cookie: cookie,
        },
      })
      const refreshedPayload = await refreshedResponse.json()
      assert.equal(refreshedResponse.status, 200)
      assert.deepEqual(refreshedPayload.data, [])
      assert.ok(rpcCalls.some((call) => call.method === 'codexui/server-requests/pending'))
      assert.ok(rpcCalls.some((call) => call.method === 'codexui/server-requests/respond'))
    } finally {
      connectorLoop.stop()
      await Promise.race([
        connectorLoop.loop,
        new Promise((resolvePromise) => setTimeout(resolvePromise, 200)),
      ])
    }
  } finally {
    await server.stop()
  }
})
