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
      body: JSON.stringify({
        authenticated: true,
        user: { id: 'sidebar-user', username: 'sidebar-user', role: 'user' },
      }),
    })
  })

  await page.route('**/auth/logout', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
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
    if (route.request().method().toUpperCase() === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
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
    const serverId = route.request().headers()['x-codex-server-id'] ?? 'server-a'

    if (method === 'thread/list') {
      const data = serverId === 'server-b'
        ? [
            {
              id: 'thread-beta',
              cwd: '/srv/server-b/project-beta',
              createdAt: 1_735_800_000,
              updatedAt: 1_735_800_200,
              preview: 'Beta overview',
            },
          ]
        : [
            {
              id: 'thread-alpha',
              cwd: '/srv/server-a/project-alpha',
              createdAt: 1_735_700_000,
              updatedAt: 1_735_700_100,
              preview: 'Alpha overview',
            },
          ]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data } }) })
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

    if (method === 'skills/list' || method === 'thread/resume' || method === 'thread/read') {
      const result = method === 'thread/read'
        ? { thread: { id: serverId === 'server-b' ? 'thread-beta' : 'thread-alpha', cwd: serverId === 'server-b' ? '/srv/server-b/project-beta' : '/srv/server-a/project-alpha', turns: [] } }
        : method === 'skills/list'
          ? { data: [] }
          : {}
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })
})

test('sidebar supports multi-server expansion, inline thread rename, duplicate pinning, and cleaner project chrome', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  await expect(page.getByText('Alpha project')).toBeVisible()
  await expect(page.getByText('Projects')).toHaveCount(0)

  const alphaThreadRow = page.locator('.thread-row').filter({ hasText: 'Alpha overview' }).first()
  await alphaThreadRow.hover()
  await expect(alphaThreadRow.getByRole('button', { name: 'rename_thread' })).toBeVisible()
  await alphaThreadRow.getByRole('button', { name: 'rename_thread' }).click()
  await page.getByLabel('Rename thread').fill('Alpha thread renamed')
  await page.getByLabel('Rename thread').press('Enter')
  await expect(page.getByText('Alpha thread renamed')).toBeVisible()

  const renamedThreadRow = page.locator('.thread-row').filter({ hasText: 'Alpha thread renamed' }).first()
  await renamedThreadRow.hover()
  await renamedThreadRow.getByRole('button', { name: 'pin' }).click()
  await expect(page.getByText('Alpha thread renamed')).toHaveCount(2)

  await page.getByRole('button', { name: 'Server B' }).click()
  await page.waitForTimeout(400)
  await expect(page.getByText('Alpha project')).toBeVisible()
  await expect(page.getByText(/project-beta|Beta project/i)).toBeVisible()

  const explorerBox = await page.locator('.thread-tree-root').boundingBox()
  const secondaryLinksBox = await page.locator('.sidebar-secondary-links').boundingBox()
  expect(explorerBox).not.toBeNull()
  expect(secondaryLinksBox).not.toBeNull()
  expect((secondaryLinksBox?.y ?? 0)).toBeGreaterThan((explorerBox?.y ?? 0) + (explorerBox?.height ?? 0) - 1)

  await page.screenshot({ path: `${SCREENSHOT_DIR}/sidebar-explorer-layout-desktop.png`, fullPage: true })
})
