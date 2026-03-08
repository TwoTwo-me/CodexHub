import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'

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
  assert.ok(address && typeof address !== 'string')

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
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })

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

async function startServer({ codeHome } = {}) {
  const port = await getAvailablePort()
  const resolvedCodeHome = codeHome ?? await mkdtemp(join(tmpdir(), 'codexui-pwa-device-management-'))
  const passwordHash = await generatePasswordHash('bootstrap-pass-1')
  const child = spawn('node', ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--username', 'bootstrap-admin', '--password-hash', passwordHash], {
    cwd: repoRoot,
    env: createBaseEnv({ CODEX_HOME: resolvedCodeHome }),
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
    codeHome: resolvedCodeHome,
    async stop() {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await new Promise((resolvePromise) => child.once('close', () => resolvePromise()))
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

async function patchJson(url, payload, headers = {}) {
  return fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  })
}

async function deleteJson(url, payload, headers = {}) {
  return fetch(url, {
    method: 'DELETE',
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

async function completeBootstrap(baseUrl, cookie) {
  const response = await postJson(`${baseUrl}/auth/bootstrap/complete`, {
    currentPassword: 'bootstrap-pass-1',
    newUsername: 'primary-admin',
    newPassword: 'primary-pass-2',
  }, { Cookie: cookie })
  assert.equal(response.status, 200)
}

async function createApprovedUser(baseUrl, adminCookie, username) {
  const signupResponse = await postJson(`${baseUrl}/auth/signup`, {
    username,
    password: `${username}-pass`,
    role: 'user',
  }, { Cookie: adminCookie })
  assert.equal(signupResponse.status, 201)
  return await login(baseUrl, username, `${username}-pass`)
}

async function createPushSubscription(baseUrl, cookie, endpoint, platform = 'linux-x64') {
  const response = await postJson(`${baseUrl}/codex-api/pwa/subscriptions`, {
    subscription: {
      endpoint,
      expirationTime: null,
      keys: {
        p256dh: `${endpoint}-p256dh`,
        auth: `${endpoint}-auth`,
      },
    },
    platform,
    userAgent: `${platform}-user-agent`,
  }, { Cookie: cookie })
  return response
}

async function listPushSubscriptions(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/codex-api/pwa/subscriptions`, {
    headers: { Cookie: cookie },
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  return body.data.subscriptions
}

async function createLegacyPushSubscriptionDatabase(codeHome) {
  const databasePath = join(codeHome, 'codexui', 'hub.sqlite')
  await mkdir(dirname(databasePath), { recursive: true })
  const database = new Database(databasePath)
  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_lower TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'approved',
      password_hash TEXT NOT NULL,
      must_change_username INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      is_bootstrap_admin INTEGER NOT NULL DEFAULT 0,
      bootstrap_state TEXT NOT NULL DEFAULT 'none',
      setup_completed_at_iso TEXT,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      last_login_at_iso TEXT,
      approved_at_iso TEXT,
      approved_by_user_id TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users(username_lower);
    CREATE TABLE IF NOT EXISTS state_entries (
      scope TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      json_value TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      PRIMARY KEY (scope, entry_key)
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      subscription_json TEXT NOT NULL,
      user_agent TEXT,
      platform TEXT,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      last_success_at_iso TEXT,
      last_failure_at_iso TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);
  `)
  database.close()
  return databasePath
}

test('legacy push subscription tables migrate to alias-aware device records with user-scoped rename and delete', async () => {
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-pwa-legacy-'))
  const databasePath = await createLegacyPushSubscriptionDatabase(codeHome)
  const server = await startServer({ codeHome })

  try {
    const database = new Database(databasePath, { readonly: true })
    const columns = database.prepare('PRAGMA table_info(push_subscriptions)').all().map((column) => column.name)
    database.close()
    assert.ok(columns.includes('device_alias'))

    const bootstrapCookie = await login(server.baseUrl, 'bootstrap-admin', 'bootstrap-pass-1')
    await completeBootstrap(server.baseUrl, bootstrapCookie)
    const adminCookie = await login(server.baseUrl, 'primary-admin', 'primary-pass-2')
    const ownerCookie = await createApprovedUser(server.baseUrl, adminCookie, 'device-owner')
    const otherCookie = await createApprovedUser(server.baseUrl, adminCookie, 'other-owner')

    const firstCreate = await createPushSubscription(server.baseUrl, ownerCookie, 'https://push.example.test/subscriptions/phone-1', 'ios')
    assert.equal(firstCreate.status, 201)
    const secondCreate = await createPushSubscription(server.baseUrl, ownerCookie, 'https://push.example.test/subscriptions/laptop-1', 'linux')
    assert.equal(secondCreate.status, 201)

    const ownerSubscriptions = await listPushSubscriptions(server.baseUrl, ownerCookie)
    assert.equal(ownerSubscriptions.length, 2)
    assert.ok(ownerSubscriptions.every((subscription) => typeof subscription.id === 'string' && subscription.id.length > 0))
    assert.equal(ownerSubscriptions.every((subscription) => 'deviceAlias' in subscription), true)

    const renameResponse = await patchJson(
      `${server.baseUrl}/codex-api/pwa/subscriptions/${encodeURIComponent(ownerSubscriptions[0].id)}`,
      { deviceAlias: 'QA iPhone' },
      { Cookie: ownerCookie },
    )
    assert.equal(renameResponse.status, 200)

    const renamedSubscriptions = await listPushSubscriptions(server.baseUrl, ownerCookie)
    const renamedRecord = renamedSubscriptions.find((subscription) => subscription.id === ownerSubscriptions[0].id)
    assert.ok(renamedRecord)
    assert.equal(renamedRecord.deviceAlias, 'QA iPhone')

    const otherVisibleSubscriptions = await listPushSubscriptions(server.baseUrl, otherCookie)
    assert.equal(otherVisibleSubscriptions.length, 0)

    const otherRenameAttempt = await patchJson(
      `${server.baseUrl}/codex-api/pwa/subscriptions/${encodeURIComponent(ownerSubscriptions[0].id)}`,
      { deviceAlias: 'Blocked rename' },
      { Cookie: otherCookie },
    )
    assert.equal(otherRenameAttempt.status, 404)

    const deleteResponse = await deleteJson(
      `${server.baseUrl}/codex-api/pwa/subscriptions/${encodeURIComponent(ownerSubscriptions[1].id)}`,
      {},
      { Cookie: ownerCookie },
    )
    assert.equal(deleteResponse.status, 200)

    const remainingSubscriptions = await listPushSubscriptions(server.baseUrl, ownerCookie)
    assert.equal(remainingSubscriptions.length, 1)
    assert.equal(remainingSubscriptions[0].id, ownerSubscriptions[0].id)
  } finally {
    await server.stop()
  }
})

test('refreshing the current browser subscription keeps the same device id and alias', async () => {
  const server = await startServer()

  try {
    const bootstrapCookie = await login(server.baseUrl, 'bootstrap-admin', 'bootstrap-pass-1')
    await completeBootstrap(server.baseUrl, bootstrapCookie)
    const adminCookie = await login(server.baseUrl, 'primary-admin', 'primary-pass-2')
    const ownerCookie = await createApprovedUser(server.baseUrl, adminCookie, 'refresh-owner')

    const createResponse = await createPushSubscription(server.baseUrl, ownerCookie, 'https://push.example.test/subscriptions/current-browser', 'macOS')
    assert.equal(createResponse.status, 201)
    const createdSubscriptions = await listPushSubscriptions(server.baseUrl, ownerCookie)
    assert.equal(createdSubscriptions.length, 1)
    const originalSubscription = createdSubscriptions[0]

    const renameResponse = await patchJson(
      `${server.baseUrl}/codex-api/pwa/subscriptions/${encodeURIComponent(originalSubscription.id)}`,
      { deviceAlias: 'Primary Laptop' },
      { Cookie: ownerCookie },
    )
    assert.equal(renameResponse.status, 200)

    const refreshResponse = await createPushSubscription(server.baseUrl, ownerCookie, 'https://push.example.test/subscriptions/current-browser', 'macOS')
    assert.equal(refreshResponse.status, 201)

    const refreshedSubscriptions = await listPushSubscriptions(server.baseUrl, ownerCookie)
    assert.equal(refreshedSubscriptions.length, 1)
    assert.equal(refreshedSubscriptions[0].id, originalSubscription.id)
    assert.equal(refreshedSubscriptions[0].deviceAlias, 'Primary Laptop')
  } finally {
    await server.stop()
  }
})

test('device alias updates reject values longer than 30 characters', async () => {
  const server = await startServer()

  try {
    const bootstrapCookie = await login(server.baseUrl, 'bootstrap-admin', 'bootstrap-pass-1')
    await completeBootstrap(server.baseUrl, bootstrapCookie)
    const adminCookie = await login(server.baseUrl, 'primary-admin', 'primary-pass-2')
    const ownerCookie = await createApprovedUser(server.baseUrl, adminCookie, 'alias-owner')

    const createResponse = await createPushSubscription(server.baseUrl, ownerCookie, 'https://push.example.test/subscriptions/alias-limit', 'Android')
    assert.equal(createResponse.status, 201)
    const [storedSubscription] = await listPushSubscriptions(server.baseUrl, ownerCookie)
    assert.ok(storedSubscription)

    const tooLongAlias = 'A'.repeat(31)
    const renameResponse = await patchJson(
      `${server.baseUrl}/codex-api/pwa/subscriptions/${encodeURIComponent(storedSubscription.id)}`,
      { deviceAlias: tooLongAlias },
      { Cookie: ownerCookie },
    )
    assert.equal(renameResponse.status, 400)
    const renameBody = await renameResponse.json()
    assert.match(renameBody.error, /30 characters or fewer/u)
  } finally {
    await server.stop()
  }
})
