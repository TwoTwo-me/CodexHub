import { expect, test } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
    window.localStorage.setItem('codex-web-local.selected-server-id.v1', 'server-a')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 'binary-user', username: 'binary-user', role: 'user' } }) })
  })
  await page.route('**/codex-api/servers', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { defaultServerId: 'server-a', servers: [{ id: 'server-a', label: 'Server A', description: 'Primary VM', transport: 'local' }] } }) })
  })
  await page.route('**/codex-api/workspace-roots-state**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { order: ['/srv/server-a/project-alpha'], labels: { '/srv/server-a/project-alpha': 'Project Alpha' }, active: ['/srv/server-a/project-alpha'] } }) })
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
  await page.route('**/codex-api/fs/tree**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', path: '/srv/server-a/project-alpha', currentPath: '/srv/server-a/project-alpha', parentPath: null, depth: 0, entries: [{ path: '/srv/server-a/project-alpha/photo.png', name: 'photo.png', kind: 'file', isText: false, hasChildren: false, depth: 1 }] } }) })
  })
  await page.route('**/codex-api/thread-review/document**', async (route) => {
    const url = new URL(route.request().url())
    const allowBinaryRaw = url.searchParams.get('allowBinaryRaw') === '1'
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', path: 'photo.png', source: 'scope', mode: 'file', repoRoot: '/srv/server-a/project-alpha', branch: 'main', isGitRepo: true, isText: allowBinaryRaw, totalLines: allowBinaryRaw ? 2 : 0, status: null } }) })
  })
  await page.route('**/codex-api/thread-review/window**', async (route) => {
    const url = new URL(route.request().url())
    const allowBinaryRaw = url.searchParams.get('allowBinaryRaw') === '1'
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', path: 'photo.png', source: 'scope', mode: 'file', startLine: 0, lineCount: 20, totalLines: allowBinaryRaw ? 2 : 0, lines: allowBinaryRaw ? ['PNG\u0000IHDR', 'raw bytes preview'] : [] } }) })
  })
  await page.route('**/codex-api/thread-review/changes**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', repoRoot: '/srv/server-a/project-alpha', branch: 'main', isGitRepo: true, files: [{ path: 'README.md', status: 'modified', additions: 1, deletions: 0 }] } }) })
  })
  await page.route('**/codex-api/rpc', async (route) => {
    const requestBody = route.request().postDataJSON() as { method?: string }
    const method = requestBody.method ?? ''
    if (method === 'thread/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [{ id: 'thread-alpha', cwd: '/srv/server-a/project-alpha', createdAt: 1_735_600_000, updatedAt: 1_735_600_100, preview: 'Alpha overview' }] } }) })
      return
    }
    if (method === 'thread/read') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { thread: { id: 'thread-alpha', cwd: '/srv/server-a/project-alpha', turns: [{ id: 'turn-1', items: [{ id: 'msg-1', type: 'userMessage', content: [{ type: 'text', text: 'hello' }] }, { id: 'msg-2', type: 'agentMessage', text: 'hi' }] }] } } }) })
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

test('binary files can be force-opened into review after confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/thread/thread-alpha`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'photo.png', exact: true }).click()
  await expect(page.getByText('raw bytes preview')).toBeVisible()
})
