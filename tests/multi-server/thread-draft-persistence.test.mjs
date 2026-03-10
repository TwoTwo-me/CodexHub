import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createEmptyThreadDraft,
  normalizeThreadDraft,
  replaceReviewRefsForPath,
  toThreadDraftStorageKey,
} from '../../src/composables/useThreadDrafts.js'

test('draft storage keys are scoped by server and thread context', () => {
  assert.equal(toThreadDraftStorageKey('server-a', 'thread-1'), 'server-a::thread-1')
  assert.equal(toThreadDraftStorageKey('server-b', ''), 'server-b::__new-thread__')
})

test('review refs for the same path are replaced instead of duplicated', () => {
  const base = createEmptyThreadDraft()
  const first = replaceReviewRefsForPath(base, 'src/App.vue', [
    { path: 'src/App.vue', line: 3, text: 'rename this helper' },
  ])
  const second = replaceReviewRefsForPath(first, 'src/App.vue', [
    { path: 'src/App.vue', line: 3, text: 'rename this component' },
    { path: 'src/App.vue', line: 8, text: 'extract guard' },
  ])

  assert.deepEqual(second.reviewRefs, [
    { path: 'src/App.vue', line: 3, text: 'rename this component' },
    { path: 'src/App.vue', line: 8, text: 'extract guard' },
  ])
})

test('normalizeThreadDraft drops malformed refs but preserves valid state', () => {
  const normalized = normalizeThreadDraft({
    text: 'hello',
    fileAttachments: [{ label: 'README.md', path: 'README.md', fsPath: '/repo/README.md' }],
    reviewRefs: [
      { path: 'src/App.vue', line: 9, text: 'keep this' },
      { path: '', line: 1, text: 'invalid' },
      { path: 'src/App.vue', line: 'oops', text: 'invalid' },
    ],
  })

  assert.equal(normalized.text, 'hello')
  assert.equal(normalized.fileAttachments.length, 1)
  assert.deepEqual(normalized.reviewRefs, [{ path: 'src/App.vue', line: 9, text: 'keep this' }])
})
