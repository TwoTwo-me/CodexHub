import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || '.artifacts/screenshots'

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user: { id: 'markdown-user', username: 'markdown-user', role: 'user' } }),
    })
  })

  await page.route('**/codex-api/servers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { defaultServerId: 'server-a', servers: [{ id: 'server-a', label: 'Server A', description: 'Primary VM', transport: 'local' }] } }),
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
      body: JSON.stringify({ data: { order: ['/srv/project-md'], labels: { '/srv/project-md': 'Project MD' }, active: ['/srv/project-md'] } }),
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
    const requestBody = route.request().postDataJSON()
    const method = requestBody.method

    if (method === 'thread/list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { data: [{ id: 'thread-markdown', cwd: '/srv/project-md', createdAt: 1_735_700_000, updatedAt: 1_735_700_100, preview: 'Markdown thread' }] } }),
      })
      return
    }

    if (method === 'thread/read') {
      const markdownText = '# Heading\n\n- Alpha\n- Beta\n\n> Quoted text\n\n```ts\nconsole.log(1)\n```\n\nVisit [OpenAI](https://openai.com) and `src/main.ts:12`\n\n![Inline image](https://placehold.co/320x180/png)'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { thread: { id: 'thread-markdown', cwd: '/srv/project-md', turns: [
          { id: 'turn-1', items: [{ id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'Render markdown please' }] }] },
          { id: 'turn-2', items: [{ id: 'assistant-1', type: 'agentMessage', text: markdownText }] },
        ] } } }),
      })
      return
    }

    if (method === 'thread/resume' || method === 'skills/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) })
      return
    }

    if (method === 'model/list') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [{ id: 'gpt-5-codex', model: 'gpt-5-codex' }] } }) })
      return
    }

    if (method === 'config/read') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { config: { model: 'gpt-5-codex' } } }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })
})

test('chat thread renders markdown blocks without using raw html', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE_URL}/thread/thread-markdown`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await expect(page.locator('.message-heading', { hasText: 'Heading' })).toBeVisible()
  await expect(page.locator('.message-list-item')).toHaveCount(2)
  await expect(page.locator('.message-blockquote')).toContainText('Quoted text')
  await expect(page.locator('.message-code-block')).toContainText('console.log(1)')
  await expect(page.getByRole('link', { name: 'OpenAI' })).toBeVisible()
  await expect(page.locator('.message-file-link', { hasText: 'main.ts (line 12)' })).toBeVisible()
  await expect(page.locator('.message-markdown-image')).toBeVisible()

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/chat-markdown-rendering-desktop.png`,
    fullPage: true,
  })
})
