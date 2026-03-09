import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
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

async function startServer({ passwordHash, codeHome, username = 'admin' }) {
  const port = await getAvailablePort()
  const resolvedCodeHome = codeHome ?? await mkdtemp(join(tmpdir(), 'codexui-admin-recovery-'))
  const child = spawn('node', ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--username', username, '--password-hash', passwordHash], {
    cwd: repoRoot,
    env: createBaseEnv({ CODEX_HOME: resolvedCodeHome }),
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
    codeHome: resolvedCodeHome,
    async stop() {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await new Promise((resolvePromise) => child.once('close', resolvePromise))
    },
  }
}

async function startServerWithoutBootstrap({ codeHome }) {
  const port = await getAvailablePort()
  const child = spawn('node', ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--no-password'], {
    cwd: repoRoot,
    env: createBaseEnv({ CODEX_HOME: codeHome }),
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

function querySqlite(databasePath, sql, params = []) {
  const database = new Database(databasePath, { readonly: true })
  try {
    return database.prepare(sql).all(...params)
  } finally {
    database.close()
  }
}

test('admin-assisted recovery resets password, revokes sessions, and stores audit event', async () => {
  const bootstrapPassword = 'recover-bootstrap-pass-1'
  const passwordHash = await generatePasswordHash(bootstrapPassword)
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-admin-recovery-contract-'))
  const databasePath = join(codeHome, 'codexui', 'hub.sqlite')
  const server = await startServer({ passwordHash, codeHome, username: 'admin' })

  try {
    const adminLogin = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'admin',
      password: bootstrapPassword,
    })
    assert.equal(adminLogin.status, 200)
    const adminCookie = adminLogin.headers.get('set-cookie')
    assert.ok(adminCookie)

    const bootstrapComplete = await postJson(
      `${server.baseUrl}/auth/bootstrap/complete`,
      {
        currentPassword: bootstrapPassword,
        newUsername: 'primary-admin',
        newPassword: 'recover-admin-pass-2',
      },
      { Cookie: adminCookie },
    )
    assert.equal(bootstrapComplete.status, 200)

    const createUser = await postJson(
      `${server.baseUrl}/auth/signup`,
      {
        username: 'recover-user',
        password: 'recover-user-pass-1',
        role: 'user',
      },
      { Cookie: adminCookie },
    )
    assert.equal(createUser.status, 201)
    const createdPayload = await createUser.json()
    const recoverUserId = createdPayload.user.id

    const userLogin = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'recover-user',
      password: 'recover-user-pass-1',
    })
    assert.equal(userLogin.status, 200)
    const userCookie = userLogin.headers.get('set-cookie')
    assert.ok(userCookie)

    const recoverResponse = await postJson(
      `${server.baseUrl}/codex-api/admin/users/${encodeURIComponent(recoverUserId)}/reset-password`,
      {
        newPassword: 'recover-user-pass-2',
        reason: 'User lost access to local password vault',
      },
      { Cookie: adminCookie },
    )
    assert.equal(recoverResponse.status, 200)

    const oldPasswordLogin = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'recover-user',
      password: 'recover-user-pass-1',
    })
    assert.equal(oldPasswordLogin.status, 401)

    const revokedSessionResponse = await fetch(`${server.baseUrl}/auth/session`, {
      headers: {
        Accept: 'application/json',
        Cookie: userCookie,
      },
    })
    assert.equal(revokedSessionResponse.status, 200)
    const revokedSessionPayload = await revokedSessionResponse.json()
    assert.equal(revokedSessionPayload.authenticated, false)

    const newPasswordLogin = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'recover-user',
      password: 'recover-user-pass-2',
    })
    assert.equal(newPasswordLogin.status, 200)

    const auditRows = querySqlite(databasePath, `
      SELECT actor_user_id AS actorUserId,
             actor_type AS actorType,
             target_user_id AS targetUserId,
             target_username AS targetUsername,
             event_type AS eventType,
             reason,
             metadata_json AS metadataJson
      FROM auth_recovery_audit
      ORDER BY created_at_iso ASC
    `)
    assert.equal(auditRows.length, 1)
    assert.equal(auditRows[0].actorUserId.length > 0, true)
    assert.equal(auditRows[0].actorType, 'admin_api')
    assert.equal(auditRows[0].targetUserId, recoverUserId)
    assert.equal(auditRows[0].targetUsername, 'recover-user')
    assert.equal(auditRows[0].eventType, 'admin_password_reset')
    assert.match(auditRows[0].reason, /lost access/i)
    assert.match(auditRows[0].metadataJson, /revokedSessionCount/)
  } finally {
    await server.stop()
  }
})

