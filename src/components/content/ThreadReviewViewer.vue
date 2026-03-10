<template>
  <div class="thread-review-viewer">
    <p v-if="isLoadingDocument" class="thread-review-status">Loading review…</p>
    <p v-else-if="errorMessage" class="thread-review-status thread-review-status-error">{{ errorMessage }}</p>
    <p v-else-if="!path.trim()" class="thread-review-status">Select a file to review it here.</p>
    <p v-else-if="!document" class="thread-review-status">No review content is available for this selection.</p>
    <p v-else-if="!document.isText" class="thread-review-status">Binary files are not opened in the review viewer.</p>
    <template v-else>
      <div class="thread-review-meta">
        <p class="thread-review-meta-line"><strong>File:</strong> {{ promptPath }}</p>
        <p class="thread-review-meta-line"><strong>Mode:</strong> {{ document.mode }}</p>
        <p v-if="document.status" class="thread-review-meta-line"><strong>Status:</strong> {{ document.status }}</p>
        <p v-if="document.branch" class="thread-review-meta-line"><strong>Branch:</strong> {{ document.branch }}</p>
      </div>

      <div ref="scrollerRef" class="thread-review-viewport" @scroll="onScroll">
        <div class="thread-review-spacer" :style="{ height: `${Math.max(document.totalLines, 1) * LINE_HEIGHT}px` }">
          <div class="thread-review-window" :style="{ transform: `translateY(${windowState.startLine * LINE_HEIGHT}px)` }">
            <div v-for="(line, index) in windowState.lines" :key="`${windowState.startLine + index}:${line}`" class="thread-review-line-group">
              <div class="thread-review-line-row">
                <span class="thread-review-line-number">{{ windowState.startLine + index + 1 }}</span>
                <div class="thread-review-line-main">
                  <div class="thread-review-line-content">
                    <span class="thread-review-line-text">{{ displayLine(line, windowState.startLine + index + 1) }}</span>
                    <button
                      v-if="isExpandableReviewLine(line) && !isLineExpanded(windowState.startLine + index + 1)"
                      type="button"
                      class="thread-review-line-expand"
                      @click="expandLine(windowState.startLine + index + 1)"
                    >
                      Load full line
                    </button>
                  </div>
                  <button
                    type="button"
                    class="thread-review-line-add"
                    aria-label="Add comment"
                    @click="openDraft(windowState.startLine + index + 1)"
                  >
                    +
                  </button>
                </div>
              </div>

              <div
                v-if="draft && draft.path === promptPath && draft.line === windowState.startLine + index + 1"
                class="thread-review-comment-editor"
              >
                <textarea
                  v-model="draft.text"
                  class="thread-review-comment-input"
                  :aria-label="`Line ${windowState.startLine + index + 1} comment`"
                  rows="3"
                />
                <div class="thread-review-comment-actions">
                  <button type="button" class="thread-review-comment-save" @click="saveDraft">Save comment</button>
                  <button type="button" class="thread-review-comment-cancel" @click="cancelDraft">Cancel</button>
                </div>
              </div>

              <div
                v-for="comment in commentsForLine(windowState.startLine + index + 1)"
                :key="comment.id"
                class="thread-review-comment-row"
              >
                <p class="thread-review-comment-text">{{ comment.text }}</p>
                <div class="thread-review-comment-actions">
                  <button type="button" class="thread-review-comment-edit" @click="openDraft(comment.line, comment)">Edit</button>
                  <button type="button" class="thread-review-comment-delete" @click="removeComment(comment.id)">Delete</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button type="button" class="thread-review-attach" :disabled="commentPrompt.length === 0" @click="emitAttach">
        Attach review to chat
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { getThreadReviewDocument, getThreadReviewWindow } from '../../api/codexGateway'
import type { UiThreadReviewDocument, UiThreadReviewWindow } from '../../types/codex'
import {
  buildReviewCommentPrompt,
  isExpandableReviewLine,
  previewReviewLine,
  toReviewPromptPath,
} from './threadReviewComments.js'

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
const comments = ref<Array<{ id: string; path: string; line: number; text: string }>>([])
const draft = ref<{ id?: string; path: string; line: number; text: string } | null>(null)
const expandedLines = ref<Record<string, boolean>>({})
let documentToken = 0
let windowToken = 0
let commentSequence = 0

