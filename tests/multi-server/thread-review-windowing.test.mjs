import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

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
  const child = spawn(process.execPath, args, {
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
  child.stdin.end(input ?? '')
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  return { exitCode, stdout, stderr }
}

async function runGit(cwd, args) {
  const child = spawn('git', args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  assert.equal(exitCode, 0, stderr || stdout)
  return stdout.trim()
}

async function generatePasswordHash(password) {
  const result = await runCommand(['dist-cli/index.js', 'hash-password', '--password-stdin'], { input: password })
  assert.equal(result.exitCode, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

async function waitForServerReady(baseUrl, child, outputRef) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early (${String(child.exitCode)}):\n${outputRef.stdout}\n${outputRef.stderr}`)
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
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-review-windowing-'))
  const passwordHash = await generatePasswordHash('window-secret-pass-1')
  const child = spawn(process.execPath, ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--username', 'window-admin', '--password-hash', passwordHash], {
    cwd: repoRoot,
    env: createBaseEnv({ CODEX_HOME: codeHome }),
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
      await new Promise((resolve) => child.once('close', resolve))
    },
  }
}

async function postJson(url, payload, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
}

async function createReviewFixture() {
  const repoDir = await mkdtemp(join(tmpdir(), 'codexui-review-window-fixture-'))
  await runGit(repoDir, ['init'])
  await runGit(repoDir, ['config', 'user.email', 'review@example.com'])
  await runGit(repoDir, ['config', 'user.name', 'Review Tester'])
  await writeFile(join(repoDir, 'README.md'), '# hello\n')
  await runGit(repoDir, ['add', 'README.md'])
  await runGit(repoDir, ['commit', '-m', 'init'])
  await writeFile(join(repoDir, 'README.md'), '# hello\n\nupdated\n')
  await writeFile(join(repoDir, 'big.txt'), Array.from({ length: 300 }, (_, index) => `line ${index + 1}`).join('\n'))
  await writeFile(join(repoDir, 'photo.png'), Buffer.from([137, 80, 78, 71]))
  return repoDir
}

test('review document and window endpoints expose bounded metadata and line slices', async () => {
  const server = await startServer()
  const repoDir = await createReviewFixture()

  try {
    const loginResponse = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'window-admin',
      password: 'window-secret-pass-1',
    })
    assert.equal(loginResponse.status, 200)
    const cookie = loginResponse.headers.get('set-cookie')
    assert.ok(cookie)

    const completeSetup = await postJson(
      `${server.baseUrl}/auth/bootstrap/complete`,
      {
        currentPassword: 'window-secret-pass-1',
        newUsername: 'window-admin-main',
        newPassword: 'window-secret-pass-2',
      },
      { Cookie: cookie },
    )
    assert.equal(completeSetup.status, 200)

    const registerServerResponse = await postJson(
      `${server.baseUrl}/codex-api/servers`,
      { id: 'local-window', name: 'Local Window', transport: 'local', makeDefault: true },
      { Cookie: cookie },
    )
    assert.equal(registerServerResponse.status, 201)

    const documentResponse = await fetch(`${server.baseUrl}/codex-api/thread-review/document?serverId=local-window&cwd=${encodeURIComponent(repoDir)}&path=${encodeURIComponent(join(repoDir, 'big.txt'))}&source=scope`, {
      headers: { Cookie: cookie },
    })
    assert.equal(documentResponse.status, 200)
    const documentPayload = await documentResponse.json()
    assert.equal(documentPayload.data.mode, 'file')
    assert.equal(documentPayload.data.isText, true)
    assert.equal(documentPayload.data.totalLines, 300)

    const windowResponse = await fetch(`${server.baseUrl}/codex-api/thread-review/window?serverId=local-window&cwd=${encodeURIComponent(repoDir)}&path=${encodeURIComponent(join(repoDir, 'big.txt'))}&source=scope&startLine=20&lineCount=5`, {
      headers: { Cookie: cookie },
    })
    assert.equal(windowResponse.status, 200)
    const windowPayload = await windowResponse.json()
    assert.equal(windowPayload.data.startLine, 20)
    assert.deepEqual(windowPayload.data.lines, ['line 21', 'line 22', 'line 23', 'line 24', 'line 25'])

    const changeDocument = await fetch(`${server.baseUrl}/codex-api/thread-review/document?serverId=local-window&cwd=${encodeURIComponent(repoDir)}&path=${encodeURIComponent('README.md')}&source=changes`, {
      headers: { Cookie: cookie },
    })
    assert.equal(changeDocument.status, 200)
    const changePayload = await changeDocument.json()
    assert.equal(changePayload.data.mode, 'change')
    assert.equal(changePayload.data.isText, true)
    assert.ok(changePayload.data.totalLines > 0)

    const binaryDocument = await fetch(`${server.baseUrl}/codex-api/thread-review/document?serverId=local-window&cwd=${encodeURIComponent(repoDir)}&path=${encodeURIComponent(join(repoDir, 'photo.png'))}&source=scope`, {
      headers: { Cookie: cookie },
    })
    assert.equal(binaryDocument.status, 200)
    const binaryPayload = await binaryDocument.json()
    assert.equal(binaryPayload.data.isText, false)
  } finally {
    await server.stop()
    await rm(repoDir, { recursive: true, force: true })
  }
})
