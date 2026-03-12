import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { accessSync, constants as fsConstants } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
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
    server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolvePromise())
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()))
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
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  if (input !== undefined) child.stdin.end(input)
  else child.stdin.end()
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
      if (response.ok) return
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }
  throw new Error(`Timed out waiting for ${baseUrl}\n${outputRef.stdout}\n${outputRef.stderr}`)
}

async function startServer({ password, sinkPath }) {
  const passwordHash = await generatePasswordHash(password)
  const port = await getAvailablePort()
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-pwa-hooks-'))
  const child = spawn('node', ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--username', 'relay-admin', '--password-hash', passwordHash], {
    cwd: repoRoot,
    env: createBaseEnv({
      CODEX_HOME: codeHome,
      CODEXUI_PUSH_TEST_SINK_PATH: sinkPath,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const outputRef = { stdout: '', stderr: '' }
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { outputRef.stdout += chunk })
  child.stderr.on('data', (chunk) => { outputRef.stderr += chunk })

  const baseUrl = `http://127.0.0.1:${String(port)}`
  await waitForServerReady(baseUrl, child, outputRef)
  return {
    baseUrl,
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

async function loginAndCompleteBootstrap(baseUrl, password) {
  const loginResponse = await postJson(`${baseUrl}/auth/login`, { username: 'relay-admin', password })
  assert.equal(loginResponse.status, 200)
  const bootstrapCookie = loginResponse.headers.get('set-cookie')
  assert.ok(bootstrapCookie)

  const setupResponse = await postJson(
    `${baseUrl}/auth/bootstrap/complete`,
    {
      currentPassword: password,
      newUsername: 'relay-admin-rotated',
      newPassword: 'relay-admin-rotated-password',
    },
    { Cookie: bootstrapCookie },
  )
  assert.equal(setupResponse.status, 200)

  const rotatedLoginResponse = await postJson(`${baseUrl}/auth/login`, {
    username: 'relay-admin-rotated',
    password: 'relay-admin-rotated-password',
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
      connectorVersion: '0.1.5',
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

async function waitForSinkLine(sinkPath) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const content = await readFile(sinkPath, 'utf8')
      const lines = content.trim().split('\n').filter(Boolean)
      if (lines.length > 0) {
        return JSON.parse(lines[0])
      }
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }
  throw new Error('Timed out waiting for push notification sink output')
}

test('hook events fan out to stored browser push subscriptions', async () => {
  const sinkDir = await mkdtemp(join(tmpdir(), 'codexui-pwa-sink-'))
  const sinkPath = join(sinkDir, 'push-log.ndjson')
  const server = await startServer({ password: 'relay-pwa-bootstrap-1', sinkPath })
  const connectorModule = await loadConnectorModule()

  try {
    const cookie = await loginAndCompleteBootstrap(server.baseUrl, 'relay-pwa-bootstrap-1')
    const configResponse = await fetch(`${server.baseUrl}/codex-api/pwa/config`, {
      headers: { Cookie: cookie },
    })
    const configPayload = await configResponse.json()
    assert.equal(configResponse.status, 200)
    assert.equal(typeof configPayload.data.vapidPublicKey, 'string')
    assert.ok(configPayload.data.vapidPublicKey.length > 20)

    const subscribeResponse = await postJson(
      `${server.baseUrl}/codex-api/pwa/subscriptions`,
      {
        subscription: {
          endpoint: 'https://push.example.test/subscriptions/test-user',
          expirationTime: null,
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
        platform: 'linux-x64',
        userAgent: 'test-agent',
      },
      { Cookie: cookie },
    )
    assert.equal(subscribeResponse.status, 201)

    const listResponse = await fetch(`${server.baseUrl}/codex-api/pwa/subscriptions`, {
      headers: { Cookie: cookie },
    })
    const listPayload = await listResponse.json()
    assert.equal(listResponse.status, 200)
    assert.equal(listPayload.data.subscriptions.length, 1)

    const credentialToken = await createConnectorCredential(server.baseUrl, cookie, 'remote-pwa-hooks')
    const notifications = createNotificationSource()

    const transport = new connectorModule.HttpRelayHubTransport(server.baseUrl, { allowInsecureHttp: true })
    const connector = new connectorModule.CodexRelayConnector({
      token: credentialToken,
      transport,
      connectorId: 'remote-pwa-hooks',
      pollWaitMs: 50,
      notificationFlushDelayMs: 0,
      appServer: {
        async rpc(method) {
          if (method === 'thread/list') {
            return { data: [] }
          }
          if (method === 'skills/list') {
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
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
      notifications.emit({
        method: 'server/request',
        params: {
          id: 301,
          threadId: 'thread-relay-pwa',
          command: 'hostname',
          reason: 'Need hostname approval',
        },
      })

      const sinkPayload = await waitForSinkLine(sinkPath)
      assert.equal(sinkPayload.endpoint, 'https://push.example.test/subscriptions/test-user')
      assert.equal(sinkPayload.payload.command, 'hostname')
      assert.equal(sinkPayload.payload.url, '/thread/thread-relay-pwa')
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
