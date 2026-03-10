import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || 'artifacts/thread-review-layout'

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
    window.localStorage.setItem('codex-web-local.selected-server-id.v1', 'server-a')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user: { id: 'header-user', username: 'header-user', role: 'user' } }),
    })
  })

  await page.route('**/codex-api/servers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          defaultServerId: 'server-a',
          servers: [
            { id: 'server-a', label: 'Server A', description: 'Primary VM', transport: 'local' },
            { id: 'server-b', label: 'Server B', description: 'Secondary VM', transport: 'local' },
          ],
        },
      }),
    })
  })

  await page.route('**/codex-api/workspace-roots-state**', async (route) => {
    if (route.request().method().toUpperCase() === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }

    const serverId = route.request().headers()['x-codex-server-id'] ?? 'server-a'
    const data = serverId === 'server-b'
      ? {
          order: ['/srv/server-b/project-beta'],
          labels: { '/srv/server-b/project-beta': 'Beta project' },
          active: ['/srv/server-b/project-beta'],
        }
      : {
          order: ['/srv/server-a/project-alpha'],
          labels: { '/srv/server-a/project-alpha': 'Alpha project' },
          active: ['/srv/server-a/project-alpha'],
        }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })
  })

  await page.route('**/codex-api/thread-titles', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { titles: {}, order: [] } }) })
  })
  await page.route('**/codex-api/server-requests/pending**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })
  await page.route('**/codex-api/meta/methods', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })
  await page.route('**/codex-api/meta/notifications', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })
  await page.route('**/codex-api/notifications**', async (route) => {
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }, body: '' })
  })

  await page.route('**/codex-api/rpc', async (route) => {
    const requestBody = route.request().postDataJSON() as { method?: string }
    const method = requestBody.method ?? ''
    const serverId = route.request().headers()['x-codex-server-id'] ?? 'server-a'

    if (method === 'thread/list') {
      const data = serverId === 'server-b'
        ? []
        : [{ id: 'thread-alpha', cwd: '/srv/server-a/project-alpha', createdAt: 1_735_700_000, updatedAt: 1_735_700_100, preview: 'Alpha overview' }]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data } }) })
      return
    }

    if (method === 'thread/read') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { thread: { id: 'thread-alpha', cwd: '/srv/server-a/project-alpha', turns: [{ id: 'turn-1', items: [{ id: 'msg-1', type: 'userMessage', content: [{ type: 'text', text: 'hello' }] }, { id: 'msg-2', type: 'agentMessage', text: 'hi' }] }] } } }),
      })
      return
    }

    if (method === 'thread/resume' || method === 'skills/list') {
      const result = method === 'skills/list' ? { data: [] } : {}
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result }) })
      return
    }

    if (method === 'model/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [{ id: 'gpt-5-codex', model: 'gpt-5-codex' }] } }) })
      return
    }

    if (method === 'config/read') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { config: { model: 'gpt-5-codex', model_reasoning_effort: 'medium' } } }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })
})

test('header moves account controls into the sidebar footer and exposes editable new-thread selectors', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  await expect(page.locator('.sidebar-session-footer')).toBeVisible()
  await expect(page.locator('.sidebar-session-footer')).toContainText('header-user (user)')
  await expect(page.locator('.content-header .header-session-logout')).toHaveCount(0)
  await expect(page.locator('.header-control-row')).toBeVisible()
  await expect(page.locator('.header-control-row .server-picker-select')).toBeEnabled()
  await expect(page.locator('.header-control-row .cwd-trigger')).toBeEnabled()
  await expect(page.locator('.build-badge')).toHaveCount(0)

  const borderBottom = await page.locator('.content-header').evaluate((element) => getComputedStyle(element).borderBottomWidth)
  expect(borderBottom).toBe('1px')
})

test('thread header shows read-only server/project selectors and lower-right panel toggles', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/thread/thread-alpha`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  await expect(page.locator('.sidebar-session-footer')).toBeVisible()
  await expect(page.locator('.header-control-row .server-picker-select')).toBeDisabled()
  await expect(page.locator('.header-control-row .cwd-trigger')).toBeDisabled()
  await expect(page.locator('.header-thread-title')).toContainText('Alpha overview')
  await expect(page.locator('.header-panel-actions')).toBeVisible()

  await page.screenshot({ path: `${SCREENSHOT_DIR}/header-shell-layout-desktop.png`, fullPage: true })
})
