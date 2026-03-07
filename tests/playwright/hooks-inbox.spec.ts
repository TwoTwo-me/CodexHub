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
          id: 'hook-user',
          username: 'hook-user',
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
          servers: [
            { id: 'server-a', label: 'Server A', description: 'Primary VM', transport: 'local' },
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

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          order: ['/srv/project-alpha', '/srv/project-bravo'],
          labels: {
            '/srv/project-alpha': 'Project Alpha',
            '/srv/project-bravo': 'Project Bravo',
          },
          active: ['/srv/project-alpha', '/srv/project-bravo'],
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 71,
            method: 'workspace/approve',
            params: {
              threadId: 'thread-alpha',
              turnId: 'turn-alpha',
              itemId: 'item-alpha',
            },
            receivedAtIso: '2026-03-08T11:00:00.000Z',
          },
          {
            id: 88,
            method: 'workspace/approve',
            params: {
              threadId: 'thread-bravo',
              turnId: 'turn-bravo',
              itemId: 'item-bravo',
            },
            receivedAtIso: '2026-03-08T12:00:00.000Z',
          },
        ],
      }),
    })
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
                cwd: '/srv/project-alpha',
                createdAt: 1_735_600_000,
                updatedAt: 1_735_600_100,
                preview: 'Alpha overview',
              },
              {
                id: 'thread-bravo',
                cwd: '/srv/project-bravo',
                createdAt: 1_735_700_000,
                updatedAt: 1_735_700_100,
                preview: 'Bravo overview',
              },
            ],
          },
        }),
      })
      return
    }

    if (method === 'thread/read') {
      const threadId = requestBody.params.threadId
      const cwd = threadId === 'thread-bravo' ? '/srv/project-bravo' : '/srv/project-alpha'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            thread: {
              id: threadId,
              cwd,
              turns: [
                {
                  id: `${threadId}-turn-1`,
                  items: [
                    { id: `${threadId}-user-1`, type: 'userMessage', content: [{ type: 'text', text: `hello ${threadId}` }] },
                    { id: `${threadId}-assistant-1`, type: 'agentMessage', text: `response ${threadId}` },
                  ],
                },
              ],
            },
          },
        }),
      })
      return
    }

    if (method === 'thread/resume') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
      return
    }

    if (method === 'model/list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { data: [{ id: 'gpt-5-codex', model: 'gpt-5-codex' }] } }),
      })
      return
    }

    if (method === 'config/read') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { config: { model: 'gpt-5-codex', model_reasoning_effort: 'medium' } } }),
      })
      return
    }

    if (method === 'skills/list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { data: [] } }),
      })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })
})

test('sidebar shows hook alerts and lifts the newest hooked project to the top', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await expect(page.getByRole('button', { name: /Hooks/i })).toBeVisible()
  await expect(page.locator('.hook-alert-dot[data-scope="server"]')).toBeVisible()
  await expect(page.locator('[data-project-name="project-bravo"] .hook-alert-dot[data-scope="project"]')).toBeVisible()

  const projectTitles = await page.locator('.project-group .project-title').allTextContents()
  expect(projectTitles.slice(0, 2)).toEqual(['Project Bravo', 'Project Alpha'])

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/hooks-sidebar-order-desktop.png`,
    fullPage: true,
  })
})

test('hook inbox lists newest hooks first and opens the matching thread', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /Hooks/i }).click()
  await expect(page.getByRole('heading', { name: 'Pending hooks' })).toBeVisible()

  const rows = page.locator('.hook-inbox-item')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('project-bravo')
  await expect(rows.nth(1)).toContainText('project-alpha')

  await rows.nth(0).click()
  await expect(page).toHaveURL(/\/thread\/thread-bravo$/)

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/hooks-inbox-open-thread-desktop.png`,
    fullPage: true,
  })
})