const promptPath = computed(() => {
  const current = document.value
  if (!current) return ''
  return toReviewPromptPath(current.path, current.repoRoot, props.cwd)
})

const commentPrompt = computed(() => buildReviewCommentPrompt(comments.value))

function lineKey(line: number): string {
  return `${promptPath.value}:${String(line)}`
}

function isLineExpanded(line: number): boolean {
  return expandedLines.value[lineKey(line)] === true
}

function expandLine(line: number): void {
  expandedLines.value = {
    ...expandedLines.value,
    [lineKey(line)]: true,
  }
}

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
  draft.value = null
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

function displayLine(line: string, lineNumber: number): string {
  if (isLineExpanded(lineNumber)) return line
  return previewReviewLine(line)
}

function commentsForLine(line: number) {
  return comments.value.filter((comment) => comment.path === promptPath.value && comment.line === line)
}

function openDraft(line: number, comment?: { id: string; path: string; line: number; text: string }): void {
  draft.value = comment
    ? { ...comment }
    : { path: promptPath.value, line, text: '' }
}

function cancelDraft(): void {
  draft.value = null
}

function saveDraft(): void {
  const current = draft.value
  if (!current) return
  const text = current.text.trim()
  if (!text) {
    draft.value = null
    return
  }
  if (current.id) {
    comments.value = comments.value.map((comment) => comment.id === current.id ? { ...comment, text } : comment)
    draft.value = null
    return
  }
  commentSequence += 1
  comments.value = [...comments.value, { id: `comment-${String(commentSequence)}`, path: current.path, line: current.line, text }]
  draft.value = null
}

function removeComment(id: string): void {
  comments.value = comments.value.filter((comment) => comment.id !== id)
}

function emitAttach(): void {
  const current = document.value
  if (!current || commentPrompt.value.length === 0) return
  emit('attach-review', {
    path: current.path,
    source: current.source,
    repoRoot: current.repoRoot,
    note: commentPrompt.value,
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
  @apply absolute inset-x-0 top-0 min-w-full;
  width: max-content;
}

.thread-review-line-group {
  @apply w-full;
}

.thread-review-line-row {
  @apply flex min-h-[22px] items-start gap-3 px-3 text-xs font-mono text-zinc-100;
}

.thread-review-line-number {
  @apply select-none text-zinc-500 text-right shrink-0 w-12 leading-[22px];
}

.thread-review-line-main {
  @apply flex min-w-0 items-start gap-3;
  width: max-content;
}

.thread-review-line-content {
  @apply flex items-start gap-2 leading-[22px] whitespace-pre;
}

.thread-review-line-text {
  @apply whitespace-pre;
}

.thread-review-line-expand {
  @apply rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200 transition hover:bg-zinc-800;
}

.thread-review-line-add {
  @apply mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-200 opacity-0 transition hover:bg-zinc-800;
}

.thread-review-line-row:hover .thread-review-line-add,
.thread-review-line-row:focus-within .thread-review-line-add {
  @apply opacity-100;
}

.thread-review-comment-editor,
.thread-review-comment-row {
  @apply ml-15 mr-3 mt-1 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800;
}

.thread-review-comment-input {
  @apply min-h-20 w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500;
}

.thread-review-comment-text {
  @apply m-0 whitespace-pre-wrap break-words;
}

.thread-review-comment-actions {
  @apply mt-2 flex items-center gap-2;
}

.thread-review-comment-save,
.thread-review-comment-edit,
.thread-review-comment-delete,
.thread-review-comment-cancel,
.thread-review-attach {
  @apply rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100;
}

.thread-review-attach:disabled {
  @apply cursor-not-allowed opacity-50;
}
</style>
