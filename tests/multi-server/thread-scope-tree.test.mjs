import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = '/root/analyze_codexApp/codexui'

function createBaseEnv(overrides = {}) {
  return {
    ...process.env,
    CODEXUI_SKIP_CODEX_LOGIN: 'true',
    CODEXUI_OPEN_BROWSER: 'false',
    ...overrides,
  }
}

async function getAvailablePort() {
  const server = createServer((_req, res) => {
    res.statusCode = 204
    res.end()
  })
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to allocate port')
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function runCommand(args, { input, cwd = repoRoot, env } = {}) {
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
  child.stdin.end(input ?? '')
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  return { exitCode, stdout, stderr }
}

async function generatePasswordHash(password) {
  const result = await runCommand(['dist-cli/index.js', 'hash-password', '--password-stdin'], { input: password })
  assert.equal(result.exitCode, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

async function waitForServerReady(baseUrl, child, outputRef) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early (${String(child.exitCode)}):\n${outputRef.stdout}\n${outputRef.stderr}`)
    }
    try {
      const response = await fetch(`${baseUrl}/auth/session`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for server\n${outputRef.stdout}\n${outputRef.stderr}`)
}

async function startServer() {
  const port = await getAvailablePort()
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-scope-tree-'))
  const passwordHash = await generatePasswordHash('scope-secret-pass-1')
  const child = spawn('node', ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--username', 'scope-admin', '--password-hash', passwordHash], {
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
      await new Promise((resolve) => child.once('close', resolve))
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

async function createScopeFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'codexui-scope-tree-fixture-'))
  await mkdir(join(rootDir, 'docs'))
  await mkdir(join(rootDir, 'src'))
  await mkdir(join(rootDir, 'src', 'components'), { recursive: true })
  await writeFile(join(rootDir, 'README.md'), '# scope tree\n')
  await writeFile(join(rootDir, 'photo.png'), Buffer.from([137, 80, 78, 71]))
  await writeFile(join(rootDir, 'docs', 'guide.md'), 'guide\n')
  await writeFile(join(rootDir, 'src', 'index.ts'), 'export const ok = true\n')
  await writeFile(join(rootDir, 'src', 'components', 'App.vue'), '<template />\n')
  return rootDir
}

test('scope tree returns only immediate children with file and directory metadata', async () => {
  const server = await startServer()
  const fixtureRoot = await createScopeFixture()

  try {
    const loginResponse = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'scope-admin',
      password: 'scope-secret-pass-1',
    })
    assert.equal(loginResponse.status, 200)
    const cookie = loginResponse.headers.get('set-cookie')
    assert.ok(cookie)

    const completeSetup = await postJson(
      `${server.baseUrl}/auth/bootstrap/complete`,
      {
        currentPassword: 'scope-secret-pass-1',
        newUsername: 'scope-admin-main',
        newPassword: 'scope-secret-pass-2',
      },
      { Cookie: cookie },
    )
    assert.equal(completeSetup.status, 200)

    const registerServerResponse = await postJson(
      `${server.baseUrl}/codex-api/servers`,
      { id: 'local-scope', name: 'Local Scope', transport: 'local', makeDefault: true },
      { Cookie: cookie },
    )
    assert.equal(registerServerResponse.status, 201)

    const response = await fetch(`${server.baseUrl}/codex-api/fs/tree?serverId=local-scope&cwd=${encodeURIComponent(fixtureRoot)}&path=${encodeURIComponent(fixtureRoot)}`, {
      headers: { Cookie: cookie },
    })
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.data.path, fixtureRoot)
    assert.equal(payload.data.depth, 0)
    assert.equal(Array.isArray(payload.data.entries), true)
    assert.ok(payload.data.entries.some((entry) => entry.name === 'docs' && entry.kind === 'directory' && entry.hasChildren === true && entry.depth === 1))
    assert.ok(payload.data.entries.some((entry) => entry.name === 'README.md' && entry.kind === 'file' && entry.isText === true && entry.hasChildren === false && entry.depth === 1))
    assert.ok(payload.data.entries.some((entry) => entry.name === 'photo.png' && entry.kind === 'file' && entry.isText === false && entry.hasChildren === false && entry.depth === 1))
    assert.equal(payload.data.entries.some((entry) => entry.path.endsWith('/src/components/App.vue')), false)
  } finally {
    await server.stop()
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('scope tree returns only one additional level when a child directory is requested', async () => {
  const server = await startServer()
  const fixtureRoot = await createScopeFixture()

  try {
    const loginResponse = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'scope-admin',
      password: 'scope-secret-pass-1',
    })
    assert.equal(loginResponse.status, 200)
    const cookie = loginResponse.headers.get('set-cookie')
    assert.ok(cookie)

    const completeSetup = await postJson(
      `${server.baseUrl}/auth/bootstrap/complete`,
      {
        currentPassword: 'scope-secret-pass-1',
        newUsername: 'scope-admin-main',
        newPassword: 'scope-secret-pass-2',
      },
      { Cookie: cookie },
    )
    assert.equal(completeSetup.status, 200)

    const registerServerResponse = await postJson(
      `${server.baseUrl}/codex-api/servers`,
      { id: 'local-scope', name: 'Local Scope', transport: 'local', makeDefault: true },
      { Cookie: cookie },
    )
    assert.equal(registerServerResponse.status, 201)

    const response = await fetch(`${server.baseUrl}/codex-api/fs/tree?serverId=local-scope&cwd=${encodeURIComponent(fixtureRoot)}&path=${encodeURIComponent(join(fixtureRoot, 'src'))}`, {
      headers: { Cookie: cookie },
    })
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.data.path, join(fixtureRoot, 'src'))
    assert.equal(payload.data.depth, 1)
    assert.ok(payload.data.entries.some((entry) => entry.name === 'components' && entry.kind === 'directory' && entry.depth === 2))
    assert.ok(payload.data.entries.some((entry) => entry.name === 'index.ts' && entry.kind === 'file' && entry.depth === 2))
    assert.equal(payload.data.entries.some((entry) => entry.path.endsWith('/src/components/App.vue')), false)
  } finally {
    await server.stop()
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})
