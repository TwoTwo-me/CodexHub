import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  if (!address || typeof address === 'string') {
    throw new Error('Failed to allocate port')
  }
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

async function runGit(cwd, args) {
  const child = spawn('git', args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
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
  const codeHome = await mkdtemp(join(tmpdir(), 'codexui-thread-review-'))
  const passwordHash = await generatePasswordHash('review-secret-pass-1')
  const child = spawn(process.execPath, ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--username', 'review-admin', '--password-hash', passwordHash], {
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

async function createReviewRepo() {
  const repoDir = await mkdtemp(join(tmpdir(), 'codexui-review-repo-'))
  await runGit(repoDir, ['init'])
  await runGit(repoDir, ['config', 'user.email', 'review@example.com'])
  await runGit(repoDir, ['config', 'user.name', 'Review Tester'])
  await writeFile(join(repoDir, 'README.md'), '# hello\n')
  await runGit(repoDir, ['add', 'README.md'])
  await runGit(repoDir, ['commit', '-m', 'init'])
  await writeFile(join(repoDir, 'README.md'), '# hello\n\nupdated\n')
  await writeFile(join(repoDir, 'notes.txt'), 'pending review\n')
  return repoDir
}

test('thread review API reports git change metadata and file review payloads', async () => {
  const server = await startServer()
  const repoDir = await createReviewRepo()
  const plainDir = await mkdtemp(join(tmpdir(), 'codexui-review-plain-'))

  try {
    const loginResponse = await postJson(`${server.baseUrl}/auth/login`, {
      username: 'review-admin',
      password: 'review-secret-pass-1',
    })
    assert.equal(loginResponse.status, 200)
    const cookie = loginResponse.headers.get('set-cookie')
    assert.ok(cookie)

    const completeSetup = await postJson(
      `${server.baseUrl}/auth/bootstrap/complete`,
      {
        currentPassword: 'review-secret-pass-1',
        newUsername: 'review-admin-main',
        newPassword: 'review-secret-pass-2',
      },
      { Cookie: cookie },
    )
    assert.equal(completeSetup.status, 200)

    const registerServerResponse = await postJson(
      `${server.baseUrl}/codex-api/servers`,
      { id: 'local-review', name: 'Local Review', transport: 'local', makeDefault: true },
      { Cookie: cookie },
    )
    assert.equal(registerServerResponse.status, 201)

    const nonGitResponse = await fetch(`${server.baseUrl}/codex-api/thread-review/changes?serverId=local-review&cwd=${encodeURIComponent(plainDir)}`, {
      headers: { Cookie: cookie },
    })
    assert.equal(nonGitResponse.status, 200)
    const nonGitPayload = await nonGitResponse.json()
    assert.equal(nonGitPayload.data.isGitRepo, false)
    assert.deepEqual(nonGitPayload.data.files, [])

    const changesResponse = await fetch(`${server.baseUrl}/codex-api/thread-review/changes?serverId=local-review&cwd=${encodeURIComponent(repoDir)}`, {
      headers: { Cookie: cookie },
    })
    assert.equal(changesResponse.status, 200)
    const changesPayload = await changesResponse.json()
    assert.equal(changesPayload.data.isGitRepo, true)
    assert.equal(Array.isArray(changesPayload.data.files), true)
    assert.ok(changesPayload.data.files.some((row) => row.path === 'README.md'))
    assert.ok(changesPayload.data.files.some((row) => row.path === 'notes.txt'))

    const reviewResponse = await fetch(`${server.baseUrl}/codex-api/thread-review/file?serverId=local-review&cwd=${encodeURIComponent(repoDir)}&path=${encodeURIComponent('README.md')}`, {
      headers: { Cookie: cookie },
    })
    assert.equal(reviewResponse.status, 200)
    const reviewPayload = await reviewResponse.json()
    assert.equal(reviewPayload.data.isGitRepo, true)
    assert.equal(reviewPayload.data.file.path, 'README.md')
    assert.equal(typeof reviewPayload.data.file.afterText, 'string')
    assert.match(reviewPayload.data.file.afterText, /updated/)
  } finally {
    await server.stop()
    await rm(repoDir, { recursive: true, force: true })
    await rm(plainDir, { recursive: true, force: true })
  }
})
