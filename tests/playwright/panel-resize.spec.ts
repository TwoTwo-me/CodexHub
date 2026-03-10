import { expect, test } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
    window.localStorage.setItem('codex-web-local.selected-server-id.v1', 'server-a')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 'resize-user', username: 'resize-user', role: 'user' } }) })
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', path: '/srv/server-a/project-alpha', currentPath: '/srv/server-a/project-alpha', parentPath: null, depth: 0, entries: [{ path: '/srv/server-a/project-alpha/file.txt', name: 'file.txt', kind: 'file', isText: true, hasChildren: false, depth: 1 }] } }) })
  })
  await page.route('**/codex-api/thread-review/document**', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', path: url.searchParams.get('path') || 'file.txt', source: 'scope', mode: 'file', repoRoot: '/srv/server-a/project-alpha', branch: 'main', isGitRepo: true, isText: true, totalLines: 2, status: null } }) })
  })
  await page.route('**/codex-api/thread-review/window**', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', path: url.searchParams.get('path') || 'file.txt', source: 'scope', mode: 'file', startLine: 0, lineCount: 20, totalLines: 2, lines: ['a', 'b'] } }) })
  })
  await page.route('**/codex-api/thread-review/changes**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', repoRoot: '/srv/server-a/project-alpha', branch: 'main', isGitRepo: true, files: [{ path: 'file.txt', status: 'modified', additions: 1, deletions: 0 }] } }) })
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

test('review and utility panes plus scope/change split are draggable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/thread/thread-alpha`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  const reviewPanel = page.locator('.thread-review-panel')
  const utilityPanel = page.locator('.thread-utility-panel')
  const scopeSection = page.locator('[aria-label="Scope browser panel"]')
  const reviewWidthBefore = await reviewPanel.evaluate((el) => el.getBoundingClientRect().width)
  const utilityWidthBefore = await utilityPanel.evaluate((el) => el.getBoundingClientRect().width)
  const scopeHeightBefore = await scopeSection.evaluate((el) => el.getBoundingClientRect().height)

  const reviewHandle = await page.locator('.thread-review-resize-handle').boundingBox()
  const utilityHandle = await page.locator('.thread-utility-resize-handle').boundingBox()
  const splitHandle = await page.locator('.thread-utility-split-handle').boundingBox()
  if (!reviewHandle || !utilityHandle || !splitHandle) throw new Error('Expected resize handles to be rendered')

  await page.mouse.move(reviewHandle.x + reviewHandle.width / 2, reviewHandle.y + reviewHandle.height / 2)
  await page.mouse.down()
  await page.mouse.move(reviewHandle.x - 80, reviewHandle.y + reviewHandle.height / 2)
  await page.mouse.up()

  await page.mouse.move(utilityHandle.x + utilityHandle.width / 2, utilityHandle.y + utilityHandle.height / 2)
  await page.mouse.down()
  await page.mouse.move(utilityHandle.x - 60, utilityHandle.y + utilityHandle.height / 2)
  await page.mouse.up()

  await page.mouse.move(splitHandle.x + splitHandle.width / 2, splitHandle.y + splitHandle.height / 2)
  await page.mouse.down()
  await page.mouse.move(splitHandle.x + splitHandle.width / 2, splitHandle.y + 80)
  await page.mouse.up()
  await page.waitForTimeout(200)

  const reviewWidthAfter = await reviewPanel.evaluate((el) => el.getBoundingClientRect().width)
  const utilityWidthAfter = await utilityPanel.evaluate((el) => el.getBoundingClientRect().width)
  const scopeHeightAfter = await scopeSection.evaluate((el) => el.getBoundingClientRect().height)

  expect(reviewWidthAfter).not.toBe(reviewWidthBefore)
  expect(utilityWidthAfter).not.toBe(utilityWidthBefore)
  expect(scopeHeightAfter).not.toBe(scopeHeightBefore)
})
