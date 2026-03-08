import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || '.artifacts/screenshots'

type HookServerState = {
  methods: string[]
  config: {
    approval_policy?: string
    sandbox_mode?: string
    model?: string
    model_reasoning_effort?: string
  }
  requirements?: {
    allowedApprovalPolicies?: string[]
    allowedSandboxModes?: string[]
    network?: {
      enabled?: boolean
      allowedDomains?: string[]
      deniedDomains?: string[]
      allowLocalBinding?: boolean
    }
  } | null
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

async function mockSettingsTabsApi(page: Page, state: { byServerId: Record<string, HookServerState> }): Promise<void> {
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
          id: 'settings-tabs-user',
          username: 'settings-tabs-user',
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
          defaultServerId: 'relay-primary',
          servers: [
            { id: 'relay-primary', label: 'Relay Primary', description: 'Main relay server', transport: 'relay' },
            { id: 'legacy-box', label: 'Legacy Box', description: 'Older connector build', transport: 'relay' },
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    })
  })

  await page.route('**/codex-api/meta/notifications', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })

  await page.route('**/codex-api/events**', async (route) => {
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

  await page.route('**/codex-api/meta/methods', async (route) => {
    const serverId = route.request().headers()['x-codex-server-id'] || 'relay-primary'
    const methods = state.byServerId[serverId]?.methods ?? []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: methods }),
    })
  })

  await page.route('**/codex-api/rpc', async (route) => {
    const serverId = route.request().headers()['x-codex-server-id'] || 'relay-primary'
    const requestBody = route.request().postDataJSON() as { method?: string; params?: unknown }
    const method = requestBody.method
    const serverState = state.byServerId[serverId]

    if (method === 'thread/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) })
      return
    }
    if (method === 'model/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [{ id: 'gpt-5-codex', model: 'gpt-5-codex' }] } }) })
      return
    }
    if (method === 'skills/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) })
      return
    }
    if (method === 'config/read') {
      if (!serverState?.methods.includes('config/read')) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Method config/read not supported' }) })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            config: {
              model: serverState.config.model ?? 'gpt-5-codex',
              model_reasoning_effort: serverState.config.model_reasoning_effort ?? 'medium',
              approval_policy: serverState.config.approval_policy ?? 'on-request',
              sandbox_mode: serverState.config.sandbox_mode ?? 'workspace-write',
            },
            origins: {
              approval_policy: { name: { type: 'user', file: '/home/demo/.codex/config.toml' }, version: 'v1' },
              sandbox_mode: { name: { type: 'project', dotCodexFolder: '/workspace/.codex' }, version: 'v2' },
            },
            layers: null,
          },
        }),
      })
      return
    }
    if (method === 'configRequirements/read') {
      if (!serverState?.methods.includes('configRequirements/read')) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Method configRequirements/read not supported' }) })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { requirements: serverState.requirements ?? null } }),
      })
      return
    }
    if (method === 'config/batchWrite') {
      if (!serverState?.methods.includes('config/batchWrite')) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Method config/batchWrite not supported' }) })
        return
      }
      const edits = Array.isArray((requestBody.params as { edits?: unknown[] } | undefined)?.edits)
        ? (requestBody.params as { edits: Array<{ keyPath?: string; value?: unknown }> }).edits
        : []
      for (const edit of edits) {
        if (edit.keyPath === 'approval_policy' && typeof edit.value === 'string') {
          serverState.config.approval_policy = edit.value
        }
        if (edit.keyPath === 'sandbox_mode' && typeof edit.value === 'string') {
          serverState.config.sandbox_mode = edit.value
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { status: 'updated', version: 'next', filePath: '/home/demo/.codex/config.toml', overriddenMetadata: null } }),
      })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })

  await page.route('**/codex-api/connectors?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          connectors: [
            {
              id: 'relay-primary',
              serverId: 'relay-primary',
              name: 'Relay Primary',
              hubAddress: 'https://hub.example.test',
              relayAgentId: 'agent-relay-primary',
              connected: true,
              installState: 'connected',
              projectCount: 3,
              threadCount: 7,
              createdAtIso: '2026-03-09T08:00:00.000Z',
              updatedAtIso: '2026-03-09T08:00:00.000Z',
              lastSeenAtIso: '2026-03-09T08:10:00.000Z',
            },
          ],
        },
      }),
    })
  })

  await page.route('**/codex-api/connectors', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { connectors: [] } }) })
  })

  await page.route('**/codex-api/pwa/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { vapidPublicKey: 'test-key', subject: 'mailto:hub@example.test' } }),
    })
  })

  await page.route('**/codex-api/pwa/subscriptions', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { subscriptions: [] } }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.route('**/codex-api/pwa/subscriptions/*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
}

test('settings splits into tabs and hook settings follow selected server capabilities', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)

  await mockSettingsTabsApi(page, {
    byServerId: {
      'relay-primary': {
        methods: ['config/read', 'configRequirements/read', 'config/batchWrite'],
        config: {
          approval_policy: 'on-request',
          sandbox_mode: 'workspace-write',
          model: 'gpt-5-codex',
          model_reasoning_effort: 'medium',
        },
        requirements: {
          allowedApprovalPolicies: ['untrusted', 'on-request'],
          allowedSandboxModes: ['read-only', 'workspace-write'],
          network: {
            enabled: true,
            allowedDomains: ['api.openai.com'],
            deniedDomains: ['example.com'],
            allowLocalBinding: false,
          },
        },
      },
      'legacy-box': {
        methods: ['thread/list', 'model/list'],
        config: {
          approval_policy: 'never',
          sandbox_mode: 'danger-full-access',
        },
      },
    },
  })

  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('tab', { name: 'Connector Control' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Browser notifications' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Hook settings' })).toBeVisible()

  await page.getByRole('tab', { name: 'Browser notifications' }).click()
  await expect(page.getByRole('heading', { name: 'Browser notifications' })).toBeVisible()

  await page.getByRole('tab', { name: 'Hook settings' }).click()
  await expect(page.getByRole('heading', { name: 'Hook settings' })).toBeVisible()
  await expect(page.getByLabel('Approval policy')).toHaveValue('on-request')
  await expect(page.getByLabel('Sandbox mode')).toHaveValue('workspace-write')
  await expect(page.locator('select[aria-label="Approval policy"] option[value="never"]')).toHaveAttribute('disabled', '')
  await expect(page.locator('select[aria-label="Sandbox mode"] option[value="danger-full-access"]')).toHaveAttribute('disabled', '')
  await expect(page.getByText('Allowed outbound domains')).toBeVisible()

  await page.getByLabel('Sandbox mode').selectOption('read-only')
  await page.getByRole('button', { name: 'Save hook settings' }).click()
  await expect(page.getByText('Hook settings saved.')).toBeVisible()
  await expect(page.getByLabel('Sandbox mode')).toHaveValue('read-only')

  await page.locator('.settings-hook-server-picker select').selectOption('legacy-box')
  await expect(page.getByText(/does not expose the App Server config methods/i)).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 1024 })
  await page.screenshot({ path: `${SCREENSHOT_DIR}/settings-hook-settings-tab-desktop.png`, fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Hook settings' })).toBeVisible()
  await page.screenshot({ path: `${SCREENSHOT_DIR}/settings-hook-settings-tab-mobile.png`, fullPage: true })
})
