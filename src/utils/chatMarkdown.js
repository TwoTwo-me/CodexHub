/** @typedef {{ kind: 'text', value: string } | { kind: 'code', value: string } | { kind: 'file', value: string, displayName: string } | { kind: 'link', label: string, href: string } | { kind: 'strong', value: string } | { kind: 'em', value: string } | { kind: 'strike', value: string }} MarkdownInlineSegment */
/** @typedef {{ kind: 'paragraph', segments: MarkdownInlineSegment[] } | { kind: 'heading', level: number, segments: MarkdownInlineSegment[] } | { kind: 'blockquote', lines: MarkdownInlineSegment[][] } | { kind: 'list', ordered: boolean, items: Array<{ segments: MarkdownInlineSegment[], checked: boolean | null }> } | { kind: 'table', header: MarkdownInlineSegment[][], rows: MarkdownInlineSegment[][][] } | { kind: 'hr' } | { kind: 'code', language: string, value: string } | { kind: 'image', url: string, alt: string, markdown: string }} MarkdownBlock */

function isFilePath(value) {
  if (!value || /\s/u.test(value)) return false
  if (value.endsWith('/') || value.endsWith('\\')) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false
  const looksLikeUnixAbsolute = value.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(value)
  const looksLikeRelative = value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')
  const hasPathSeparator = value.includes('/') || value.includes('\\')
  return looksLikeUnixAbsolute || looksLikeWindowsAbsolute || looksLikeRelative || hasPathSeparator
}

function getBasename(pathValue) {
  const normalized = pathValue.replace(/\\/gu, '/')
  const name = normalized.split('/').filter(Boolean).pop()
  return name || pathValue
}

function parseFileReference(value) {
  if (!value) return null
  let pathValue = value
  let line = null

  const hashLineMatch = pathValue.match(/^(.*)#L(\d+)(?:C\d+)?$/u)
  if (hashLineMatch) {
    pathValue = hashLineMatch[1]
    line = Number(hashLineMatch[2])
  } else {
    const colonLineMatch = pathValue.match(/^(.*):(\d+)(?::\d+)?$/u)
    if (colonLineMatch) {
      pathValue = colonLineMatch[1]
      line = Number(colonLineMatch[2])
    }
  }

  if (!isFilePath(pathValue)) return null
  return { path: pathValue, line }
}

function isLinkTarget(value) {
  return /^(https?:\/\/|mailto:)/u.test(value)
}

function trimTrailingPunctuation(value) {
  const match = value.match(/^(.*?)([.,!?;:)]*)$/u)
  if (!match) return { core: value, trailing: '' }
  return { core: match[1], trailing: match[2] }
}

/** @returns {MarkdownInlineSegment[]} */
export function parseInlineMarkdown(text) {
  if (!text) return []
  /** @type {MarkdownInlineSegment[]} */
  const segments = []
  let cursor = 0

  const pushText = (value) => {
    if (!value) return
    const prev = segments[segments.length - 1]
    if (prev && prev.kind === 'text') {
      prev.value += value
      return
    }
    segments.push({ kind: 'text', value })
  }

  while (cursor < text.length) {
    const remaining = text.slice(cursor)

    if (remaining.startsWith('**')) {
      const closing = remaining.indexOf('**', 2)
      if (closing > 2) {
        segments.push({ kind: 'strong', value: remaining.slice(2, closing) })
        cursor += closing + 2
        continue
      }
    }

    if (remaining.startsWith('~~')) {
      const closing = remaining.indexOf('~~', 2)
      if (closing > 2) {
        segments.push({ kind: 'strike', value: remaining.slice(2, closing) })
        cursor += closing + 2
        continue
      }
    }

    if (remaining.startsWith('*') && !remaining.startsWith('**')) {
      const closing = remaining.indexOf('*', 1)
      if (closing > 1) {
        segments.push({ kind: 'em', value: remaining.slice(1, closing) })
        cursor += closing + 1
        continue
      }
    }

    if (remaining[0] === '`') {
      let openLength = 1
      while (remaining[openLength] === '`') openLength += 1
      const delimiter = '`'.repeat(openLength)
      const closing = remaining.indexOf(delimiter, openLength)
      if (closing > openLength && !remaining.slice(openLength, closing).includes('\n')) {
        const token = remaining.slice(openLength, closing)
        const fileReference = parseFileReference(token)
        if (fileReference) {
          const basename = getBasename(fileReference.path)
          segments.push({
            kind: 'file',
            value: token,
            displayName: fileReference.line ? `${basename} (line ${String(fileReference.line)})` : basename,
          })
        } else {
          segments.push({ kind: 'code', value: token })
        }
        cursor += closing + openLength
        continue
      }
    }

    if (remaining[0] === '[') {
      const closingBracket = remaining.indexOf(']')
      const openParen = closingBracket >= 0 ? remaining.indexOf('(', closingBracket + 1) : -1
      const closingParen = openParen >= 0 ? remaining.indexOf(')', openParen + 1) : -1
      if (closingBracket > 0 && openParen === closingBracket + 1 && closingParen > openParen + 1) {
        const label = remaining.slice(1, closingBracket)
        const href = remaining.slice(openParen + 1, closingParen).trim()
        if (isLinkTarget(href)) {
          segments.push({ kind: 'link', label, href })
          cursor += closingParen + 1
          continue
        }
      }
    }

    const autoLinkMatch = remaining.match(/^(https?:\/\/[^\s<]+|mailto:[^\s<]+)/u)
    if (autoLinkMatch) {
      const { core, trailing } = trimTrailingPunctuation(autoLinkMatch[1])
      segments.push({ kind: 'link', label: core, href: core })
      if (trailing) pushText(trailing)
      cursor += autoLinkMatch[1].length
      continue
    }

    pushText(remaining[0])
    cursor += 1
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value: text }]
}

