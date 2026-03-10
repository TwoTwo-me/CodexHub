import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || '.artifacts/screenshots'

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: 'panel-user',
          username: 'panel-user',
          role: 'user',
        },
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

  await page.route('**/codex-api/thread-titles', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { titles: {}, order: [] } }),
    })
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
    const requestBody = route.request().postDataJSON()
    const method = requestBody.method

    if (method === 'thread/list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: [
              {
                id: 'thread-alpha',
                cwd: '/srv/server-a/project-alpha',
                createdAt: 1_735_600_000,
                updatedAt: 1_735_600_100,
                preview: 'Alpha overview',
              },
            ],
          },
        }),
      })
      return
    }

    if (method === 'thread/read') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            thread: {
              id: 'thread-alpha',
              cwd: '/srv/server-a/project-alpha',
              turns: [
                {
                  id: 'thread-alpha-turn-1',
                  items: [
                    { id: 'thread-alpha-user', type: 'userMessage', content: [{ type: 'text', text: 'hello' }] },
                    { id: 'thread-alpha-assistant', type: 'agentMessage', text: 'response' },
                  ],
                },
              ],
            },
          },
        }),
      })
      return
    }

    if (method === 'thread/resume' || method === 'model/list' || method === 'config/read' || method === 'skills/list') {
      const result = method === 'model/list'
        ? { data: [{ id: 'gpt-5-codex', model: 'gpt-5-codex' }] }
        : method === 'config/read'
          ? { config: { model: 'gpt-5-codex', model_reasoning_effort: 'medium' } }
          : method === 'skills/list'
            ? { data: [] }
            : {}
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })
})

test('thread route shows review, scope, and changes shell toggles', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/thread/thread-alpha`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await expect(page.getByRole('button', { name: 'Review' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Scope' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Changes' })).toBeVisible()
  await expect(page.getByText('Review to chat').first()).toBeVisible()
  await expect(page.getByLabel('Scope browser panel')).toBeVisible()
  await expect(page.getByLabel('Change navigator panel')).toBeVisible()

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/thread-panel-layout-desktop.png`,
    fullPage: true,
  })
})
