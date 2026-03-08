import assert from 'node:assert/strict'
import test from 'node:test'
import { parseChatMarkdown, parseInlineMarkdown } from '../../src/utils/chatMarkdown.ts'

test('parseInlineMarkdown supports links, inline code, and file references without HTML', () => {
  const segments = parseInlineMarkdown('See [OpenAI](https://openai.com), `src/index.ts:12`, and `const x = 1`')

  assert.deepEqual(segments, [
    { kind: 'text', value: 'See ' },
    { kind: 'link', label: 'OpenAI', href: 'https://openai.com' },
    { kind: 'text', value: ', ' },
    { kind: 'file', value: 'src/index.ts:12', displayName: 'index.ts (line 12)' },
    { kind: 'text', value: ', and ' },
    { kind: 'code', value: 'const x = 1' },
  ])
})

test('parseChatMarkdown produces structured blocks for headings, lists, quotes, code fences, and images', () => {
  const blocks = parseChatMarkdown(`# Title\n\n- One\n- Two\n\n> quoted\n\n\`\`\`ts\nconsole.log(1)\n\`\`\`\n\n![Alt](https://example.com/a.png)`)

  assert.equal(blocks[0].kind, 'heading')
  assert.equal(blocks[1].kind, 'list')
  assert.equal(blocks[2].kind, 'blockquote')
  assert.equal(blocks[3].kind, 'code')
  assert.equal(blocks[4].kind, 'image')
  assert.equal(blocks[3].language, 'ts')
  assert.equal(blocks[4].url, 'https://example.com/a.png')
})

test('unsupported table-like syntax degrades to paragraph text', () => {
  const blocks = parseChatMarkdown('| A | B |\n| - | - |\n| 1 | 2 |')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'paragraph')
})
