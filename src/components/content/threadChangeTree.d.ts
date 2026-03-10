import type { UiThreadReviewChange } from '../../types/codex'

export type ThreadChangeTreeDirectoryNode = {
  key: string
  path: string
  name: string
  kind: 'directory'
  file: null
  children: ThreadChangeTreeNode[]
}

export type ThreadChangeTreeFileNode = {
  key: string
  path: string
  name: string
  kind: 'file'
  file: UiThreadReviewChange
  children: []
}

export type ThreadChangeTreeNode = ThreadChangeTreeDirectoryNode | ThreadChangeTreeFileNode

export type ThreadChangeTreeRow = ThreadChangeTreeNode & {
  depth: number
}

export function buildThreadChangeTree(files: UiThreadReviewChange[]): ThreadChangeTreeNode[]
export function flattenThreadChangeTree(nodes: ThreadChangeTreeNode[], expanded?: Record<string, boolean>, depth?: number): ThreadChangeTreeRow[]
