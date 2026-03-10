import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || 'artifacts/thread-review-layout'

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

const LONG_LINE = `const reallyLongLine = "${'x'.repeat(1105)}"`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
    window.localStorage.setItem('codex-web-local.selected-server-id.v1', 'server-a')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 'panel-user', username: 'panel-user', role: 'user' } }) })
  })

  await page.route('**/codex-api/servers', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { defaultServerId: 'server-a', servers: [{ id: 'server-a', label: 'Server A', description: 'Primary VM', transport: 'local' }] } }) })
  })

  await page.route('**/codex-api/workspace-roots-state**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { order: ['/srv/server-a/project-alpha'], labels: { '/srv/server-a/project-alpha': 'Project Alpha' }, active: ['/srv/server-a/project-alpha'] } }) })
  })

  await page.route('**/codex-api/thread-review/document**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') || 'src/components/App.vue'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          cwd: '/srv/server-a/project-alpha',
          path,
          source: 'changes',
          mode: 'change',
          repoRoot: '/srv/server-a/project-alpha',
          branch: 'main',
          isGitRepo: true,
          isText: true,
          totalLines: 4,
          status: 'modified',
        },
      }),
    })
  })

  await page.route('**/codex-api/thread-review/window**', async (route) => {
    const url = new URL(route.request().url())
    const startLine = Number(url.searchParams.get('startLine') || '0')
    const lineCount = Number(url.searchParams.get('lineCount') || '80')
    const lines = [
      '<template>',
      LONG_LINE,
      'const value = computeThing()'
      ,'</template>',
    ]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          cwd: '/srv/server-a/project-alpha',
          path: 'src/components/App.vue',
          source: 'changes',
          mode: 'change',
          startLine,
          lineCount,
          totalLines: lines.length,
          lines: lines.slice(startLine, startLine + lineCount),
        },
      }),
    })
  })

  await page.route('**/codex-api/thread-review/changes**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          cwd: '/srv/server-a/project-alpha',
          repoRoot: '/srv/server-a/project-alpha',
          branch: 'main',
          isGitRepo: true,
          files: [{ path: 'src/components/App.vue', status: 'modified', additions: 5, deletions: 1 }],
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
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }, body: '' })
  })
  await page.route('**/codex-api/rpc', async (route) => {
    const body = route.request().postDataJSON() as { method?: string }
    if (body.method === 'thread/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [{ id: 'thread-alpha', cwd: '/srv/server-a/project-alpha', createdAt: 1_735_600_000, updatedAt: 1_735_600_100, preview: 'Alpha overview' }] } }) })
      return
    }
    if (body.method === 'thread/read') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { thread: { id: 'thread-alpha', cwd: '/srv/server-a/project-alpha', turns: [{ id: 'thread-alpha-turn-1', items: [{ id: 'thread-alpha-user', type: 'userMessage', content: [{ type: 'text', text: 'hello' }] }, { id: 'thread-alpha-assistant', type: 'agentMessage', text: 'response' }] }] } } }) })
      return
    }
    if (body.method === 'thread/resume' || body.method === 'model/list' || body.method === 'config/read' || body.method === 'skills/list') {
      const result = body.method === 'model/list' ? { data: [{ id: 'gpt-5-codex', model: 'gpt-5-codex' }] } : body.method === 'config/read' ? { config: { model: 'gpt-5-codex', model_reasoning_effort: 'medium' } } : body.method === 'skills/list' ? { data: [] } : {}
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })
})

test('review viewer stages inline line comments as composer review chips', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/thread/thread-alpha`, { waitUntil: 'domcontentloaded' })

  const changePanel = page.getByLabel('Change navigator panel')
  await changePanel.getByRole('button', { name: 'src', exact: true }).click()
  await changePanel.getByRole('button', { name: 'components', exact: true }).click()
  await changePanel.getByRole('button', { name: /App\.vue/i }).click()

  await expect(page.getByRole('button', { name: 'Load full line' })).toBeVisible()
  await page.getByRole('button', { name: 'Load full line' }).click()
  await expect(page.getByText(/x{200}/)).toBeVisible()

  const lineRow = page.locator('.thread-review-line-row').filter({ hasText: 'const value = computeThing()' })
  await lineRow.hover()
  await expect(lineRow.getByRole('button', { name: 'Add comment' })).toBeVisible()
  await lineRow.getByRole('button', { name: 'Add comment' }).click()
  await page.getByLabel('Line 3 comment').fill('rename this helper')
  await page.getByRole('button', { name: 'Save comment' }).click()

  const reviewChip = page.locator('.thread-composer-review-chip').filter({ hasText: 'App.vue' })
  await expect(reviewChip).toBeVisible()
  await expect(reviewChip).toHaveAttribute('title', /src\/components\/App\.vue:3 rename this helper/)
  await expect(page.getByPlaceholder('Type a message... (@ for files, / for skills)')).toHaveValue('')
  await expect(page.locator('.thread-workspace-chat .thread-composer')).toBeVisible()
  await expect(page.locator('.thread-review-panel .thread-composer')).toHaveCount(0)

  await page.screenshot({ path: `${SCREENSHOT_DIR}/thread-review-line-comments-desktop.png`, fullPage: true })
})
