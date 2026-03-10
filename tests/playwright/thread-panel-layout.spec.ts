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
            { path: 'notes.txt', status: 'untracked', additions: 1, deletions: 0 },
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
            { path: 'notes.txt', status: 'untracked', additions: 1, deletions: 0 },
          ],
        },
      }),
    })
  })

  await page.route('**/codex-api/thread-review/file**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') ?? ''
    const data = path === 'README.md'
      ? { path: 'README.md', status: 'modified', diffText: '@@ -1 +1,3 @@\n-# hello\n+# hello\n+\n+updated\n', beforeText: '# hello\n', afterText: '# hello\n\nupdated\n' }
      : { path: 'notes.txt', status: 'untracked', diffText: '@@ -0,0 +1 @@\n+pending review\n', beforeText: '', afterText: 'pending review\n' }
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
  await expect(page.getByText('Server: Server A')).toBeVisible()
  await expect(page.getByText('Project: Project Alpha')).toBeVisible()
  await expect(page.getByText('CWD: /srv/server-a/project-alpha')).toBeVisible()
  await page.getByPlaceholder('Search files in scope').fill('app')
  await expect(page.getByRole('button', { name: 'README.md', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'src/App.vue', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /README\.md modified/i })).toBeVisible()
  await page.getByRole('button', { name: /README\.md modified/i }).click()
  await expect(page.getByText('updated')).toBeVisible()
  await page.getByLabel('Review note').fill('Check this change in chat')
  await page.getByRole('button', { name: 'Attach review to chat' }).click()
  await expect(page.getByPlaceholder('Type a message... (@ for files, / for skills)')).toHaveValue(/Check this change in chat/)
  await expect(page.locator('.thread-composer-file-chip-name').filter({ hasText: 'README.md' }).first()).toBeVisible()

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
  await expect(page.getByText('Server: Server A')).toBeVisible()
  await expect(page.getByText('Project: Project Alpha')).toBeVisible()
  await expect(page.getByText('CWD: /srv/server-a/project-alpha')).toBeVisible()
  await page.getByPlaceholder('Search files in scope').fill('app')
  await expect(page.getByRole('button', { name: 'README.md', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'src/App.vue', exact: true })).toBeVisible()

  await page.waitForTimeout(1200)
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/phase1-thread-panel-layout-desktop.png`,
    fullPage: true,
  })
})
