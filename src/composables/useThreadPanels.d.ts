import type { ComputedRef, Ref } from 'vue'

export const THREAD_PANELS_STORAGE_KEY: string
export const MIN_REVIEW_WIDTH: number
export const MAX_REVIEW_WIDTH: number
export const DEFAULT_REVIEW_WIDTH: number
export const MIN_UTILITY_WIDTH: number
export const MAX_UTILITY_WIDTH: number
export const DEFAULT_UTILITY_WIDTH: number
export const MIN_UTILITY_SPLIT: number
export const MAX_UTILITY_SPLIT: number
export const DEFAULT_UTILITY_SPLIT: number

export type ThreadPanelsState = {
  reviewOpen: boolean
  scopeOpen: boolean
  changesOpen: boolean
  reviewWidth: number
  utilityWidth: number
  utilitySplit: number
}

export type ThreadPanelsAction =
  | { type: 'toggle-review' }
  | { type: 'toggle-scope' }
  | { type: 'toggle-changes' }
  | { type: 'set-review-width'; value: number }
  | { type: 'set-utility-width'; value: number }
  | { type: 'set-utility-split'; value: number }

export function createDefaultThreadPanelsState(): ThreadPanelsState
export function normalizeThreadPanelsState(value: unknown): ThreadPanelsState
export function isUtilityPanelOpen(state: ThreadPanelsState): boolean
export function reduceThreadPanelsState(state: ThreadPanelsState, action: ThreadPanelsAction | unknown): ThreadPanelsState
export function loadThreadPanelsState(storage?: Storage | null): ThreadPanelsState
export function saveThreadPanelsState(state: ThreadPanelsState, storage?: Storage | null): void
export function useThreadPanels(): {
  state: Ref<ThreadPanelsState>
  utilityOpen: ComputedRef<boolean>
  reviewOpen: ComputedRef<boolean>
  scopeOpen: ComputedRef<boolean>
  changesOpen: ComputedRef<boolean>
  reviewWidth: ComputedRef<number>
  utilityWidth: ComputedRef<number>
  utilitySplit: ComputedRef<number>
  toggleReview: () => void
  toggleScope: () => void
  toggleChanges: () => void
  setReviewWidth: (value: number) => void
  setUtilityWidth: (value: number) => void
  setUtilitySplit: (value: number) => void
}