test('admin recovery rejects non-admin callers', async () => {
  const bootstrapPassword = 'recover-bootstrap-pass-2'
  const passwordHash = await generatePasswordHash(bootstrapPassword)
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-admin-recovery-reject-'))
  const server = await startServer({ passwordHash, codeHome, username: 'admin' })

  try {
    const adminLogin = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'admin',
      password: bootstrapPassword,
    })
    assert.equal(adminLogin.status, 200)
    const adminCookie = adminLogin.headers.get('set-cookie')
    assert.ok(adminCookie)

    const bootstrapComplete = await postJson(
      `${server.baseUrl}/auth/bootstrap/complete`,
      {
        currentPassword: bootstrapPassword,
        newUsername: 'primary-admin',
        newPassword: 'recover-admin-pass-3',
      },
      { Cookie: adminCookie },
    )
    assert.equal(bootstrapComplete.status, 200)

    const createUser = await postJson(
      `${server.baseUrl}/auth/signup`,
      {
        username: 'non-admin-user',
        password: 'non-admin-pass-1',
        role: 'user',
      },
      { Cookie: adminCookie },
    )
    assert.equal(createUser.status, 201)
    const createdPayload = await createUser.json()
    const recoverUserId = createdPayload.user.id

    const userLogin = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'non-admin-user',
      password: 'non-admin-pass-1',
    })
    assert.equal(userLogin.status, 200)
    const userCookie = userLogin.headers.get('set-cookie')
    assert.ok(userCookie)

    const forbiddenResponse = await postJson(
      `${server.baseUrl}/codex-api/admin/users/${encodeURIComponent(recoverUserId)}/reset-password`,
      {
        newPassword: 'non-admin-pass-2',
        reason: 'Should not be allowed',
      },
      { Cookie: userCookie },
    )
    assert.equal(forbiddenResponse.status, 403)
  } finally {
    await server.stop()
  }
})

test('local CLI last-admin recovery resets password, revokes sessions, and stores audit event', async () => {
  const bootstrapPassword = 'recover-bootstrap-pass-3'
  const passwordHash = await generatePasswordHash(bootstrapPassword)
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-last-admin-recovery-'))
  const databasePath = join(codeHome, 'codexui', 'hub.sqlite')
  const server = await startServer({ passwordHash, codeHome, username: 'admin' })
  let adminCookie = ''

  try {
    const adminLogin = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'admin',
      password: bootstrapPassword,
    })
    assert.equal(adminLogin.status, 200)
    adminCookie = adminLogin.headers.get('set-cookie') ?? ''
    assert.ok(adminCookie)

    const bootstrapComplete = await postJson(
      `${server.baseUrl}/auth/bootstrap/complete`,
      {
        currentPassword: bootstrapPassword,
        newUsername: 'steady-admin',
        newPassword: 'steady-admin-pass-1',
      },
      { Cookie: adminCookie },
    )
    assert.equal(bootstrapComplete.status, 200)
  } finally {
    await server.stop()
  }

  const cliRecovery = await runCommand(
    ['dist-cli/index.js', 'admin-recover', '--admin-username', 'steady-admin', '--password-stdin', '--reason', 'Last admin lost password access'],
    {
      env: { CODEX_HOME: codeHome },
      input: 'steady-admin-pass-2',
    },
  )
  assert.equal(cliRecovery.exitCode, 0, cliRecovery.stderr || cliRecovery.stdout)

  const restartedServer = await startServerWithoutBootstrap({ codeHome })
  try {
    const staleSessionResponse = await fetch(`${restartedServer.baseUrl}/auth/session`, {
      headers: {
        Accept: 'application/json',
        Cookie: adminCookie,
      },
    })
    assert.equal(staleSessionResponse.status, 200)
    const staleSessionPayload = await staleSessionResponse.json()
    assert.equal(staleSessionPayload.authenticated, false)

    const oldPasswordLogin = await postJson(`${restartedServer.baseUrl}/auth/login`, {
      username: 'steady-admin',
      password: 'steady-admin-pass-1',
    })
    assert.equal(oldPasswordLogin.status, 401)

    const newPasswordLogin = await postJson(`${restartedServer.baseUrl}/auth/login`, {
      username: 'steady-admin',
      password: 'steady-admin-pass-2',
    })
    assert.equal(newPasswordLogin.status, 200)

    const auditRows = querySqlite(databasePath, `
      SELECT actor_user_id AS actorUserId,
             actor_type AS actorType,
             target_username AS targetUsername,
             event_type AS eventType,
             reason,
             metadata_json AS metadataJson
      FROM auth_recovery_audit
      ORDER BY created_at_iso ASC
    `)
    assert.equal(auditRows.length, 1)
    assert.equal(auditRows[0].actorUserId, null)
    assert.equal(auditRows[0].actorType, 'local_cli')
    assert.equal(auditRows[0].targetUsername, 'steady-admin')
    assert.equal(auditRows[0].eventType, 'last_admin_cli_recovery')
    assert.match(auditRows[0].reason, /last admin/i)
    assert.match(auditRows[0].metadataJson, /revokedSessionCount/)
  } finally {
    await restartedServer.stop()
  }
})
