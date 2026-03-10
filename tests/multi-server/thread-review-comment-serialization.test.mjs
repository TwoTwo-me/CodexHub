import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REVIEW_COMMENT_BLOCK_TITLE,
  REVIEW_LONG_LINE_THRESHOLD,
  buildReviewCommentPrompt,
  isExpandableReviewLine,
  previewReviewLine,
  toReviewPromptPath,
} from '../../src/components/content/threadReviewComments.js'

test('buildReviewCommentPrompt emits deterministic repo-relative @path:line lines', () => {
  const prompt = buildReviewCommentPrompt([
    { id: 'b', path: 'src/b.ts', line: 18, text: 'guard null earlier' },
    { id: 'a', path: 'src/a.ts', line: 12, text: 'rename this helper' },
    { id: 'c', path: 'src/a.ts', line: 20, text: 'trim trailing space' },
  ])

  assert.equal(prompt, [
    REVIEW_COMMENT_BLOCK_TITLE,
    '@src/a.ts:12 rename this helper',
    '@src/a.ts:20 trim trailing space',
    '@src/b.ts:18 guard null earlier',
  ].join('\n'))
})

test('previewReviewLine collapses only lines above the threshold', () => {
  const shortLine = 'x'.repeat(REVIEW_LONG_LINE_THRESHOLD)
  const longLine = 'y'.repeat(REVIEW_LONG_LINE_THRESHOLD + 25)

  assert.equal(isExpandableReviewLine(shortLine), false)
  assert.equal(previewReviewLine(shortLine), shortLine)
  assert.equal(isExpandableReviewLine(longLine), true)
  assert.equal(previewReviewLine(longLine).length, REVIEW_LONG_LINE_THRESHOLD + 1)
  assert.equal(previewReviewLine(longLine).endsWith('…'), true)
})

test('toReviewPromptPath prefers repo-relative form and falls back to cwd-relative', () => {
  assert.equal(toReviewPromptPath('/repo/src/foo.ts', '/repo', '/repo'), 'src/foo.ts')
  assert.equal(toReviewPromptPath('/workspace/docs/readme.md', null, '/workspace'), 'docs/readme.md')
  assert.equal(toReviewPromptPath('src/bar.ts', '/repo', '/repo'), 'src/bar.ts')
})
