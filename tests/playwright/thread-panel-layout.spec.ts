import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || 'artifacts/thread-review-layout'

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
    window.localStorage.setItem('codex-web-local.selected-server-id.v1', 'server-a')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: 'panel-user',
          username: 'panel-user',
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          order: ['/srv/server-a/project-alpha'],
          labels: { '/srv/server-a/project-alpha': 'Project Alpha' },
          active: ['/srv/server-a/project-alpha'],
        },
      }),
    })
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
            { path: '/srv/server-a/project-alpha/src/components', name: 'components', kind: 'directory', isText: false, hasChildren: true, depth: 2 },
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
            { path: '/srv/server-a/project-alpha/docs', name: 'docs', kind: 'directory', isText: false, hasChildren: true, depth: 1 },
            { path: '/srv/server-a/project-alpha/src', name: 'src', kind: 'directory', isText: false, hasChildren: true, depth: 1 },
            { path: '/srv/server-a/project-alpha/README.md', name: 'README.md', kind: 'file', isText: true, hasChildren: false, depth: 1 },
            { path: '/srv/server-a/project-alpha/photo.png', name: 'photo.png', kind: 'file', isText: false, hasChildren: false, depth: 1 },
          ],
        }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) })
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

  await page.route('**/codex-api/composer-file-search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { path: 'README.md' },
          { path: 'src/App.vue' },
          { path: 'src/components/content/ThreadComposer.vue' },
        ],
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
          files: [
            { path: 'README.md', status: 'modified', additions: 2, deletions: 0 },
            { path: 'src/components/App.vue', status: 'modified', additions: 5, deletions: 1 },
          ],
        },
      }),
    })
  })

  await page.route('**/codex-api/thread-review/file**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') || 'README.md'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          cwd: '/srv/server-a/project-alpha',
          repoRoot: '/srv/server-a/project-alpha',
          branch: 'main',
          isGitRepo: true,
          file: {
            path,
            status: path === 'notes.txt' ? 'untracked' : 'modified',
            diffText: path === 'notes.txt' ? '+pending review\n' : '@@ -1 +1,3 @@\n # hello\n+\n+updated\n',
            beforeText: path === 'notes.txt' ? '' : '# hello\n',
            afterText: path === 'notes.txt' ? 'pending review\n' : '# hello\n\nupdated\n',
          },
        },
      }),
    })
  })

  await page.route('**/codex-api/thread-review/document**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') || ''
    const source = url.searchParams.get('source') === 'changes' ? 'changes' : 'scope'
    const mode = source === 'changes' ? 'change' : 'file'
    const isBinary = path.endsWith('photo.png')
    const totalLines = isBinary ? 0 : path.endsWith('README.md') && source === 'changes' ? 4 : 1
    const status = source === 'changes' ? 'modified' : null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          cwd: '/srv/server-a/project-alpha',
          path,
          source,
          mode,
          repoRoot: '/srv/server-a/project-alpha',
          branch: 'main',
          isGitRepo: true,
          isText: !isBinary,
          totalLines,
          status,
        },
      }),
    })
  })

  await page.route('**/codex-api/thread-review/window**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') || ''
    const source = url.searchParams.get('source') === 'changes' ? 'changes' : 'scope'
    const startLine = Number(url.searchParams.get('startLine') || '0')
    const lineCount = Number(url.searchParams.get('lineCount') || '80')
    const lines = path.endsWith('README.md') && source === 'changes'
      ? ['@@ -1 +1,3 @@', '# hello', '', 'updated']
      : path.endsWith('App.vue')
        ? ['<template><main /></template>']
        : []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          cwd: '/srv/server-a/project-alpha',
          path,
          source,
          mode: source === 'changes' ? 'change' : 'file',
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
          files: [
            { path: 'README.md', status: 'modified', additions: 3, deletions: 1 },
            { path: 'src/components/App.vue', status: 'modified', additions: 5, deletions: 1 },
          ],
        },
      }),
    })
  })

  await page.route('**/codex-api/thread-review/file**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') ?? ''
    const data = path.endsWith('README.md')
      ? { path, status: 'modified', diffText: '@@ -1 +1,3 @@\n-# hello\n+# hello\n+\n+updated\n', beforeText: '# hello\n', afterText: '# hello\n\nupdated\n' }
      : path.endsWith('App.vue')
        ? { path, status: 'modified', diffText: '@@ -1 +1 @@\n-<template></template>\n+<template><main /></template>\n', beforeText: '<template></template>\n', afterText: '<template><main /></template>\n' }
        : { path, status: 'modified', diffText: '@@ -1 +1 @@\n-<template></template>\n+<template><main /></template>\n', beforeText: '<template></template>\n', afterText: '<template><main /></template>\n' }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          cwd: '/srv/server-a/project-alpha',
          repoRoot: '/srv/server-a/project-alpha',
          branch: 'main',
          isGitRepo: true,
          file: data,
        },
      }),
    })
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
    const body = route.request().postDataJSON() as { method?: string }
    const method = body.method

    if (method === 'thread/list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: [{
              id: 'thread-alpha',
              cwd: '/srv/server-a/project-alpha',
              createdAt: 1_735_600_000,
              updatedAt: 1_735_600_100,
              preview: 'Alpha overview',
            }],
          },
        }),
      })
      return
    }

    if (method === 'thread/read') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            thread: {
              id: 'thread-alpha',
              cwd: '/srv/server-a/project-alpha',
              turns: [{
                id: 'thread-alpha-turn-1',
                items: [
                  { id: 'thread-alpha-user', type: 'userMessage', content: [{ type: 'text', text: 'hello' }] },
                  { id: 'thread-alpha-assistant', type: 'agentMessage', text: 'response' },
                ],
              }],
            },
          },
        }),
      })
      return
    }

    if (method === 'thread/resume' || method === 'model/list' || method === 'config/read' || method === 'skills/list') {
      const result = method === 'model/list'
        ? { data: [{ id: 'gpt-5-codex', model: 'gpt-5-codex' }] }
        : method === 'config/read'
          ? { config: { model: 'gpt-5-codex', model_reasoning_effort: 'medium' } }
          : method === 'skills/list'
            ? { data: [] }
            : {}
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })
})

