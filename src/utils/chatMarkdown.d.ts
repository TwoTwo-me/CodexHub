export type MarkdownInlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'file'; value: string; displayName: string }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'strong'; value: string }
  | { kind: 'em'; value: string }
  | { kind: 'strike'; value: string }

export type MarkdownBlock =
  | { kind: 'paragraph'; segments: MarkdownInlineSegment[] }
  | { kind: 'heading'; level: number; segments: MarkdownInlineSegment[] }
  | { kind: 'blockquote'; lines: MarkdownInlineSegment[][] }
  | { kind: 'list'; ordered: boolean; items: Array<{ segments: MarkdownInlineSegment[]; checked: boolean | null }> }
  | { kind: 'table'; header: MarkdownInlineSegment[][]; rows: MarkdownInlineSegment[][][] }
  | { kind: 'hr' }
  | { kind: 'code'; language: string; value: string }
  | { kind: 'image'; url: string; alt: string; markdown: string }

export function parseInlineMarkdown(text: string): MarkdownInlineSegment[]
export function parseChatMarkdown(text: string): MarkdownBlock[]
