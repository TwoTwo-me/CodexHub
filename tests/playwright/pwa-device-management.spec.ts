import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || '.artifacts/screenshots'

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

type MockSubscriptionRow = {
  id: string
  endpoint: string
  createdAtIso: string
  updatedAtIso: string
  deviceAlias?: string
  platform?: string
  userAgent?: string
  lastSuccessAtIso?: string
  lastFailureAtIso?: string
  failureCount?: number
}

test.beforeEach(async ({ page }) => {
  const subscriptionState: { rows: MockSubscriptionRow[] } = {
    rows: [
      {
        id: 'sub-current',
        endpoint: 'https://push.example.test/subscriptions/current',
        createdAtIso: '2026-03-08T13:15:00.000Z',
        updatedAtIso: '2026-03-08T13:15:00.000Z',
        deviceAlias: 'Desk Chrome',
        platform: 'Windows',
        userAgent: 'Mozilla/5.0 Chrome/135.0',
        lastSuccessAtIso: '2026-03-08T13:16:00.000Z',
        failureCount: 0,
      },
      {
        id: 'sub-iphone',
        endpoint: 'https://push.example.test/subscriptions/iphone',
        createdAtIso: '2026-03-07T10:10:00.000Z',
        updatedAtIso: '2026-03-08T11:11:00.000Z',
        deviceAlias: 'iPhone Safari',
        platform: 'iPhone',
        userAgent: 'Mozilla/5.0 Version/17.0 Mobile/15E148 Safari/604.1',
        lastFailureAtIso: '2026-03-08T12:00:00.000Z',
        failureCount: 2,
      },
    ],
  }

  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')

    class MockPushSubscription {
      endpoint = 'https://push.example.test/subscriptions/current'
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

      async unsubscribe() {
        ;(window as typeof window & { __mockPushUnsubscribed?: boolean }).__mockPushUnsubscribed = true
        ;(window as typeof window & { __mockPushSubscribed?: boolean }).__mockPushSubscribed = false
        return true
      }
    }

    const currentSubscription = new MockPushSubscription()
    ;(window as typeof window & { __mockPushSubscribed?: boolean }).__mockPushSubscribed = true
    ;(window as typeof window & { __mockPushUnsubscribed?: boolean }).__mockPushUnsubscribed = false

    class MockPushManager {
      async subscribe() {
        ;(window as typeof window & { __mockPushSubscribed?: boolean }).__mockPushSubscribed = true
        return currentSubscription
      }

      async getSubscription() {
        return (window as typeof window & { __mockPushSubscribed?: boolean }).__mockPushSubscribed === false
          ? null
          : currentSubscription
      }
    }

    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      get() {
        return 'granted'
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
          servers: [{ id: 'server-a', label: 'Server A', description: 'PWA VM', transport: 'relay' }],
        },
      }),
    })
  })

  await page.route('**/codex-api/workspace-roots-state**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { order: [], labels: {}, active: [] } }) })
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

  await page.route('**/codex-api/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' },
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [{ id: 'gpt-5-codex', model: 'gpt-5-codex' }] } }) })
      return
    }
    if (method === 'config/read') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { config: { model: 'gpt-5-codex', model_reasoning_effort: 'medium' } } }) })
      return
    }
    if (method === 'skills/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })

  await page.route('**/codex-api/connectors?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { connectors: [] } }) })
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { subscriptions: subscriptionState.rows } }) })
      return
    }

    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const endpoint = body.subscription.endpoint as string
      const existing = subscriptionState.rows.find((row) => row.endpoint === endpoint)
      const nextRow = existing ?? {
        id: 'sub-current',
        endpoint,
        createdAtIso: '2026-03-08T13:15:00.000Z',
        updatedAtIso: '2026-03-08T13:15:00.000Z',
        deviceAlias: 'Desk Chrome',
        platform: body.platform,
        userAgent: body.userAgent,
        lastSuccessAtIso: '2026-03-08T13:16:00.000Z',
        failureCount: 0,
      }
      nextRow.updatedAtIso = '2026-03-08T13:20:00.000Z'
      subscriptionState.rows = [nextRow, ...subscriptionState.rows.filter((row) => row.id !== nextRow.id)]
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: nextRow }) })
      return
    }

    await route.fallback()
  })

  await page.route('**/codex-api/pwa/subscriptions/*', async (route) => {
    const url = new URL(route.request().url())
    const subscriptionId = url.pathname.split('/').pop() ?? ''

    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON()
      subscriptionState.rows = subscriptionState.rows.map((row) => (
        row.id === subscriptionId
          ? { ...row, deviceAlias: String(body.deviceAlias ?? '').trim(), updatedAtIso: '2026-03-09T08:30:00.000Z' }
          : row
      ))
      const updated = subscriptionState.rows.find((row) => row.id === subscriptionId)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: updated }) })
      return
    }

    if (route.request().method() === 'DELETE') {
      subscriptionState.rows = subscriptionState.rows.filter((row) => row.id !== subscriptionId)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }

    await route.fallback()
  })
})

test('settings page shows all notification devices and allows alias edits', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  await page.getByRole('tab', { name: 'Browser notifications' }).click()
  await expect(page.getByRole('heading', { name: 'Browser notifications' })).toBeVisible()
  await expect(page.locator('.notification-device-name', { hasText: 'Desk Chrome' })).toBeVisible()
  await expect(page.locator('.notification-device-name', { hasText: 'iPhone Safari' })).toBeVisible()
  await expect(page.getByText('Current browser')).toBeVisible()

  await page.getByRole('button', { name: 'Edit alias for iPhone Safari' }).click()
  await expect(page.getByLabel('Device alias')).toHaveAttribute('maxlength', '30')
  await page.getByLabel('Device alias').fill('Team iPhone')
  await page.getByRole('button', { name: 'Save alias' }).click()
  await expect(page.locator('.notification-device-name', { hasText: 'Team iPhone' })).toBeVisible()
  await expect(page.getByText('This device may be stale.')).toBeVisible()

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/pwa-device-management-desktop.png`,
    fullPage: true,
  })
})

test('deleting the current browser device unsubscribes the local push subscription', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  await page.getByRole('tab', { name: 'Browser notifications' }).click()
  await page.getByRole('button', { name: 'Delete device Desk Chrome' }).click()
  await expect(page.getByText('Notifications disabled for this browser.')).toBeVisible()
  await expect(page.getByText('Desk Chrome')).toHaveCount(0)
  expect(await page.evaluate(() => (window as typeof window & { __mockPushUnsubscribed?: boolean }).__mockPushUnsubscribed === true)).toBeTruthy()
})
