import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4310'
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR?.trim() || '.artifacts/screenshots'

type SkillRow = {
  source: 'openai' | 'community'
  sourceLabel: string
  skillId: string
  name: string
  owner: string
  description: string
  displayName: string
  publishedAt: number
  avatarUrl: string
  url: string
  installed: boolean
  path?: string
  enabled?: boolean
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

test.beforeEach(async ({ page }) => {
  const installed = new Map<string, SkillRow>()

  await page.addInitScript(() => {
    window.localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
  })

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: { id: 'skills-user', username: 'skills-user', role: 'user' },
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
          servers: [
            { id: 'server-a', label: 'Server A', description: 'Alpha connector', transport: 'relay' },
            { id: 'server-b', label: 'Server B', description: 'Beta connector', transport: 'relay' },
          ],
        },
      }),
    })
  })

  await page.route('**/codex-api/workspace-roots-state**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { order: [], labels: {}, active: [] } }) })
  })

  await page.route('**/codex-api/thread-titles', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { titles: {}, order: [] } }) })
  })

  await page.route('**/codex-api/server-requests/pending**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })

  await page.route('**/codex-api/meta/methods', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: ['config/read'] }) })
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

    if (method === 'skills/list' || method === 'thread/resume') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) })
  })

  await page.route('**/codex-api/skills-hub/readme**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: '# Example Skill\n\nA mocked skill readme.' }),
    })
  })

  await page.route('**/codex-api/skills-hub/install**', async (route) => {
    const payload = route.request().postDataJSON()
    const source = payload.source as 'openai' | 'community'
    const skillId = String(payload.skillId)
    const key = `${source}:${skillId}`
    installed.set(key, {
      source,
      sourceLabel: source === 'openai' ? 'OpenAI Skills' : 'Skills Hub',
      skillId,
      name: String(payload.name),
      owner: String(payload.owner),
      description: 'Installed mocked skill',
      displayName: source === 'openai' ? 'OpenAI Toolkit' : 'Community Toolkit',
      publishedAt: 1_735_900_000,
      avatarUrl: '',
      url: `https://skills.example.test/${source}`,
      installed: true,
      path: `/remote/.codex/skills/${source}/${encodeURIComponent(skillId)}/SKILL.md`,
      enabled: true,
    })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path: `/remote/.codex/skills/${source}/${encodeURIComponent(skillId)}` }) })
  })

  await page.route('**/codex-api/skills-hub/uninstall**', async (route) => {
    const payload = route.request().postDataJSON()
    installed.delete(`${payload.source}:${payload.skillId}`)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.route('**/codex-api/skills-hub**', async (route) => {
    const url = new URL(route.request().url())
    const serverId = route.request().headers()['x-codex-server-id'] || url.searchParams.get('serverId') || ''
    const source = (url.searchParams.get('source') || 'community') as 'openai' | 'community'
    if (!serverId) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Missing serverId for scoped skill manager request' }) })
      return
    }

    const isBeta = serverId === 'server-b'
    const sourceLabel = source === 'openai' ? 'OpenAI Skills' : 'Skills Hub'
    const data: SkillRow[] = source === 'openai'
      ? [{
          source,
          sourceLabel,
          skillId: '.curated/playwright',
          name: 'playwright',
          owner: isBeta ? 'OpenAI · Curated Beta' : 'OpenAI · Curated',
          description: isBeta ? 'Beta OpenAI skill' : 'Alpha OpenAI skill',
          displayName: isBeta ? 'OpenAI Beta Toolkit' : 'OpenAI Toolkit',
          publishedAt: 1_735_900_000,
          avatarUrl: '',
          url: `https://skills.example.test/${serverId}/openai`,
          installed: installed.has('openai:.curated/playwright'),
        }]
      : [{
          source,
          sourceLabel,
          skillId: 'openclaw/docker',
          name: 'docker',
          owner: isBeta ? 'openclaw-beta' : 'openclaw',
          description: isBeta ? 'Beta community skill' : 'Alpha community skill',
          displayName: isBeta ? 'Community Beta Toolkit' : 'Community Toolkit',
          publishedAt: 1_735_900_100,
          avatarUrl: '',
          url: `https://skills.example.test/${serverId}/community`,
          installed: installed.has('community:openclaw/docker'),
        }]

    const installedRows = [...installed.values()].filter((row) => row.source === source)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, installed: installedRows, total: data.length, source, sourceLabel }) })
  })
})

test('skill manager uses source tabs and active server scope', async ({ page }) => {
  ensureDir(SCREENSHOT_DIR)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  await page.getByRole('button', { name: 'Skill Manager' }).click()
  await page.waitForTimeout(800)

  await expect(page.getByRole('heading', { name: 'Skill Manager' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'OpenAI Skills' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.skill-card-name', { hasText: 'OpenAI Toolkit' })).toBeVisible()

  await page.locator('.skill-card').first().click()
  const openAiInstallRequestPromise = page.waitForRequest((request) => request.url().includes('/codex-api/skills-hub/install') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Install' }).click()
  const openAiInstallRequest = await openAiInstallRequestPromise
  expect(openAiInstallRequest.postDataJSON()).toMatchObject({ source: 'openai', skillId: '.curated/playwright' })
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('tab', { name: 'Skills Hub' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('.skill-card-name', { hasText: 'Community Toolkit' })).toBeVisible()

  await page.locator('.skill-card').first().click()
  const communityInstallRequestPromise = page.waitForRequest((request) => request.url().includes('/codex-api/skills-hub/install') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Install' }).click()
  const communityInstallRequest = await communityInstallRequestPromise
  expect(communityInstallRequest.postDataJSON()).toMatchObject({ source: 'community', skillId: 'openclaw/docker' })
  await page.getByRole('button', { name: 'Close' }).click()

  await page.locator('.skills-hub-server .server-picker-select').selectOption('server-b')
  await page.waitForTimeout(800)
  await expect(page.locator('.skill-card-name', { hasText: 'Community Beta Toolkit' })).toBeVisible()

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/skills-hub-server-scope-desktop.png`,
    fullPage: true,
  })
})
