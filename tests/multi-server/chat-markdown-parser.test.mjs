import assert from 'node:assert/strict'
import test from 'node:test'
import { parseChatMarkdown, parseInlineMarkdown } from '../../src/utils/chatMarkdown.js'

test('parseInlineMarkdown supports links, autolinks, emphasis, strike, inline code, and file references', () => {
  const segments = parseInlineMarkdown('See **bold**, *emphasis*, ~~gone~~, https://openai.com, [Docs](https://platform.openai.com), `src/index.ts:12`, and `const x = 1`')

  assert.deepEqual(segments, [
    { kind: 'text', value: 'See ' },
    { kind: 'strong', value: 'bold' },
    { kind: 'text', value: ', ' },
    { kind: 'em', value: 'emphasis' },
    { kind: 'text', value: ', ' },
    { kind: 'strike', value: 'gone' },
    { kind: 'text', value: ', ' },
    { kind: 'link', label: 'https://openai.com', href: 'https://openai.com' },
    { kind: 'text', value: ', ' },
    { kind: 'link', label: 'Docs', href: 'https://platform.openai.com' },
    { kind: 'text', value: ', ' },
    { kind: 'file', value: 'src/index.ts:12', displayName: 'index.ts (line 12)' },
    { kind: 'text', value: ', and ' },
    { kind: 'code', value: 'const x = 1' },
  ])
})

test('parseChatMarkdown produces structured blocks for headings, horizontal rules, task lists, tables, quotes, code fences, and images', () => {
  const blocks = parseChatMarkdown([
    '# Title',
    '',
    '---',
    '',
    '- [x] done',
    '- [ ] todo',
    '',
    '| A | B |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '> quoted',
    '',
    '```ts',
    'console.log(1)',
    '```',
    '',
    '![Alt](https://example.com/a.png)',
  ].join('\n'))

  assert.equal(blocks[0].kind, 'heading')
  assert.equal(blocks[1].kind, 'hr')
  assert.equal(blocks[2].kind, 'list')
  assert.equal(blocks[3].kind, 'table')
  assert.equal(blocks[4].kind, 'blockquote')
  assert.equal(blocks[5].kind, 'code')
  assert.equal(blocks[6].kind, 'image')

  assert.equal(blocks[2].items[0].checked, true)
  assert.equal(blocks[2].items[1].checked, false)
  assert.equal(blocks[3].header.length, 2)
  assert.equal(blocks[3].rows.length, 1)
  assert.equal(blocks[5].language, 'ts')
  assert.equal(blocks[6].url, 'https://example.com/a.png')
})

test('unsupported raw html degrades to paragraph text', () => {
  const blocks = parseChatMarkdown('<script>alert(1)</script>')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'paragraph')
})
