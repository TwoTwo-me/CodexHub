import { computed, ref, watch } from 'vue'

export const THREAD_PANELS_STORAGE_KEY = 'codex-web-local.thread-panels.v1'
export const MIN_REVIEW_WIDTH = 280
export const MAX_REVIEW_WIDTH = 640
export const DEFAULT_REVIEW_WIDTH = 380
export const MIN_UTILITY_WIDTH = 260
export const MAX_UTILITY_WIDTH = 520
export const DEFAULT_UTILITY_WIDTH = 320

export function createDefaultThreadPanelsState() {
  return {
    reviewOpen: true,
    scopeOpen: true,
    changesOpen: true,
    reviewWidth: DEFAULT_REVIEW_WIDTH,
    utilityWidth: DEFAULT_UTILITY_WIDTH,
  }
}

function clamp(value, minValue, maxValue, fallback = minValue) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), minValue), maxValue)
}

export function normalizeThreadPanelsState(value) {
  const defaults = createDefaultThreadPanelsState()
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults
  }

  return {
    reviewOpen: typeof value.reviewOpen === 'boolean' ? value.reviewOpen : defaults.reviewOpen,
    scopeOpen: typeof value.scopeOpen === 'boolean' ? value.scopeOpen : defaults.scopeOpen,
    changesOpen: typeof value.changesOpen === 'boolean' ? value.changesOpen : defaults.changesOpen,
    reviewWidth: clamp(typeof value.reviewWidth === 'number' ? value.reviewWidth : defaults.reviewWidth, MIN_REVIEW_WIDTH, MAX_REVIEW_WIDTH, defaults.reviewWidth),
    utilityWidth: clamp(typeof value.utilityWidth === 'number' ? value.utilityWidth : defaults.utilityWidth, MIN_UTILITY_WIDTH, MAX_UTILITY_WIDTH, defaults.utilityWidth),
  }
}

export function isUtilityPanelOpen(state) {
  return state.scopeOpen || state.changesOpen
}

export function reduceThreadPanelsState(state, action) {
  const current = normalizeThreadPanelsState(state)
  if (!action || typeof action !== 'object') return current

  switch (action.type) {
    case 'toggle-review':
      return { ...current, reviewOpen: !current.reviewOpen }
    case 'toggle-scope':
      return { ...current, scopeOpen: !current.scopeOpen }
    case 'toggle-changes':
      return { ...current, changesOpen: !current.changesOpen }
    case 'set-review-width':
      return { ...current, reviewWidth: clamp(action.value, MIN_REVIEW_WIDTH, MAX_REVIEW_WIDTH) }
    case 'set-utility-width':
      return { ...current, utilityWidth: clamp(action.value, MIN_UTILITY_WIDTH, MAX_UTILITY_WIDTH) }
    default:
      return current
  }
}

export function loadThreadPanelsState(storage = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) return createDefaultThreadPanelsState()

  try {
    const raw = storage.getItem(THREAD_PANELS_STORAGE_KEY)
    if (!raw) return createDefaultThreadPanelsState()
    return normalizeThreadPanelsState(JSON.parse(raw))
  } catch {
    return createDefaultThreadPanelsState()
  }
}

export function saveThreadPanelsState(state, storage = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) return
  storage.setItem(THREAD_PANELS_STORAGE_KEY, JSON.stringify(normalizeThreadPanelsState(state)))
}

export function useThreadPanels() {
  const state = ref(loadThreadPanelsState())

  watch(
    state,
    (value) => {
      saveThreadPanelsState(value)
    },
    { deep: true },
  )

  const utilityOpen = computed(() => isUtilityPanelOpen(state.value))

  function apply(action) {
    state.value = reduceThreadPanelsState(state.value, action)
  }

  return {
    state,
    utilityOpen,
    reviewOpen: computed(() => state.value.reviewOpen),
    scopeOpen: computed(() => state.value.scopeOpen),
    changesOpen: computed(() => state.value.changesOpen),
    reviewWidth: computed(() => state.value.reviewWidth),
    utilityWidth: computed(() => state.value.utilityWidth),
    toggleReview() {
      apply({ type: 'toggle-review' })
    },
    toggleScope() {
      apply({ type: 'toggle-scope' })
    },
    toggleChanges() {
      apply({ type: 'toggle-changes' })
    },
    setReviewWidth(value) {
      apply({ type: 'set-review-width', value })
    },
    setUtilityWidth(value) {
      apply({ type: 'set-utility-width', value })
    },
  }
}
