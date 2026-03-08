import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? ''
const USERNAME = process.env.PLAYWRIGHT_USERNAME ?? 'admin'
const PASSWORD = process.env.PLAYWRIGHT_PASSWORD ?? ''
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || '.artifacts/screenshots'
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

type RunningServer = {
  baseUrl: string
  username: string
  password: string
  bootstrapUsername: string
  bootstrapPassword: string
  rotatedUsername: string
  rotatedPassword: string
  codeHome: string
  child: ChildProcessWithoutNullStreams
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

async function startFallbackHub(): Promise<RunningServer> {
  const port = await getAvailablePort()
  const codeHome = mkdtempSync(join(tmpdir(), 'codexui-admin-playwright-'))
  const bootstrapUsername = 'admin'
  const bootstrapPassword = 'admin-pass-1'
  const rotatedUsername = 'hub-admin'
  const rotatedPassword = 'hub-admin-pass-2'
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
      throw new Error(`Fallback hub exited early (${String(child.exitCode)}):\n${stdout}\n${stderr}`)
    }
    try {
      const response = await fetch(`${baseUrl}/auth/session`)
      if (response.ok) {
        return {
          baseUrl,
          username: bootstrapUsername,
          password: bootstrapPassword,
          bootstrapUsername,
          bootstrapPassword,
          rotatedUsername,
          rotatedPassword,
          codeHome,
          child,
        }
      }
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }

  throw new Error(`Timed out waiting for fallback hub\n${stdout}\n${stderr}`)
}

async function stopFallbackHub(server: RunningServer | null): Promise<void> {
  if (!server) return
  if (server.child.exitCode === null) {
    server.child.kill('SIGTERM')
    await new Promise<void>((resolvePromise) => server.child.once('close', () => resolvePromise()))
  }
  rmSync(server.codeHome, { recursive: true, force: true })
}

async function completeBootstrapSetupIfNeeded(page: import('@playwright/test').Page, runtime: RunningServer): Promise<void> {
  const setupHeading = page.getByRole('heading', { name: 'Change your admin credentials' })
  const needsSetup = await setupHeading.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false)
  if (!needsSetup) {
    return
  }

  await page.getByLabel('Current password').fill(runtime.bootstrapPassword)
  await page.getByLabel('New admin username').fill(runtime.rotatedUsername)
  await page.getByLabel('New password', { exact: true }).fill(runtime.rotatedPassword)
  await page.getByLabel('Confirm new password', { exact: true }).fill(runtime.rotatedPassword)
  await page.getByRole('button', { name: 'Complete setup' }).click()
  await expect(page.getByText(`${runtime.rotatedUsername} (admin)`)).toBeVisible({ timeout: 20_000 })
  runtime.username = runtime.rotatedUsername
  runtime.password = runtime.rotatedPassword
  await page.waitForTimeout(1200)
}

async function login(page: import('@playwright/test').Page, runtime: RunningServer): Promise<void> {
  await page.goto(runtime.baseUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await page.getByLabel('Username', { exact: true }).fill(runtime.username)
  await page.getByLabel('Password', { exact: true }).fill(runtime.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await completeBootstrapSetupIfNeeded(page, runtime)
  await expect(page.getByText(`${runtime.username} (admin)`)).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1200)
}

test.setTimeout(90_000)

test.describe('admin panel screenshots', () => {
  let fallbackHub: RunningServer | null = null
  let runtime: RunningServer

  test.beforeAll(async () => {
    if (!BASE_URL || !PASSWORD) {
      fallbackHub = await startFallbackHub()
      runtime = fallbackHub
      return
    }

    runtime = {
      baseUrl: BASE_URL,
      username: USERNAME,
      password: PASSWORD,
      bootstrapUsername: USERNAME,
      bootstrapPassword: PASSWORD,
      rotatedUsername: `${USERNAME}-primary`,
      rotatedPassword: `${PASSWORD}-rotated-1`,
      codeHome: '',
      child: null as unknown as ChildProcessWithoutNullStreams,
    }
  })

  test.afterAll(async () => {
    await stopFallbackHub(fallbackHub)
  })

  test('captures desktop admin panel screenshot', async ({ page }) => {
    ensureDir(SCREENSHOT_DIR)
    await page.setViewportSize({ width: 1440, height: 900 })
    await login(page, runtime)

    await page.goto(`${runtime.baseUrl}/admin`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
    await page.waitForTimeout(1200)

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/phase2-admin-desktop.png`,
      fullPage: true,
    })
  })

  test('captures mobile admin panel screenshot', async ({ page }) => {
    ensureDir(SCREENSHOT_DIR)
    await page.setViewportSize({ width: 375, height: 812 })
    await login(page, runtime)

    await page.goto(`${runtime.baseUrl}/admin`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
    await page.waitForTimeout(1200)

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/phase2-admin-mobile.png`,
      fullPage: true,
    })
  })
})
