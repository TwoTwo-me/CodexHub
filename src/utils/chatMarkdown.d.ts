export type MarkdownInlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'file'; value: string; displayName: string }
  | { kind: 'link'; label: string; href: string }

export type MarkdownBlock =
  | { kind: 'paragraph'; segments: MarkdownInlineSegment[] }
  | { kind: 'heading'; level: number; segments: MarkdownInlineSegment[] }
  | { kind: 'blockquote'; lines: MarkdownInlineSegment[][] }
  | { kind: 'list'; ordered: boolean; items: MarkdownInlineSegment[][] }
  | { kind: 'code'; language: string; value: string }
  | { kind: 'image'; url: string; alt: string; markdown: string }

export function parseInlineMarkdown(text: string): MarkdownInlineSegment[]
export function parseChatMarkdown(text: string): MarkdownBlock[]
