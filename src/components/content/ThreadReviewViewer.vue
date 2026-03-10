<template>
  <div class="thread-review-viewer">
    <p v-if="isLoadingDocument" class="thread-review-status">Loading review…</p>
    <p v-else-if="errorMessage" class="thread-review-status thread-review-status-error">{{ errorMessage }}</p>
    <p v-else-if="!path.trim()" class="thread-review-status">Select a file to review it here.</p>
    <p v-else-if="!document" class="thread-review-status">No review content is available for this selection.</p>
    <p v-else-if="!document.isText" class="thread-review-status">Binary files are not opened in the review viewer.</p>
    <template v-else>
      <div class="thread-review-meta">
        <p class="thread-review-meta-line"><strong>File:</strong> {{ document.path }}</p>
        <p class="thread-review-meta-line"><strong>Mode:</strong> {{ document.mode }}</p>
        <p v-if="document.status" class="thread-review-meta-line"><strong>Status:</strong> {{ document.status }}</p>
        <p v-if="document.branch" class="thread-review-meta-line"><strong>Branch:</strong> {{ document.branch }}</p>
      </div>

      <div ref="scrollerRef" class="thread-review-viewport" @scroll="onScroll">
        <div class="thread-review-spacer" :style="{ height: `${Math.max(document.totalLines, 1) * LINE_HEIGHT}px` }">
          <div class="thread-review-window" :style="{ transform: `translateY(${windowState.startLine * LINE_HEIGHT}px)` }">
            <div v-for="(line, index) in windowState.lines" :key="`${windowState.startLine + index}:${line}`" class="thread-review-line">
              <span class="thread-review-line-number">{{ windowState.startLine + index + 1 }}</span>
              <span class="thread-review-line-text">{{ line || ' ' }}</span>
            </div>
          </div>
        </div>
      </div>

      <label class="thread-review-note-field">
        <span class="thread-review-note-label">Review note</span>
        <textarea v-model="note" class="thread-review-note-input" aria-label="Review note" rows="3" />
      </label>
      <button type="button" class="thread-review-attach" @click="emitAttach">Attach review to chat</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { getThreadReviewDocument, getThreadReviewWindow } from '../../api/codexGateway'
import type { UiThreadReviewDocument, UiThreadReviewWindow } from '../../types/codex'

const LINE_HEIGHT = 22
const DEFAULT_VISIBLE_LINES = 24

const props = defineProps<{
  cwd: string
  path: string
  source: 'scope' | 'changes'
}>()

const emit = defineEmits<{
  'attach-review': [payload: { path: string; source: 'scope' | 'changes'; repoRoot: string | null; note: string }]
}>()

const scrollerRef = ref<HTMLDivElement | null>(null)
const document = ref<UiThreadReviewDocument | null>(null)
const windowState = ref<UiThreadReviewWindow>({
  cwd: '',
  path: '',
  source: 'scope',
  mode: 'file',
  startLine: 0,
  lineCount: 0,
  totalLines: 0,
  lines: [],
})
const isLoadingDocument = ref(false)
const errorMessage = ref('')
const note = ref('')
let documentToken = 0
let windowToken = 0

function visibleLineCount(): number {
  const scroller = scrollerRef.value
  if (!scroller) return DEFAULT_VISIBLE_LINES
  return Math.max(DEFAULT_VISIBLE_LINES, Math.ceil(scroller.clientHeight / LINE_HEIGHT))
}

function desiredWindow(): { startLine: number; lineCount: number } {
  const scroller = scrollerRef.value
  const visibleCount = visibleLineCount()
  const scrollTop = scroller?.scrollTop ?? 0
  const startLine = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - visibleCount)
  return {
    startLine,
    lineCount: visibleCount * 2,
  }
}

async function loadWindow(startLine: number, lineCount: number): Promise<void> {
  const current = document.value
  if (!current || !current.isText) return
  const token = ++windowToken
  const nextWindow = await getThreadReviewWindow({
    cwd: props.cwd,
    path: props.path,
    source: props.source,
    startLine,
    lineCount,
  })
  if (token !== windowToken) return
  windowState.value = nextWindow
}

async function loadDocument(): Promise<void> {
  const cwd = props.cwd.trim()
  const path = props.path.trim()
  const token = ++documentToken
  note.value = ''
  if (!cwd || !path) {
    document.value = null
    windowState.value = {
      cwd: '', path: '', source: props.source, mode: 'file', startLine: 0, lineCount: 0, totalLines: 0, lines: [],
    }
    errorMessage.value = ''
    isLoadingDocument.value = false
    return
  }

  isLoadingDocument.value = true
  errorMessage.value = ''
  try {
    const nextDocument = await getThreadReviewDocument(cwd, path, props.source)
    if (token !== documentToken) return
    document.value = nextDocument
    note.value = `Review context for ${nextDocument.path}`
    if (!nextDocument.isText) {
      windowState.value = {
        cwd: nextDocument.cwd,
        path: nextDocument.path,
        source: nextDocument.source,
        mode: nextDocument.mode,
        startLine: 0,
        lineCount: 0,
        totalLines: nextDocument.totalLines,
        lines: [],
      }
      return
    }
    await nextTick()
    const next = desiredWindow()
    await loadWindow(next.startLine, next.lineCount)
  } catch (error) {
    if (token !== documentToken) return
    document.value = null
    windowState.value = {
      cwd: '', path: '', source: props.source, mode: 'file', startLine: 0, lineCount: 0, totalLines: 0, lines: [],
    }
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load review document.'
  } finally {
    if (token === documentToken) {
      isLoadingDocument.value = false
    }
  }
}

async function onScroll(): Promise<void> {
  const current = document.value
  if (!current || !current.isText) return
  const next = desiredWindow()
  const loadedStart = windowState.value.startLine
  const loadedEnd = loadedStart + windowState.value.lines.length
  if (next.startLine >= loadedStart && next.startLine + next.lineCount <= loadedEnd) return
  await loadWindow(next.startLine, next.lineCount)
}

function emitAttach(): void {
  const current = document.value
  if (!current) return
  emit('attach-review', {
    path: current.path,
    source: current.source,
    repoRoot: current.repoRoot,
    note: note.value.trim(),
  })
}

watch(
  () => [props.cwd, props.path, props.source],
  () => {
    void loadDocument()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "tailwindcss";

.thread-review-viewer {
  @apply flex min-h-0 flex-col gap-3 px-3 pb-3;
}

.thread-review-status {
  @apply m-0 text-sm text-zinc-500;
}

.thread-review-status-error {
  @apply text-rose-600;
}

.thread-review-meta {
  @apply rounded-xl border border-zinc-200 bg-white px-3 py-2;
}

.thread-review-meta-line {
  @apply m-0 text-sm text-zinc-700 break-all;
}

.thread-review-meta-line + .thread-review-meta-line {
  @apply mt-1;
}

.thread-review-viewport {
  @apply min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-200 bg-zinc-950;
}

.thread-review-spacer {
  @apply relative w-full;
}

.thread-review-window {
  @apply absolute inset-x-0 top-0;
}

.thread-review-line {
  @apply grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3 px-3 text-xs leading-[22px] font-mono text-zinc-100;
  height: 22px;
}

.thread-review-line-number {
  @apply select-none text-zinc-500 text-right;
}

.thread-review-line-text {
  @apply whitespace-pre overflow-hidden text-ellipsis;
}

.thread-review-note-field {
  @apply flex flex-col gap-1;
}

.thread-review-note-label {
  @apply text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.thread-review-note-input {
  @apply rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500;
}

.thread-review-attach {
  @apply rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100;
}
</style>
