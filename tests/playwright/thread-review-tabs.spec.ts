import { expect, test } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
    window.localStorage.setItem('codex-web-local.selected-server-id.v1', 'server-a')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 'tab-user', username: 'tab-user', role: 'user' } }) })
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
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') || '/srv/server-a/project-alpha'
    const data = path.endsWith('/src')
      ? {
          cwd: '/srv/server-a/project-alpha',
          path: '/srv/server-a/project-alpha/src',
          currentPath: '/srv/server-a/project-alpha/src',
          parentPath: '/srv/server-a/project-alpha',
          depth: 1,
          entries: [
            { path: '/srv/server-a/project-alpha/src/App.vue', name: 'App.vue', kind: 'file', isText: true, hasChildren: false, depth: 2 },
          ],
        }
      : {
          cwd: '/srv/server-a/project-alpha',
          path: '/srv/server-a/project-alpha',
          currentPath: '/srv/server-a/project-alpha',
          parentPath: null,
          depth: 0,
          entries: [
            { path: '/srv/server-a/project-alpha/src', name: 'src', kind: 'directory', isText: false, hasChildren: true, depth: 1 },
            { path: '/srv/server-a/project-alpha/README.md', name: 'README.md', kind: 'file', isText: true, hasChildren: false, depth: 1 },
          ],
        }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })
  })

  await page.route('**/codex-api/thread-review/document**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') || ''
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          cwd: '/srv/server-a/project-alpha',
          path,
          source: url.searchParams.get('source') === 'changes' ? 'changes' : 'scope',
          mode: 'file',
          repoRoot: '/srv/server-a/project-alpha',
          branch: 'main',
          isGitRepo: true,
          isText: true,
          totalLines: 2,
          status: 'modified',
        },
      }),
    })
  })

  await page.route('**/codex-api/thread-review/window**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') || ''
    const lines = path.endsWith('README.md') ? ['# hello', 'world'] : ['<template>', '</template>']
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          cwd: '/srv/server-a/project-alpha',
          path,
          source: 'scope',
          mode: 'file',
          startLine: 0,
          lineCount: 20,
          totalLines: lines.length,
          lines,
        },
      }),
    })
  })

  await page.route('**/codex-api/thread-review/changes**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { cwd: '/srv/server-a/project-alpha', repoRoot: '/srv/server-a/project-alpha', branch: 'main', isGitRepo: true, files: [] } }) })
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

test('review panel keeps multiple open file tabs and clears them on route changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/thread/thread-alpha`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  const scopePanel = page.getByLabel('Scope browser panel')
  await scopePanel.getByRole('button', { name: 'README.md', exact: true }).click()
  await scopePanel.getByRole('button', { name: 'src', exact: true }).click()
  await scopePanel.getByRole('button', { name: 'App.vue', exact: true }).click()

  await expect(page.locator('.thread-review-tab')).toHaveCount(2)
  await expect(page.locator('.thread-review-tab').filter({ hasText: 'README.md' })).toHaveAttribute('title', /README\.md/)
  await expect(page.locator('.thread-review-tab.is-active')).toContainText('App.vue')

  await page.locator('.thread-review-tab.is-active .thread-review-tab-close').click()
  await expect(page.locator('.thread-review-tab')).toHaveCount(1)

  await page.getByRole('button', { name: 'Start new thread', exact: true }).click()
  await expect(page.locator('.thread-review-tab')).toHaveCount(0)
})
