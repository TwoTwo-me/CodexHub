export const REVIEW_COMMENT_BLOCK_TITLE = '# Review comments'
export const REVIEW_LONG_LINE_THRESHOLD = 1000

function normalizePath(value) {
  return value.replaceAll('\\', '/').trim()
}

export function toReviewPromptPath(path, repoRoot, cwd) {
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) return ''
  if (!normalizedPath.startsWith('/')) return normalizedPath

  const roots = [repoRoot, cwd]
    .map((value) => typeof value === 'string' ? normalizePath(value) : '')
    .filter(Boolean)

  for (const root of roots) {
    if (normalizedPath === root) return root.split('/').filter(Boolean).at(-1) ?? root
    if (normalizedPath.startsWith(`${root}/`)) {
      return normalizedPath.slice(root.length + 1)
    }
  }

  return normalizedPath
}

export function isExpandableReviewLine(line) {
  return line.length > REVIEW_LONG_LINE_THRESHOLD
}

export function previewReviewLine(line) {
  if (!isExpandableReviewLine(line)) return line
  return `${line.slice(0, REVIEW_LONG_LINE_THRESHOLD)}…`
}

export function buildReviewCommentPrompt(comments) {
  if (!Array.isArray(comments) || comments.length === 0) return ''
  const rows = comments
    .filter((comment) => typeof comment.path === 'string' && typeof comment.line === 'number' && typeof comment.text === 'string')
    .map((comment) => ({
      path: normalizePath(comment.path),
      line: Math.max(1, Math.trunc(comment.line)),
      text: comment.text.trim(),
    }))
    .filter((comment) => comment.path && comment.text)
    .sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line)
    .map((comment) => `@${comment.path}:${comment.line} ${comment.text}`)

  if (rows.length === 0) return ''
  return [REVIEW_COMMENT_BLOCK_TITLE, ...rows].join('\n')
}
