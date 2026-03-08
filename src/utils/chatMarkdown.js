/** @typedef {{ kind: 'text', value: string } | { kind: 'code', value: string } | { kind: 'file', value: string, displayName: string } | { kind: 'link', label: string, href: string }} MarkdownInlineSegment */
/** @typedef {{ kind: 'paragraph', segments: MarkdownInlineSegment[] } | { kind: 'heading', level: number, segments: MarkdownInlineSegment[] } | { kind: 'blockquote', lines: MarkdownInlineSegment[][] } | { kind: 'list', ordered: boolean, items: MarkdownInlineSegment[][] } | { kind: 'code', language: string, value: string } | { kind: 'image', url: string, alt: string, markdown: string }} MarkdownBlock */

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
    if (text[cursor] === '`') {
      let openLength = 1
      while (cursor + openLength < text.length && text[cursor + openLength] === '`') openLength += 1
      const delimiter = '`'.repeat(openLength)
      const closing = text.indexOf(delimiter, cursor + openLength)
      if (closing > cursor + openLength && !text.slice(cursor + openLength, closing).includes('\n')) {
        const token = text.slice(cursor + openLength, closing)
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
        cursor = closing + openLength
        continue
      }
    }

    if (text[cursor] === '[') {
      const closingBracket = text.indexOf(']', cursor + 1)
      const openParen = closingBracket >= 0 ? text.indexOf('(', closingBracket + 1) : -1
      const closingParen = openParen >= 0 ? text.indexOf(')', openParen + 1) : -1
      if (closingBracket > cursor + 1 && openParen === closingBracket + 1 && closingParen > openParen + 1) {
        const label = text.slice(cursor + 1, closingBracket)
        const href = text.slice(openParen + 1, closingParen).trim()
        if (isLinkTarget(href)) {
          segments.push({ kind: 'link', label, href })
          cursor = closingParen + 1
          continue
        }
      }
    }

    pushText(text[cursor])
    cursor += 1
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value: text }]
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
        const bulletPattern = ordered ? /^\d+\.\s+(.*)$/u : /^[-*+]\s+(.*)$/u
        const match = current.match(bulletPattern)
        if (!match) break
        items.push(parseInlineMarkdown(match[1].trim()))
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
