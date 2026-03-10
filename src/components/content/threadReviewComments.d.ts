export const REVIEW_COMMENT_BLOCK_TITLE: string
export const REVIEW_LONG_LINE_THRESHOLD: number
export function toReviewPromptPath(path: string, repoRoot?: string | null, cwd?: string | null): string
export function isExpandableReviewLine(line: string): boolean
export function previewReviewLine(line: string): string
export function buildReviewCommentPrompt(comments: Array<{ id?: string; path: string; line: number; text: string }>): string
