import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || 'artifacts/thread-review-layout'

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

test('admin link sits below Settings in the sidebar secondary links', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)

  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
    window.localStorage.setItem('codex-web-local.selected-server-id.v1', 'server-a')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: { id: 'admin-user', username: 'admin-user', role: 'admin' },
      }),
    })
  })

  await page.route('**/codex-api/servers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          defaultServerId: 'server-a',
          servers: [{ id: 'server-a', label: 'Server A', description: 'Primary VM', transport: 'local' }],
        },
      }),
    })
  })

  await page.route('**/codex-api/workspace-roots-state**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          order: ['/srv/server-a/project-alpha'],
          labels: { '/srv/server-a/project-alpha': 'Project Alpha' },
          active: ['/srv/server-a/project-alpha'],
        },
      }),
    })
  })

  for (const pattern of [
    '**/codex-api/thread-titles',
    '**/codex-api/server-requests/pending**',
    '**/codex-api/meta/methods',
    '**/codex-api/meta/notifications',
  ]) {
    await page.route(pattern, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })
  }

  await page.route('**/codex-api/thread-titles', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { titles: {}, order: [] } }) })
  })

  await page.route('**/codex-api/notifications**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
      body: '',
    })
  })

  await page.route('**/codex-api/rpc', async (route) => {
    const requestBody = route.request().postDataJSON() as { method?: string }
    const method = requestBody.method ?? ''

    if (method === 'thread/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) })
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

    if (method === 'skills/list' || method === 'thread/resume') {
      const result = method === 'skills/list' ? { data: [] } : {}
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  const secondaryLinks = page.locator('.sidebar-secondary-links')
  await expect(secondaryLinks).toBeVisible()
  await expect(secondaryLinks.getByRole('button', { name: 'Skill Manager' })).toBeVisible()
  await expect(secondaryLinks.getByRole('button', { name: 'Settings' })).toBeVisible()
  await expect(secondaryLinks.getByRole('button', { name: 'Admin' })).toBeVisible()

  const settingsBox = await secondaryLinks.getByRole('button', { name: 'Settings' }).boundingBox()
  const adminBox = await secondaryLinks.getByRole('button', { name: 'Admin' }).boundingBox()
  expect(settingsBox).not.toBeNull()
  expect(adminBox).not.toBeNull()
  expect((adminBox?.y ?? 0)).toBeGreaterThan((settingsBox?.y ?? 0))

  await page.screenshot({ path: `${SCREENSHOT_DIR}/sidebar-admin-link-layout-desktop.png`, fullPage: true })
})