function isTableCandidate(line) {
  return line.includes('|')
}

function isTableSeparator(line) {
  return /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/u.test(line.trim())
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((cell) => cell.trim())
}

function isBlockBoundary(line) {
  const trimmed = line.trim()
  return trimmed.length === 0
    || /^#{1,6}\s+/u.test(trimmed)
    || /^```/u.test(trimmed)
    || /^>\s?/u.test(trimmed)
    || /^[-*+]\s+/u.test(trimmed)
    || /^\d+\.\s+/u.test(trimmed)
    || /^!\[[^\]]*\]\(([^)\n]+)\)$/u.test(trimmed)
    || /^([-*_])(?:\s*\1){2,}\s*$/u.test(trimmed)
    || isTableCandidate(trimmed)
}

/** @returns {MarkdownBlock[]} */
export function parseChatMarkdown(text) {
  if (!text) return []
  const lines = text.replace(/\r\n?/gu, '\n').split('\n')
  /** @type {MarkdownBlock[]} */
  const blocks = []
  let index = 0

  const pushParagraph = (paragraphLines) => {
    const value = paragraphLines.join(' ').trim()
    if (!value) return
    blocks.push({ kind: 'paragraph', segments: parseInlineMarkdown(value) })
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)\n]+)\)$/u)
    if (imageMatch) {
      blocks.push({ kind: 'image', alt: imageMatch[1].trim(), url: imageMatch[2].trim(), markdown: trimmed })
      index += 1
      continue
    }

    if (/^([-*_])(?:\s*\1){2,}\s*$/u.test(trimmed)) {
      blocks.push({ kind: 'hr' })
      index += 1
      continue
    }

    if (isTableCandidate(trimmed) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = splitTableRow(lines[index]).map((cell) => parseInlineMarkdown(cell))
      const rows = []
      index += 2
      while (index < lines.length && lines[index].trim().includes('|')) {
        rows.push(splitTableRow(lines[index]).map((cell) => parseInlineMarkdown(cell)))
        index += 1
      }
      blocks.push({ kind: 'table', header, rows })
      continue
    }

    const fenceMatch = trimmed.match(/^```([^`]*)$/u)
    if (fenceMatch) {
      const language = fenceMatch[1].trim()
      const codeLines = []
      index += 1
      while (index < lines.length && !/^```/u.test(lines[index].trim())) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ kind: 'code', language, value: codeLines.join('\n') })
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/u)
    if (headingMatch) {
      blocks.push({ kind: 'heading', level: headingMatch[1].length, segments: parseInlineMarkdown(headingMatch[2].trim()) })
      index += 1
      continue
    }

    if (/^>\s?/u.test(trimmed)) {
      const quoteLines = []
      while (index < lines.length && /^>\s?/u.test(lines[index].trim())) {
        quoteLines.push(parseInlineMarkdown(lines[index].trim().replace(/^>\s?/u, '')))
        index += 1
      }
      blocks.push({ kind: 'blockquote', lines: quoteLines })
      continue
    }

    if (/^[-*+]\s+/u.test(trimmed) || /^\d+\.\s+/u.test(trimmed)) {
      const ordered = /^\d+\.\s+/u.test(trimmed)
      const items = []
      while (index < lines.length) {
        const current = lines[index].trim()
        const taskMatch = !ordered ? current.match(/^[-*+]\s+\[( |x|X)\]\s+(.*)$/u) : null
        if (taskMatch) {
          items.push({ segments: parseInlineMarkdown(taskMatch[2].trim()), checked: taskMatch[1].toLowerCase() === 'x' })
          index += 1
          continue
        }
        const bulletPattern = ordered ? /^\d+\.\s+(.*)$/u : /^[-*+]\s+(.*)$/u
        const match = current.match(bulletPattern)
        if (!match) break
        items.push({ segments: parseInlineMarkdown(match[1].trim()), checked: null })
        index += 1
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }

    const paragraphLines = [trimmed]
    index += 1
    while (index < lines.length && !isBlockBoundary(lines[index])) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    pushParagraph(paragraphLines)
  }

  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', segments: parseInlineMarkdown(text) }]
}