test('desktop thread workspace shows independent Review, Scope, and Changes toggles', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${BASE_URL}/thread/thread-alpha`, { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Scope', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Changes', exact: true })).toBeVisible()
  await expect(page.getByText('Review to chat', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.thread-workspace-chat .thread-composer')).toBeVisible()
  await expect(page.locator('.thread-review-panel .thread-composer')).toHaveCount(0)
  await expect(page.getByText('Scope browser').first()).toBeVisible()
  await expect(page.getByText('Change navigator').first()).toBeVisible()
  const scopePanel = page.getByLabel('Scope browser panel')
  await expect(page.getByText('Server: Server A')).toBeVisible()
  await expect(page.getByText('Project: Project Alpha')).toBeVisible()
  await expect(page.getByText('CWD: /srv/server-a/project-alpha')).toBeVisible()
  await expect(scopePanel.getByRole('button', { name: 'docs', exact: true })).toBeVisible()
  await expect(scopePanel.getByRole('button', { name: 'src', exact: true })).toBeVisible()
  await expect(scopePanel.getByRole('button', { name: 'README.md', exact: true })).toBeVisible()
  await expect(scopePanel.getByRole('button', { name: 'photo.png', exact: true })).toBeVisible()
  await expect(scopePanel.getByRole('button', { name: 'App.vue', exact: true })).toHaveCount(0)
  await scopePanel.getByRole('button', { name: 'src', exact: true }).click()
  await expect(scopePanel.getByRole('button', { name: 'components', exact: true })).toBeVisible()
  await expect(scopePanel.getByRole('button', { name: 'App.vue', exact: true })).toBeVisible()
  await scopePanel.getByRole('button', { name: 'App.vue', exact: true }).click()
  await expect(page.getByText(/File: .*App\.vue/)).toBeVisible()
  const changePanel = page.getByLabel('Change navigator panel')
  await expect(changePanel.getByRole('button', { name: 'src', exact: true })).toBeVisible()
  await expect(changePanel.getByRole('button', { name: 'components', exact: true })).toHaveCount(0)
  await changePanel.getByRole('button', { name: 'src', exact: true }).click()
  await expect(changePanel.getByRole('button', { name: 'components', exact: true })).toBeVisible()
  await changePanel.getByRole('button', { name: 'components', exact: true }).click()
  await expect(changePanel.getByRole('button', { name: /App\.vue/i })).toBeVisible()
  await changePanel.getByRole('button', { name: /App\.vue/i }).click()
  await expect(page.getByText(/File: .*App\.vue/)).toBeVisible()
  const reviewLine = page.locator('.thread-review-line-row').first()
  await reviewLine.hover()
  await reviewLine.getByRole('button', { name: 'Add comment' }).click()
  await page.getByLabel('Line 1 comment').fill('Check this change in chat')
  await page.getByRole('button', { name: 'Save comment' }).click()
  await page.getByRole('button', { name: 'Attach review to chat' }).click()
  await expect(page.getByPlaceholder('Type a message... (@ for files, / for skills)')).toHaveValue(/Check this change in chat/)

  await page.getByRole('button', { name: 'Scope', exact: true }).click()
  await expect(page.getByLabel('Scope browser panel')).toHaveCount(0)
  await expect(page.getByLabel('Change navigator panel')).toBeVisible()

  await page.getByRole('button', { name: 'Changes', exact: true }).click()
  await expect(page.getByLabel('Change navigator panel')).toHaveCount(0)

  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByText('Review to chat', { exact: true }).first()).toHaveCount(0)
  await expect(page.getByPlaceholder('Type a message... (@ for files, / for skills)')).toBeVisible()

  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('button', { name: 'Scope', exact: true }).click()
  await page.getByRole('button', { name: 'Changes', exact: true }).click()
  await expect(page.getByText('Review to chat', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Scope browser').first()).toBeVisible()
  await expect(page.getByText('Change navigator').first()).toBeVisible()
  const reopenedScopePanel = page.getByLabel('Scope browser panel')
  await expect(page.getByText('Server: Server A')).toBeVisible()
  await expect(page.getByText('Project: Project Alpha')).toBeVisible()
  await expect(page.getByText('CWD: /srv/server-a/project-alpha')).toBeVisible()
  await expect(reopenedScopePanel.getByRole('button', { name: 'docs', exact: true })).toBeVisible()
  await expect(reopenedScopePanel.getByRole('button', { name: 'src', exact: true })).toBeVisible()
  await expect(reopenedScopePanel.getByRole('button', { name: 'README.md', exact: true })).toBeVisible()
  await expect(reopenedScopePanel.getByRole('button', { name: 'photo.png', exact: true })).toBeVisible()

  await page.waitForTimeout(1200)
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/phase1-thread-panel-layout-desktop.png`,
    fullPage: true,
  })
})
