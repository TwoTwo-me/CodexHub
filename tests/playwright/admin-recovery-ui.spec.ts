import { expect, test } from '@playwright/test'
import { mkdirSync, rmSync, mkdtempSync } from 'node:fs'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || '.artifacts/screenshots'
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

type RunningServer = {
  baseUrl: string
  codeHome: string
  child: ChildProcessWithoutNullStreams
  bootstrapUsername: string
  bootstrapPassword: string
  adminUsername: string
  adminPassword: string
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

async function getAvailablePort(): Promise<number> {
  const server = createServer((_req, res) => {
    res.statusCode = 204
    res.end()
  })
  await new Promise<void>((resolvePromise, reject) => {
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
    throw new Error('Failed to allocate port')
  }
  await new Promise<void>((resolvePromise, reject) => {
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

async function runCommand(args: string[], input?: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const child = spawn('node', args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEXUI_SKIP_CODEX_LOGIN: 'true',
      CODEXUI_OPEN_BROWSER: 'false',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.stdin.end(input ?? '')

  const exitCode = await new Promise<number | null>((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('close', resolvePromise)
  })

  return { exitCode, stdout, stderr }
}

async function generatePasswordHash(password: string): Promise<string> {
  const result = await runCommand(['dist-cli/index.js', 'hash-password', '--password-stdin'], password)
  expect(result.exitCode, result.stderr || result.stdout).toBe(0)
  return result.stdout.trim()
}

async function waitForServerReady(baseUrl: string, child: ChildProcessWithoutNullStreams): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early (${String(child.exitCode)})`)
    }
    try {
      const response = await fetch(`${baseUrl}/auth/session`)
      if (response.ok) return
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }
  throw new Error(`Timed out waiting for ${baseUrl}`)
}

async function startServerInstance(): Promise<RunningServer> {
  const port = await getAvailablePort()
  const codeHome = mkdtempSync(join(tmpdir(), 'codexui-admin-recovery-ui-'))
  const bootstrapUsername = 'admin'
  const bootstrapPassword = 'admin-ui-pass-1'
  const adminUsername = 'primary-admin'
  const adminPassword = 'primary-admin-pass-2'
  const passwordHash = await generatePasswordHash(bootstrapPassword)
  const child = spawn('node', ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--username', bootstrapUsername, '--password-hash', passwordHash], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_HOME: codeHome,
      CODEXUI_SKIP_CODEX_LOGIN: 'true',
      CODEXUI_OPEN_BROWSER: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  const baseUrl = `http://127.0.0.1:${String(port)}`
  await waitForServerReady(baseUrl, child)

  return {
    baseUrl,
    codeHome,
    child,
    bootstrapUsername,
    bootstrapPassword,
    adminUsername,
    adminPassword,
  }
}

async function stopServer(server: RunningServer): Promise<void> {
  if (server.child.exitCode === null) {
    server.child.kill('SIGTERM')
    await new Promise<void>((resolvePromise) => server.child.once('close', () => resolvePromise()))
  }
  rmSync(server.codeHome, { recursive: true, force: true })
}

async function postJson(url: string, payload: Record<string, unknown>, headers: Record<string, string> = {}) {
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

async function completeBootstrap(server: RunningServer): Promise<string> {
  const loginResponse = await postJson(`${server.baseUrl}/auth/login`, {
    username: server.bootstrapUsername,
    password: server.bootstrapPassword,
  })
  expect(loginResponse.status).toBe(200)
  const adminCookie = loginResponse.headers.get('set-cookie') ?? ''
  expect(adminCookie).not.toBe('')

  const completeResponse = await postJson(
    `${server.baseUrl}/auth/bootstrap/complete`,
    {
      currentPassword: server.bootstrapPassword,
      newUsername: server.adminUsername,
      newPassword: server.adminPassword,
    },
    { Cookie: adminCookie },
  )
  expect(completeResponse.status).toBe(200)
  return adminCookie
}

async function createApprovedUser(server: RunningServer, adminCookie: string, username: string, password: string): Promise<void> {
  const response = await postJson(
    `${server.baseUrl}/auth/signup`,
    {
      username,
      password,
      role: 'user',
    },
    { Cookie: adminCookie },
  )
  expect(response.status).toBe(201)
}

async function loginViaUi(page: import('@playwright/test').Page, baseUrl: string, username: string, password: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('admin recovery UI', () => {
  test.setTimeout(120_000)

  let server: RunningServer

  test.beforeAll(async () => {
    server = await startServerInstance()
  })

  test.afterAll(async () => {
    await stopServer(server)
  })

  test('admin can reset a user password from AdminPanel and revoke active sessions', async ({ browser, page }) => {
    ensureDir(SCREENSHOT_DIR)
    const adminCookie = await completeBootstrap(server)
    await createApprovedUser(server, adminCookie, 'recover-ui-user', 'recover-ui-pass-1')

    const recoveredContext = await browser.newContext()
    const recoveredPage = await recoveredContext.newPage()
    await loginViaUi(recoveredPage, server.baseUrl, 'recover-ui-user', 'recover-ui-pass-1')
    await expect(recoveredPage.getByText('recover-ui-user (user)')).toBeVisible({ timeout: 20_000 })

    await page.setViewportSize({ width: 1440, height: 960 })
    await loginViaUi(page, server.baseUrl, server.adminUsername, server.adminPassword)
    await expect(page.getByText(`${server.adminUsername} (admin)`)).toBeVisible({ timeout: 20_000 })
    await page.goto(`${server.baseUrl}/admin`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()

    await page.getByRole('button', { name: 'Reset password for recover-ui-user' }).click()
    await page.getByLabel('Replacement password').fill('recover-ui-pass-2')
    await page.getByLabel('Recovery reason').fill('User lost local password access')
    await page.getByRole('button', { name: 'Confirm reset' }).click()
    await expect(page.getByText('password reset completed. Existing sessions were revoked.')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1200)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/admin-recovery-ui-desktop.png`,
      fullPage: true,
    })

    await recoveredPage.reload({ waitUntil: 'domcontentloaded' })
    await expect(recoveredPage.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 20_000 })

    await loginViaUi(recoveredPage, server.baseUrl, 'recover-ui-user', 'recover-ui-pass-1')
    await expect(recoveredPage.getByText('Invalid credentials')).toBeVisible({ timeout: 20_000 })
    await recoveredPage.getByLabel('Password', { exact: true }).fill('recover-ui-pass-2')
    await recoveredPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(recoveredPage.getByText('recover-ui-user (user)')).toBeVisible({ timeout: 20_000 })

    await recoveredContext.close()
  })
})
