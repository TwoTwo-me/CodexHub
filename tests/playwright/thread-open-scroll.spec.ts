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
    window.localStorage.setItem(
      'codex-web-local.thread-scroll-state.v1',
      JSON.stringify({
        'thread-long': {
          scrollTop: 0,
          isAtBottom: false,
          scrollRatio: 0,
        },
      }),
    )
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: 'scroll-user',
          username: 'scroll-user',
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
    if (route.request().method().toUpperCase() === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          order: ['/srv/project-long'],
          labels: { '/srv/project-long': 'Project Long' },
          active: ['/srv/project-long'],
        },
      }),
    })
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
                id: 'thread-long',
                cwd: '/srv/project-long',
                createdAt: 1_735_700_000,
                updatedAt: 1_735_700_100,
                preview: 'Long thread overview',
              },
            ],
          },
        }),
      })
      return
    }

    if (method === 'thread/read') {
      const turns = Array.from({ length: 80 }, (_, index) => ({
        id: `turn-${index + 1}`,
        items: [
          { id: `user-${index + 1}`, type: 'userMessage', content: [{ type: 'text', text: `User message ${index + 1}` }] },
          { id: `assistant-${index + 1}`, type: 'agentMessage', text: `Assistant message ${index + 1}` },
        ],
      }))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { thread: { id: 'thread-long', cwd: '/srv/project-long', turns } } }),
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

test('opening a thread jumps to the latest message instead of restoring an old scroll position', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE_URL}/thread/thread-long`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  const metrics = await page.locator('.conversation-list').evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }))

  const distanceFromBottom = metrics.scrollHeight - (metrics.scrollTop + metrics.clientHeight)
  expect(distanceFromBottom).toBeLessThanOrEqual(32)

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/thread-open-scroll-bottom-desktop.png`,
    fullPage: true,
  })
})
