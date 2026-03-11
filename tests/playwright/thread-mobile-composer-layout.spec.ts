import { expect, test } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '1')
    window.localStorage.setItem('codex-web-local.selected-server-id.v1', 'server-a')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 'mobile-user', username: 'mobile-user', role: 'user' } }) })
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
  await page.route('**/codex-api/rpc', async (route) => {
    const requestBody = route.request().postDataJSON() as { method?: string }
    const method = requestBody.method ?? ''
    if (method === 'thread/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [{ id: 'thread-alpha', cwd: '/srv/server-a/project-alpha', createdAt: 1735600000, updatedAt: 1735600100, preview: 'Alpha overview' }] } }) })
      return
    }
    if (method === 'thread/read') {
      const turns = Array.from({ length: 24 }, (_, index) => ({
        id: `turn-${index + 1}`,
        items: [
          { id: `user-${index + 1}`, type: 'userMessage', content: [{ type: 'text', text: `User message ${index + 1}` }] },
          { id: `assistant-${index + 1}`, type: 'agentMessage', text: `Assistant reply ${index + 1}` },
        ],
      }))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { thread: { id: 'thread-alpha', cwd: '/srv/server-a/project-alpha', turns } } }) })
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

test('mobile thread composer stays docked to the viewport bottom while chat history remains visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${BASE_URL}/thread/thread-alpha`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  const composer = page.locator('.composer-with-queue .thread-composer')
  const conversation = page.locator('.conversation-list')
  await expect(composer).toBeVisible()
  await expect(conversation).toBeVisible()
  await expect(page.getByText('Assistant reply 24')).toBeVisible()

  const composerBox = await composer.boundingBox()
  expect(composerBox).not.toBeNull()
  const viewportHeight = page.viewportSize()?.height ?? 0
  expect(viewportHeight - ((composerBox?.y ?? 0) + (composerBox?.height ?? 0))).toBeLessThan(32)

  const conversationBox = await conversation.boundingBox()
  expect(conversationBox).not.toBeNull()
  expect((conversationBox?.height ?? 0)).toBeGreaterThan(180)
})
