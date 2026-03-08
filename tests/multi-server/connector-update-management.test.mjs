import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

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

async function runCommand(args, { env, input, cwd = repoRoot } = {}) {
  const child = spawn('node', args, {
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
  const result = await runCommand(['dist-cli/index.js', 'hash-password', '--password-stdin'], {
    input: password,
  })
  assert.equal(result.exitCode, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

async function startServer() {
  const port = await getAvailablePort()
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-connector-updates-'))
  const passwordHash = await generatePasswordHash('bootstrap-pass-1')
  const child = spawn('node', ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--username', 'bootstrap-admin', '--password-hash', passwordHash], {
    cwd: repoRoot,
    env: createBaseEnv({
      CODEX_HOME: codeHome,
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
    codeHome,
    async stop() {
      if (child.exitCode !== null) {
        return
      }
      child.kill('SIGTERM')
      await new Promise((resolvePromise) => {
        child.once('close', () => resolvePromise())
      })
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

async function putJson(url, payload, headers = {}) {
  return fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  })
}

async function login(baseUrl, username, password) {
  const response = await postJson(`${baseUrl}/auth/login`, { username, password })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert.ok(cookie)
  return cookie
}

async function completeBootstrap(baseUrl, cookie, currentPassword, newUsername, newPassword) {
  const response = await postJson(`${baseUrl}/auth/bootstrap/complete`, {
    currentPassword,
    newUsername,
    newPassword,
  }, { Cookie: cookie })
  assert.equal(response.status, 200)
}

async function createApprovedUser(baseUrl, adminCookie, username, role = 'user') {
  const signupResponse = await postJson(`${baseUrl}/auth/signup`, {
    username,
    password: `${username}-pass`,
    role,
  }, { Cookie: adminCookie })
  assert.equal(signupResponse.status, 201)

  const loginCookie = await login(baseUrl, username, `${username}-pass`)
  return loginCookie
}

test('hub exposes connector telemetry, compatible releases, and user-scoped connector update jobs', async () => {
  const server = await startServer()

  try {
    const bootstrapCookie = await login(server.baseUrl, 'bootstrap-admin', 'bootstrap-pass-1')
    await completeBootstrap(server.baseUrl, bootstrapCookie, 'bootstrap-pass-1', 'primary-admin', 'primary-pass-2')
    const adminCookie = await login(server.baseUrl, 'primary-admin', 'primary-pass-2')
    const ownerCookie = await createApprovedUser(server.baseUrl, adminCookie, 'owner-user')
    const otherCookie = await createApprovedUser(server.baseUrl, adminCookie, 'other-user')

    const createConnectorResponse = await postJson(`${server.baseUrl}/codex-api/connectors`, {
      id: 'edge-alpha',
      name: 'Edge Alpha',
      hubAddress: server.baseUrl,
    }, { Cookie: ownerCookie })
    assert.equal(createConnectorResponse.status, 201)
    const createConnectorBody = await createConnectorResponse.json()
    const bootstrapToken = createConnectorBody.data.bootstrapToken
    assert.equal(typeof bootstrapToken, 'string')

    const exchangeResponse = await fetch(`${server.baseUrl}/codex-api/connectors/edge-alpha/bootstrap-exchange`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bootstrapToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        connectorVersion: '0.1.4',
        runnerMode: 'script',
        platform: 'linux-x64',
        updateCapable: true,
        restartCapable: true,
        hostname: 'edge-host',
      }),
    })
    assert.equal(exchangeResponse.status, 200)
    const exchangeBody = await exchangeResponse.json()
    const credentialToken = exchangeBody.data.credentialToken
    assert.equal(typeof credentialToken, 'string')

    const connectResponse = await fetch(`${server.baseUrl}/codex-api/relay/agent/connect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentialToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        connectorVersion: '0.1.4',
        runnerMode: 'script',
        platform: 'linux-x64',
        updateCapable: true,
        restartCapable: true,
        hostname: 'edge-host',
      }),
    })
    assert.equal(connectResponse.status, 200)

    const releaseResponse = await putJson(`${server.baseUrl}/codex-api/admin/connectors/releases`, {
      releases: [
        {
          version: '0.1.5',
          artifactUrl: 'https://downloads.example.test/codexui-connector-0.1.5.tgz',
          sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          runnerModes: ['script', 'systemd-user', 'pm2-user'],
          platforms: ['linux'],
          releaseNotesUrl: 'https://downloads.example.test/releases/0.1.5',
          publishedAtIso: '2026-03-08T10:00:00.000Z',
        },
      ],
    }, { Cookie: adminCookie })
    assert.equal(releaseResponse.status, 200)

    const listConnectorsResponse = await fetch(`${server.baseUrl}/codex-api/connectors`, {
      headers: { Cookie: ownerCookie },
    })
    assert.equal(listConnectorsResponse.status, 200)
    const listConnectorsBody = await listConnectorsResponse.json()
    assert.deepEqual(listConnectorsBody.data.connectors.map((connector) => ({
      id: connector.id,
      connectorVersion: connector.connectorVersion,
      runnerMode: connector.runnerMode,
      platform: connector.platform,
      updateCapable: connector.updateCapable,
      restartCapable: connector.restartCapable,
      latestReleaseVersion: connector.latestReleaseVersion,
      updateStatus: connector.updateStatus,
    })), [
      {
        id: 'edge-alpha',
        connectorVersion: '0.1.4',
        runnerMode: 'script',
        platform: 'linux-x64',
        updateCapable: true,
        restartCapable: true,
        latestReleaseVersion: '0.1.5',
        updateStatus: 'update_available',
      },
    ])

    const otherUpdateResponse = await postJson(`${server.baseUrl}/codex-api/connectors/edge-alpha/update-jobs`, {}, {
      Cookie: otherCookie,
    })
    assert.equal(otherUpdateResponse.status, 404)

    const createJobResponse = await postJson(`${server.baseUrl}/codex-api/connectors/edge-alpha/update-jobs`, {}, {
      Cookie: ownerCookie,
    })
    assert.equal(createJobResponse.status, 201)
    const createJobBody = await createJobResponse.json()
    assert.equal(createJobBody.data.job.action, 'update')
    assert.equal(createJobBody.data.job.status, 'queued')
    assert.equal(createJobBody.data.job.targetVersion, '0.1.5')

    const pollResponse = await fetch(`${server.baseUrl}/codex-api/connector-agent/jobs/poll`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentialToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        connectorVersion: '0.1.4',
        runnerMode: 'script',
        platform: 'linux-x64',
        updateCapable: true,
        restartCapable: true,
        hostname: 'edge-host',
      }),
    })
    assert.equal(pollResponse.status, 200)
    const pollBody = await pollResponse.json()
    assert.equal(pollBody.data.job.id, createJobBody.data.job.id)
    assert.equal(pollBody.data.job.action, 'update')
    assert.equal(pollBody.data.job.artifact.version, '0.1.5')

    const updateHistoryResponse = await fetch(`${server.baseUrl}/codex-api/connectors/edge-alpha/update-jobs`, {
      headers: { Cookie: ownerCookie },
    })
    assert.equal(updateHistoryResponse.status, 200)
    const updateHistoryBody = await updateHistoryResponse.json()
    assert.equal(updateHistoryBody.data.jobs.length, 1)
    assert.equal(updateHistoryBody.data.jobs[0].status, 'queued')
  } finally {
    await server.stop()
  }
})

test('hub rejects connector update jobs for unsupported runner modes', async () => {
  const server = await startServer()

  try {
    const bootstrapCookie = await login(server.baseUrl, 'bootstrap-admin', 'bootstrap-pass-1')
    await completeBootstrap(server.baseUrl, bootstrapCookie, 'bootstrap-pass-1', 'primary-admin', 'primary-pass-2')
    const adminCookie = await login(server.baseUrl, 'primary-admin', 'primary-pass-2')
    const ownerCookie = await createApprovedUser(server.baseUrl, adminCookie, 'unsupported-owner')

    const createConnectorResponse = await postJson(`${server.baseUrl}/codex-api/connectors`, {
      id: 'manual-edge',
      name: 'Manual Edge',
      hubAddress: server.baseUrl,
    }, { Cookie: ownerCookie })
    assert.equal(createConnectorResponse.status, 201)

    const createJobResponse = await postJson(`${server.baseUrl}/codex-api/connectors/manual-edge/update-jobs`, {}, {
      Cookie: ownerCookie,
    })
    assert.equal(createJobResponse.status, 409)
    const createJobBody = await createJobResponse.json()
    assert.match(createJobBody.error, /unsupported/i)
  } finally {
    await server.stop()
  }
})
