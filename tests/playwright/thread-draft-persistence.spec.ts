import { expect, test } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
    window.localStorage.setItem('codex-web-local.selected-server-id.v1', 'server-a')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 'draft-user', username: 'draft-user', role: 'user' } }) })
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
  await page.route('**/codex-api/thread-review/document**', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', path: url.searchParams.get('path') || 'src/components/App.vue', source: 'changes', mode: 'change', repoRoot: '/srv/server-a/project-alpha', branch: 'main', isGitRepo: true, isText: true, totalLines: 3, status: 'modified' } }) })
  })
  await page.route('**/codex-api/thread-review/window**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', path: 'src/components/App.vue', source: 'changes', mode: 'change', startLine: 0, lineCount: 20, totalLines: 3, lines: ['<template>', 'const value = computeThing()', '</template>'] } }) })
  })
  await page.route('**/codex-api/thread-review/changes**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', repoRoot: '/srv/server-a/project-alpha', branch: 'main', isGitRepo: true, files: [{ path: 'src/components/App.vue', status: 'modified', additions: 5, deletions: 1 }] } }) })
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
    if (method === 'turn/start' || method === 'thread/resume' || method === 'skills/list') {
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

test('thread drafts survive reloads and clear only after send', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/thread/thread-alpha`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  await page.getByPlaceholder('Type a message... (@ for files, / for skills)').fill('remember this draft')
  const changePanel = page.getByLabel('Change navigator panel')
  await changePanel.getByRole('button', { name: 'src', exact: true }).click()
  await changePanel.getByRole('button', { name: 'components', exact: true }).click()
  await changePanel.getByRole('button', { name: /App\.vue/i }).click()

  const lineRow = page.locator('.thread-review-line-row').filter({ hasText: 'const value = computeThing()' })
  await lineRow.hover()
  await lineRow.getByRole('button', { name: 'Add comment' }).click()
  await page.getByLabel('Line 2 comment').fill('persist this note')
  await page.getByRole('button', { name: 'Save comment' }).click()
  await expect(page.locator('.thread-composer-review-chip').filter({ hasText: 'App.vue' })).toBeVisible()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await expect(page.getByPlaceholder('Type a message... (@ for files, / for skills)')).toHaveValue('remember this draft')
  await expect(page.locator('.thread-composer-review-chip').filter({ hasText: 'App.vue' })).toBeVisible()

  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByPlaceholder('Type a message... (@ for files, / for skills)')).toHaveValue('')
  await expect(page.locator('.thread-composer-review-chip')).toHaveCount(0)
})
