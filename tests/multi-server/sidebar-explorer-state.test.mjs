import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isServerExpanded,
  isServerPanelVisible,
  toServerTreeKey,
  upsertServerGroupsCache,
  upsertServerLoadingCache,
} from '../../src/composables/sidebarExplorerState.js'

test('selected server stays visible while non-selected servers only stay visible when explicitly expanded', () => {
  const collapsed = { 'server-a': false }
  assert.equal(isServerPanelVisible(collapsed, 'server-a', 'server-a'), true)
  assert.equal(isServerPanelVisible(collapsed, 'server-a', 'server-b'), false)
  assert.equal(isServerPanelVisible({ 'server-a': false, 'server-b': false }, 'server-a', 'server-b'), true)
})

test('server expansion cache preserves previously loaded groups for multiple servers', () => {
  const empty = {}
  const alpha = upsertServerGroupsCache(empty, 'server-a', [{ projectName: 'alpha', threads: [{ id: 't1', title: 'A', projectName: 'alpha', cwd: '/a', hasWorktree: false, createdAtIso: '', updatedAtIso: '', preview: '', unread: false, inProgress: false }] }])
  const beta = upsertServerGroupsCache(alpha, 'server-b', [{ projectName: 'bravo', threads: [{ id: 't2', title: 'B', projectName: 'bravo', cwd: '/b', hasWorktree: false, createdAtIso: '', updatedAtIso: '', preview: '', unread: false, inProgress: false }] }])
  assert.deepEqual(alpha[toServerTreeKey('server-a')][0].projectName, 'alpha')
  assert.deepEqual(beta[toServerTreeKey('server-a')][0].projectName, 'alpha')
  assert.deepEqual(beta[toServerTreeKey('server-b')][0].projectName, 'bravo')
})

test('project empty state helper only renders for expanded projects', async () => {
  const module = await import('../../src/composables/sidebarExplorerState.js')
  assert.equal(module.shouldShowProjectEmpty(false, 0), true)
  assert.equal(module.shouldShowProjectEmpty(true, 0), false)
  assert.equal(module.shouldShowProjectEmpty(false, 2), false)
})

test('server loading cache tracks loading per server key', () => {
  const loading = upsertServerLoadingCache({}, 'server-a', true)
  const next = upsertServerLoadingCache(loading, 'server-b', false)
  assert.equal(next[toServerTreeKey('server-a')], true)
  assert.equal(next[toServerTreeKey('server-b')], false)
  assert.equal(isServerExpanded({ 'server-a': true }, 'server-a'), false)
})
