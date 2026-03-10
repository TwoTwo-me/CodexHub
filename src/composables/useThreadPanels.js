import { computed, ref, watch } from 'vue'

export const THREAD_PANELS_STORAGE_KEY = 'codex-web-local.thread-panels.v1'
export const DEFAULT_REVIEW_WIDTH = 420
export const DEFAULT_UTILITY_WIDTH = 320
export const MIN_REVIEW_WIDTH = 280
export const MAX_REVIEW_WIDTH = 720
export const MIN_UTILITY_WIDTH = 240
export const MAX_UTILITY_WIDTH = 480

export function clampPanelWidth(value, minValue, maxValue, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maxValue, Math.max(minValue, Math.round(parsed)))
}

export function createDefaultThreadPanelsState() {
  return {
    reviewOpen: true,
    scopeOpen: true,
    changesOpen: true,
    reviewWidth: DEFAULT_REVIEW_WIDTH,
    utilityWidth: DEFAULT_UTILITY_WIDTH,
  }
}

export function normalizeThreadPanelsState(value) {
  const fallback = createDefaultThreadPanelsState()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback

  const record = value
  return {
    reviewOpen: record.reviewOpen !== false,
    scopeOpen: record.scopeOpen !== false,
    changesOpen: record.changesOpen !== false,
    reviewWidth: clampPanelWidth(record.reviewWidth, MIN_REVIEW_WIDTH, MAX_REVIEW_WIDTH, fallback.reviewWidth),
    utilityWidth: clampPanelWidth(record.utilityWidth, MIN_UTILITY_WIDTH, MAX_UTILITY_WIDTH, fallback.utilityWidth),
  }
}

export function utilityPanelOpen(state) {
  return state.scopeOpen === true || state.changesOpen === true
}

export function toggleThreadPanel(state, panel) {
  const current = normalizeThreadPanelsState(state)
  if (panel === 'review') {
    return {
      ...current,
      reviewOpen: !current.reviewOpen,
    }
  }
  if (panel === 'scope') {
    return {
      ...current,
      scopeOpen: !current.scopeOpen,
    }
  }
  if (panel === 'changes') {
    return {
      ...current,
      changesOpen: !current.changesOpen,
    }
  }
  return current
}

export function setThreadPanelWidth(state, panel, width) {
  const current = normalizeThreadPanelsState(state)
  if (panel === 'review') {
    return {
      ...current,
      reviewWidth: clampPanelWidth(width, MIN_REVIEW_WIDTH, MAX_REVIEW_WIDTH, current.reviewWidth),
    }
  }
  if (panel === 'utility') {
    return {
      ...current,
      utilityWidth: clampPanelWidth(width, MIN_UTILITY_WIDTH, MAX_UTILITY_WIDTH, current.utilityWidth),
    }
  }
  return current
}

export function loadThreadPanelsState(storage) {
  if (!storage?.getItem) return createDefaultThreadPanelsState()
  try {
    const raw = storage.getItem(THREAD_PANELS_STORAGE_KEY)
    if (!raw) return createDefaultThreadPanelsState()
    return normalizeThreadPanelsState(JSON.parse(raw))
  } catch {
    return createDefaultThreadPanelsState()
  }
}

export function saveThreadPanelsState(storage, state) {
  if (!storage?.setItem) return
  storage.setItem(THREAD_PANELS_STORAGE_KEY, JSON.stringify(normalizeThreadPanelsState(state)))
}

export function useThreadPanels(storage = typeof window === 'undefined' ? null : window.localStorage) {
  const state = ref(loadThreadPanelsState(storage))

  watch(
    state,
    (nextValue) => {
      saveThreadPanelsState(storage, nextValue)
    },
    { deep: true },
  )

  const reviewOpen = computed(() => state.value.reviewOpen)
  const scopeOpen = computed(() => state.value.scopeOpen)
  const changesOpen = computed(() => state.value.changesOpen)
  const reviewWidth = computed(() => state.value.reviewWidth)
  const utilityWidth = computed(() => state.value.utilityWidth)
  const utilityOpen = computed(() => utilityPanelOpen(state.value))

  function toggleReview() {
    state.value = toggleThreadPanel(state.value, 'review')
  }

  function toggleScope() {
    state.value = toggleThreadPanel(state.value, 'scope')
  }

  function toggleChanges() {
    state.value = toggleThreadPanel(state.value, 'changes')
  }

  function setReviewWidth(value) {
    state.value = setThreadPanelWidth(state.value, 'review', value)
  }

  function setUtilityWidth(value) {
    state.value = setThreadPanelWidth(state.value, 'utility', value)
  }

  return {
    state,
    reviewOpen,
    scopeOpen,
    changesOpen,
    utilityOpen,
    reviewWidth,
    utilityWidth,
    toggleReview,
    toggleScope,
    toggleChanges,
    setReviewWidth,
    setUtilityWidth,
  }
}
