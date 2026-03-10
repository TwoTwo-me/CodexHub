import test from 'node:test'
import assert from 'node:assert/strict'

import { buildThreadChangeTree, flattenThreadChangeTree } from '../../src/components/content/threadChangeTree.js'

const files = [
  { path: 'README.md', status: 'modified', additions: 2, deletions: 0 },
  { path: 'src/components/App.vue', status: 'modified', additions: 5, deletions: 1 },
  { path: 'src/utils/fs.ts', status: 'added', additions: 10, deletions: 0 },
]

test('buildThreadChangeTree groups nested changed files into directory nodes', () => {
  const tree = buildThreadChangeTree(files)
  assert.equal(tree.some((node) => node.kind === 'directory' && node.name === 'src'), true)
  assert.equal(tree.some((node) => node.kind === 'file' && node.name === 'README.md'), true)
})

test('flattenThreadChangeTree only reveals one more level when folders are expanded', () => {
  const tree = buildThreadChangeTree(files)
  const collapsed = flattenThreadChangeTree(tree, {})
  assert.equal(collapsed.some((node) => node.name === 'components'), false)
  assert.equal(collapsed.some((node) => node.name === 'App.vue'), false)

  const srcExpanded = flattenThreadChangeTree(tree, { src: true })
  assert.equal(srcExpanded.some((node) => node.name === 'components'), true)
  assert.equal(srcExpanded.some((node) => node.name === 'App.vue'), false)

  const nestedExpanded = flattenThreadChangeTree(tree, { src: true, 'src/components': true })
  assert.equal(nestedExpanded.some((node) => node.name === 'App.vue'), true)
})
