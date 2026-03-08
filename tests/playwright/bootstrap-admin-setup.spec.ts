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

async function startServer(): Promise<RunningServer> {
  const port = await getAvailablePort()
  const codeHome = mkdtempSync(join(tmpdir(), 'codexui-bootstrap-setup-'))
  const bootstrapUsername = 'admin'
  const bootstrapPassword = 'admin-pass-1'
  const adminUsername = 'secure-admin'
  const adminPassword = 'secure-admin-pass-2'
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

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })

  const baseUrl = `http://127.0.0.1:${String(port)}`
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early (${String(child.exitCode)}):\n${stdout}\n${stderr}`)
    }
    try {
      const response = await fetch(`${baseUrl}/auth/session`)
      if (response.ok) {
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
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }

  throw new Error(`Timed out waiting for server\n${stdout}\n${stderr}`)
}

async function stopServer(server: RunningServer): Promise<void> {
  if (server.child.exitCode === null) {
    server.child.kill('SIGTERM')
    await new Promise<void>((resolvePromise) => server.child.once('close', () => resolvePromise()))
  }
  rmSync(server.codeHome, { recursive: true, force: true })
}

test.describe('bootstrap admin setup wizard', () => {
  test.setTimeout(120_000)

  let server: RunningServer

  test.beforeAll(async () => {
    server = await startServer()
  })

  test.afterAll(async () => {
    await stopServer(server)
  })

  test('forces credential rotation before opening the app shell', async ({ page }) => {
    ensureDir(SCREENSHOT_DIR)
    await page.setViewportSize({ width: 1440, height: 960 })

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible()
    await page.getByLabel('Username', { exact: true }).fill(server.bootstrapUsername)
    await page.getByLabel('Password', { exact: true }).fill(server.bootstrapPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/setup\/bootstrap-admin/u)
    await expect(page.getByRole('heading', { name: 'Change your admin credentials' })).toBeVisible()
    await page.waitForTimeout(1200)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/bootstrap-admin-setup-wizard-desktop.png`,
      fullPage: true,
    })

    await page.getByLabel('Current password').fill(server.bootstrapPassword)
    await page.getByLabel('New admin username').fill(server.bootstrapUsername)
    await page.getByLabel('New password', { exact: true }).fill(server.bootstrapPassword)
    await page.getByLabel('Confirm new password', { exact: true }).fill(server.bootstrapPassword)
    await page.getByRole('button', { name: 'Complete setup' }).click()
    await expect(page.getByText('Choose a different admin username before continuing.')).toBeVisible()

    await page.getByLabel('New admin username').fill(server.adminUsername)
    await page.getByLabel('New password', { exact: true }).fill(server.adminPassword)
    await page.getByLabel('Confirm new password', { exact: true }).fill(server.adminPassword)
    await page.getByRole('button', { name: 'Complete setup' }).click()

    await expect(page.getByText(`${server.adminUsername} (admin)`)).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(new RegExp(`${server.baseUrl.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/?$`))
    await page.waitForTimeout(1200)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/bootstrap-admin-setup-complete-desktop.png`,
      fullPage: true,
    })
  })
})
