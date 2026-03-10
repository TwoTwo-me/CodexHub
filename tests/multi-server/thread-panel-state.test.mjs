import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_REVIEW_WIDTH,
  DEFAULT_UTILITY_WIDTH,
  MAX_REVIEW_WIDTH,
  MAX_UTILITY_WIDTH,
  MIN_REVIEW_WIDTH,
  MIN_UTILITY_WIDTH,
  createDefaultThreadPanelsState,
  isUtilityPanelOpen,
  normalizeThreadPanelsState,
  reduceThreadPanelsState,
} from '../../src/composables/useThreadPanels.js'

test('normalizeThreadPanelsState falls back to defaults for invalid persisted values', () => {
  const state = normalizeThreadPanelsState({
    reviewOpen: 'yes',
    scopeOpen: null,
    changesOpen: 1,
    reviewWidth: Number.NaN,
    utilityWidth: 'wide',
  })

  assert.deepEqual(state, createDefaultThreadPanelsState())
})

test('reduceThreadPanelsState toggles panels independently and utility state follows scope/changes', () => {
  const base = createDefaultThreadPanelsState()
  assert.equal(base.reviewOpen, true)
  assert.equal(base.scopeOpen, true)
  assert.equal(base.changesOpen, true)
  assert.equal(isUtilityPanelOpen(base), true)

  const reviewClosed = reduceThreadPanelsState(base, { type: 'toggle-review' })
  assert.equal(reviewClosed.reviewOpen, false)
  assert.equal(reviewClosed.scopeOpen, true)
  assert.equal(reviewClosed.changesOpen, true)

  const scopeClosed = reduceThreadPanelsState(reviewClosed, { type: 'toggle-scope' })
  assert.equal(scopeClosed.scopeOpen, false)
  assert.equal(scopeClosed.changesOpen, true)
  assert.equal(isUtilityPanelOpen(scopeClosed), true)

  const utilityClosed = reduceThreadPanelsState(scopeClosed, { type: 'toggle-changes' })
  assert.equal(utilityClosed.scopeOpen, false)
  assert.equal(utilityClosed.changesOpen, false)
  assert.equal(isUtilityPanelOpen(utilityClosed), false)

  const changesRestored = reduceThreadPanelsState(utilityClosed, { type: 'toggle-changes' })
  assert.equal(changesRestored.changesOpen, true)
  assert.equal(isUtilityPanelOpen(changesRestored), true)
})

test('reduceThreadPanelsState clamps persisted widths into safe desktop ranges', () => {
  const base = createDefaultThreadPanelsState()
  const narrowed = reduceThreadPanelsState(base, { type: 'set-review-width', value: MIN_REVIEW_WIDTH - 100 })
  assert.equal(narrowed.reviewWidth, MIN_REVIEW_WIDTH)

  const widened = reduceThreadPanelsState(base, { type: 'set-review-width', value: MAX_REVIEW_WIDTH + 100 })
  assert.equal(widened.reviewWidth, MAX_REVIEW_WIDTH)

  const utilityNarrowed = reduceThreadPanelsState(base, { type: 'set-utility-width', value: MIN_UTILITY_WIDTH - 100 })
  assert.equal(utilityNarrowed.utilityWidth, MIN_UTILITY_WIDTH)

  const utilityWidened = reduceThreadPanelsState(base, { type: 'set-utility-width', value: MAX_UTILITY_WIDTH + 100 })
  assert.equal(utilityWidened.utilityWidth, MAX_UTILITY_WIDTH)

  assert.equal(DEFAULT_REVIEW_WIDTH >= MIN_REVIEW_WIDTH && DEFAULT_REVIEW_WIDTH <= MAX_REVIEW_WIDTH, true)
  assert.equal(DEFAULT_UTILITY_WIDTH >= MIN_UTILITY_WIDTH && DEFAULT_UTILITY_WIDTH <= MAX_UTILITY_WIDTH, true)
})
