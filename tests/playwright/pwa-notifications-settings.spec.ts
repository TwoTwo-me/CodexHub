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

    class MockPushSubscription {
      endpoint = 'https://push.example.test/subscriptions/abc'
      expirationTime = null
      keys = {
        p256dh: 'test-p256dh',
        auth: 'test-auth',
      }

      toJSON() {
        return {
          endpoint: this.endpoint,
          expirationTime: this.expirationTime,
          keys: this.keys,
        }
      }
    }

    class MockPushManager {
      async subscribe() {
        return new MockPushSubscription()
      }

      async getSubscription() {
        return null
      }
    }

    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      get() {
        return 'default'
      },
    })

    Notification.requestPermission = async () => 'granted'

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        async register() {
          return {
            scope: '/',
            pushManager: new MockPushManager(),
          }
        },
        ready: Promise.resolve({
          scope: '/',
          pushManager: new MockPushManager(),
        }),
      },
    })
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: 'pwa-user',
          username: 'pwa-user',
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
            { id: 'server-a', label: 'Server A', description: 'PWA VM', transport: 'relay' },
          ],
        },
      }),
    })
  })

  await page.route('**/codex-api/workspace-roots-state**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { order: [], labels: {}, active: [] } }),
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) })
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })

  await page.route('**/codex-api/connectors?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { connectors: [] } }),
    })
  })

  await page.route('**/codex-api/pwa/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          vapidPublicKey: 'BEl6x46v0OQ4gkRCKM7Fyb8AZvI2pf0riDr5JKQbr7Wu6N0QyCuuBLn8cbVEE4t2o7WavTH0L7e8gR2a7a3d0mQ',
          subject: 'mailto:hub@example.test',
        },
      }),
    })
  })

  await page.route('**/codex-api/pwa/subscriptions', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { subscriptions: [] } }),
      })
      return
    }

    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            endpoint: body.subscription.endpoint,
            createdAtIso: '2026-03-08T13:15:00.000Z',
            updatedAtIso: '2026-03-08T13:15:00.000Z',
          },
        }),
      })
      return
    }

    await route.fulfill({ status: 204, body: '' })
  })
})

test('settings page can enable browser notifications through service worker subscription flow', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  await expect(page.getByText('Browser notifications')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enable notifications' })).toBeVisible()
  await page.getByRole('button', { name: 'Enable notifications' }).click()
  await expect(page.getByText('Notifications enabled for this browser.')).toBeVisible()

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/pwa-notifications-settings-desktop.png`,
    fullPage: true,
  })
})
