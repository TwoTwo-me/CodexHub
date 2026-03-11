export type FileAttachment = {
  label: string
  path: string
  fsPath: string
}

export type ReviewDraftRef = {
  path: string
  line: number
  text: string
}

export type ThreadDraftState = {
  text: string
  fileAttachments: FileAttachment[]
  reviewRefs: ReviewDraftRef[]
}

export const THREAD_DRAFTS_STORAGE_KEY: string
export function createEmptyThreadDraft(): ThreadDraftState
export function normalizeThreadDraft(value: unknown): ThreadDraftState
export function toThreadDraftStorageKey(serverId: string, threadId: string): string
export function replaceReviewRefsForPath(draft: ThreadDraftState | unknown, path: string, refs: ReviewDraftRef[]): ThreadDraftState
export function readThreadDraft(storage: Storage | null | undefined, key: string): ThreadDraftState
export function writeThreadDraft(storage: Storage | null | undefined, key: string, draft: ThreadDraftState | unknown): void
export function clearThreadDraft(storage: Storage | null | undefined, key: string): void
