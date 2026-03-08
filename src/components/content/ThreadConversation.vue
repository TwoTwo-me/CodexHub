<template>
  <section class="conversation-root">
    <p v-if="isLoading" class="conversation-loading">Loading messages...</p>

    <p
      v-else-if="messages.length === 0 && !liveOverlay"
      class="conversation-empty"
    >
      No messages in this thread yet.
    </p>

    <ul v-else ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
      <li
        v-for="message in messages"
        :key="message.id"
        class="conversation-item"
        :class="{ 'conversation-item-rollbackable': canRollbackMessage(message) }"
        :data-role="message.role"
        :data-message-type="message.messageType || ''"
      >
        <div v-if="isCommandMessage(message)" class="message-row" data-role="system">
          <div class="message-stack" data-role="system">
            <button
              type="button"
              class="cmd-row"
              :class="[commandStatusClass(message), { 'cmd-expanded': isCommandExpanded(message) }]"
              @click="toggleCommandExpand(message)"
            >
              <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandExpanded(message) }">▶</span>
              <code class="cmd-label">{{ message.commandExecution?.command || '(command)' }}</code>
              <span class="cmd-status">{{ commandStatusLabel(message) }}</span>
            </button>
            <div
              class="cmd-output-wrap"
              :class="{ 'cmd-output-visible': isCommandExpanded(message), 'cmd-output-collapsing': isCommandCollapsing(message) }"
            >
              <div class="cmd-output-inner">
                <pre class="cmd-output">{{ message.commandExecution?.aggregatedOutput || '(no output)' }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="message-row" :data-role="message.role" :data-message-type="message.messageType || ''">
          <div class="message-stack" :data-role="message.role">
            <article class="message-body" :data-role="message.role">
              <ul
                v-if="message.images && message.images.length > 0"
                class="message-image-list"
                :data-role="message.role"
              >
                <li v-for="imageUrl in message.images" :key="imageUrl" class="message-image-item">
                  <button class="message-image-button" type="button" @click="openImageModal(imageUrl)">
                    <img class="message-image-preview" :src="toRenderableImageUrl(imageUrl)" alt="Message image preview" loading="lazy" />
                  </button>
                </li>
              </ul>

              <div v-if="message.fileAttachments && message.fileAttachments.length > 0" class="message-file-attachments">
                <span v-for="att in message.fileAttachments" :key="att.path" class="message-file-chip">
                  <span class="message-file-chip-icon">📄</span>
                  <span class="message-file-chip-name" :title="att.path">{{ att.label }}</span>
                </span>
              </div>

              <article v-if="message.text.length > 0" class="message-card" :data-role="message.role" data-html-renderer="false">
                <div v-if="message.messageType === 'worked'" class="worked-separator-wrap" aria-live="polite">
                  <button type="button" class="worked-separator" @click="toggleWorkedExpand(message)">
                    <span class="worked-separator-line" aria-hidden="true" />
                    <span class="worked-chevron" :class="{ 'worked-chevron-open': isWorkedExpanded(message) }">▶</span>
                    <p class="worked-separator-text">{{ message.text }}</p>
                    <span class="worked-separator-line" aria-hidden="true" />
                  </button>
                  <div v-if="isWorkedExpanded(message)" class="worked-details">
                    <div
                      v-for="cmd in getCommandsForWorked(messages, messages.indexOf(message))"
                      :key="`worked-cmd-${cmd.id}`"
                      class="worked-cmd-item"
                    >
                      <button
                        type="button"
                        class="cmd-row"
                        :class="[commandStatusClass(cmd), { 'cmd-expanded': isCommandExpanded(cmd) }]"
                        @click="toggleCommandExpand(cmd)"
                      >
                        <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandExpanded(cmd) }">▶</span>
                        <code class="cmd-label">{{ cmd.commandExecution?.command || '(command)' }}</code>
                        <span class="cmd-status">{{ commandStatusLabel(cmd) }}</span>
                      </button>
                      <div
                        class="cmd-output-wrap"
                        :class="{ 'cmd-output-visible': isCommandExpanded(cmd), 'cmd-output-collapsing': isCommandCollapsing(cmd) }"
                      >
                        <div class="cmd-output-inner">
                          <pre class="cmd-output">{{ cmd.commandExecution?.aggregatedOutput || '(no output)' }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="message-text-flow">
                  <template v-for="(block, blockIndex) in parseRenderableMarkdownBlocks(message.text)" :key="`block-${blockIndex}`">
                    <p v-if="block.kind === 'paragraph'" class="message-text">
                      <template v-for="(segment, segmentIndex) in block.segments" :key="`seg-${blockIndex}-${segmentIndex}`">
                        <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                        <a v-else-if="segment.kind === 'link'" class="message-link" :href="segment.href" target="_blank" rel="noopener noreferrer">
                          {{ segment.label }}
                        </a>
                        <strong v-else-if="segment.kind === 'strong'" class="message-inline-strong">{{ segment.value }}</strong>
                        <em v-else-if="segment.kind === 'em'" class="message-inline-em">{{ segment.value }}</em>
                        <span v-else-if="segment.kind === 'strike'" class="message-inline-strike">{{ segment.value }}</span>
                        <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>
                          {{ segment.displayName }}
                        </a>
                        <code v-else class="message-inline-code">{{ segment.value }}</code>
                      </template>
                    </p>
                    <p v-else-if="block.kind === 'heading'" class="message-heading" :data-level="block.level">
                      <template v-for="(segment, segmentIndex) in block.segments" :key="`heading-${blockIndex}-${segmentIndex}`">
                        <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                        <a v-else-if="segment.kind === 'link'" class="message-link" :href="segment.href" target="_blank" rel="noopener noreferrer">
                          {{ segment.label }}
                        </a>
                        <strong v-else-if="segment.kind === 'strong'" class="message-inline-strong">{{ segment.value }}</strong>
                        <em v-else-if="segment.kind === 'em'" class="message-inline-em">{{ segment.value }}</em>
                        <span v-else-if="segment.kind === 'strike'" class="message-inline-strike">{{ segment.value }}</span>
                        <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>
                          {{ segment.displayName }}
                        </a>
                        <code v-else class="message-inline-code">{{ segment.value }}</code>
                      </template>
                    </p>
                    <blockquote v-else-if="block.kind === 'blockquote'" class="message-blockquote">
                      <p v-for="(line, lineIndex) in block.lines" :key="`quote-${blockIndex}-${lineIndex}`" class="message-blockquote-line">
                        <MarkdownInlineSegments :segments="line" />
                      </p>
                    </blockquote>
                    <component
                      :is="block.ordered ? 'ol' : 'ul'"
                      v-else-if="block.kind === 'list'"
                      class="message-list"
                      :class="{ 'message-list-ordered': block.ordered }"
                    >
                      <li v-for="(item, itemIndex) in block.items" :key="`list-${blockIndex}-${itemIndex}`" class="message-list-item" :class="{ 'message-task-list-item': item.checked !== null }">
                        <input v-if="item.checked !== null" class="message-task-checkbox" type="checkbox" :checked="item.checked" disabled />
                        <span class="message-list-item-content">
                          <template v-for="(segment, segmentIndex) in item.segments" :key="`list-${blockIndex}-${itemIndex}-${segmentIndex}`">
                            <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                            <a v-else-if="segment.kind === 'link'" class="message-link" :href="segment.href" target="_blank" rel="noopener noreferrer">
                              {{ segment.label }}
                            </a>
                            <strong v-else-if="segment.kind === 'strong'" class="message-inline-strong">{{ segment.value }}</strong>
                            <em v-else-if="segment.kind === 'em'" class="message-inline-em">{{ segment.value }}</em>
                            <span v-else-if="segment.kind === 'strike'" class="message-inline-strike">{{ segment.value }}</span>
                            <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>
                              {{ segment.displayName }}
                            </a>
                            <code v-else class="message-inline-code">{{ segment.value }}</code>
                          </template>
                        </span>
                      </li>
                    </component>
                    <hr v-else-if="block.kind === 'hr'" class="message-hr" />
                    <div v-else-if="block.kind === 'table'" class="message-table-wrap">
                      <table class="message-table">
                        <thead>
                          <tr class="message-table-row">
                            <th v-for="(cell, headerIndex) in block.header" :key="`table-head-${blockIndex}-${headerIndex}`" class="message-table-cell message-table-cell-head">
                              <template v-for="(segment, segmentIndex) in cell" :key="`table-head-${blockIndex}-${headerIndex}-${segmentIndex}`">
                                <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                                <a v-else-if="segment.kind === 'link'" class="message-link" :href="segment.href" target="_blank" rel="noopener noreferrer">{{ segment.label }}</a>
                                <strong v-else-if="segment.kind === 'strong'" class="message-inline-strong">{{ segment.value }}</strong>
                                <em v-else-if="segment.kind === 'em'" class="message-inline-em">{{ segment.value }}</em>
                                <span v-else-if="segment.kind === 'strike'" class="message-inline-strike">{{ segment.value }}</span>
                                <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>{{ segment.displayName }}</a>
                                <code v-else class="message-inline-code">{{ segment.value }}</code>
                              </template>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(row, rowIndex) in block.rows" :key="`table-row-${blockIndex}-${rowIndex}`" class="message-table-row">
                            <td v-for="(cell, cellIndex) in row" :key="`table-row-${blockIndex}-${rowIndex}-${cellIndex}`" class="message-table-cell">
                              <template v-for="(segment, segmentIndex) in cell" :key="`table-row-${blockIndex}-${rowIndex}-${cellIndex}-${segmentIndex}`">
                                <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                                <a v-else-if="segment.kind === 'link'" class="message-link" :href="segment.href" target="_blank" rel="noopener noreferrer">{{ segment.label }}</a>
                                <strong v-else-if="segment.kind === 'strong'" class="message-inline-strong">{{ segment.value }}</strong>
                                <em v-else-if="segment.kind === 'em'" class="message-inline-em">{{ segment.value }}</em>
                                <span v-else-if="segment.kind === 'strike'" class="message-inline-strike">{{ segment.value }}</span>
                                <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>{{ segment.displayName }}</a>
                                <code v-else class="message-inline-code">{{ segment.value }}</code>
                              </template>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div v-else-if="block.kind === 'code'" class="message-code-group">
                      <div v-if="block.language" class="message-code-header">{{ block.language }}</div>
                      <pre class="message-code-block"><code>{{ block.value }}</code></pre>
                    </div>
                    <p v-else-if="isMarkdownImageFailed(message.id, blockIndex)" class="message-text">{{ block.markdown }}</p>
                    <button
                      v-else
                      class="message-image-button"
                      type="button"
                      @click="openImageModal(block.url)"
                    >
                      <img
                        class="message-image-preview message-markdown-image"
                        :src="block.url"
                        :alt="block.alt || 'Embedded message image'"
                        loading="lazy"
                        @error="onMarkdownImageError(message.id, blockIndex)"
                      />
                    </button>
                  </template>
                </div>
              </article>
            </article>

            <button
              v-if="canRollbackMessage(message)"
              class="rollback-button"
              type="button"
              title="Rollback to this message (remove this turn and all after it)"
              @click="onRollback(message)"
            >
              <IconTablerArrowBackUp class="rollback-icon" />
              <span class="rollback-label">Rollback</span>
            </button>
          </div>
        </div>
      </li>
      <li v-if="liveOverlay" class="conversation-item conversation-item-overlay">
        <div class="message-row">
          <div class="message-stack">
            <article class="live-overlay-inline" aria-live="polite">
              <p class="live-overlay-label">{{ liveOverlay.activityLabel }}</p>
              <p
                v-if="liveOverlay.reasoningText"
                class="live-overlay-reasoning"
              >
                {{ liveOverlay.reasoningText }}
              </p>
              <p v-if="liveOverlay.errorText" class="live-overlay-error">{{ liveOverlay.errorText }}</p>
            </article>
          </div>
        </div>
      </li>
      <li ref="bottomAnchorRef" class="conversation-bottom-anchor" />
    </ul>

    <div v-if="modalImageUrl.length > 0" class="image-modal-backdrop" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" type="button" aria-label="Close image preview" @click="closeImageModal">
          <IconTablerX class="icon-svg" />
        </button>
        <img class="image-modal-image" :src="modalImageUrl" alt="Expanded message image" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ThreadScrollState, UiLiveOverlay, UiMessage } from '../../types/codex'
import { parseChatMarkdown } from '../../utils/chatMarkdown.js'
import MarkdownInlineSegments from './MarkdownInlineSegments.vue'
import IconTablerX from '../icons/IconTablerX.vue'
import IconTablerArrowBackUp from '../icons/IconTablerArrowBackUp.vue'

const expandedCommandIds = ref<Set<string>>(new Set())
const collapsingCommandIds = ref<Set<string>>(new Set())
const expandedWorkedIds = ref<Set<string>>(new Set())
const prevCommandStatuses = ref<Record<string, string>>({})

function isCommandMessage(message: UiMessage): boolean {
  return message.messageType === 'commandExecution' && !!message.commandExecution
}

function isCommandExpanded(message: UiMessage): boolean {
  if (message.commandExecution?.status === 'inProgress') return true
  if (collapsingCommandIds.value.has(message.id)) return true
  return expandedCommandIds.value.has(message.id)
}

function isCommandCollapsing(message: UiMessage): boolean {
  return collapsingCommandIds.value.has(message.id)
}

function toggleCommandExpand(message: UiMessage): void {
  if (message.commandExecution?.status === 'inProgress') return
  const next = new Set(expandedCommandIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedCommandIds.value = next
}

function toggleWorkedExpand(message: UiMessage): void {
  const next = new Set(expandedWorkedIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedWorkedIds.value = next
}

function isWorkedExpanded(message: UiMessage): boolean {
  return expandedWorkedIds.value.has(message.id)
}

function commandStatusLabel(message: UiMessage): string {
  const ce = message.commandExecution
  if (!ce) return ''
  switch (ce.status) {
    case 'inProgress': return '⟳ Running'
    case 'completed': return ce.exitCode === 0 ? '✓ Completed' : `✗ Exit ${ce.exitCode ?? '?'}`
    case 'failed': return '✗ Failed'
    case 'declined': return '⊘ Declined'
    case 'interrupted': return '⊘ Interrupted'
    default: return ''
  }
}

function commandStatusClass(message: UiMessage): string {
  const s = message.commandExecution?.status
  if (s === 'inProgress') return 'cmd-status-running'
  if (s === 'completed' && message.commandExecution?.exitCode === 0) return 'cmd-status-ok'
  return 'cmd-status-error'
}

function scheduleCollapse(messageId: string): void {
  const nextCollapsing = new Set(collapsingCommandIds.value)
  nextCollapsing.add(messageId)
  collapsingCommandIds.value = nextCollapsing
  setTimeout(() => {
    const next = new Set(collapsingCommandIds.value)
    next.delete(messageId)
    collapsingCommandIds.value = next
  }, 1000)
}

function getCommandsForWorked(messages: UiMessage[], workedIndex: number): UiMessage[] {
  const result: UiMessage[] = []
  for (let i = workedIndex - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.messageType === 'commandExecution') result.unshift(m)
    else if (m.role === 'user' || m.messageType === 'worked') break
  }
  return result
}

const props = defineProps<{
  messages: UiMessage[]
  liveOverlay: UiLiveOverlay | null
  requestRailCount?: number
  isLoading: boolean
  activeThreadId: string
  scrollState: ThreadScrollState | null
  isTurnInProgress?: boolean
  isRollingBack?: boolean
}>()

const emit = defineEmits<{
  updateScrollState: [payload: { threadId: string; state: ThreadScrollState }]
  rollback: [payload: { turnIndex: number }]
}>()

const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const BOTTOM_THRESHOLD_PX = 16
type InlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'file'; value: string; displayName: string }
type MessageBlock =
  | { kind: 'text'; value: string }
  | { kind: 'image'; url: string; alt: string; markdown: string }

let scrollRestoreFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
let forceBottomOnNextRestore = false
const trackedPendingImages = new WeakSet<HTMLImageElement>()
const failedMarkdownImageKeys = ref<Set<string>>(new Set())

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isOther: boolean
  options: string[]
}

function isFilePath(value: string): boolean {
  if (!value || /\s/u.test(value)) return false
  if (value.endsWith('/') || value.endsWith('\\')) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false

  const looksLikeUnixAbsolute = value.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(value)
  const looksLikeRelative = value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')
  const hasPathSeparator = value.includes('/') || value.includes('\\')
  return looksLikeUnixAbsolute || looksLikeWindowsAbsolute || looksLikeRelative || hasPathSeparator
}

function getBasename(pathValue: string): string {
  const normalized = pathValue.replace(/\\/gu, '/')
  const name = normalized.split('/').filter(Boolean).pop()
  return name || pathValue
}

function parseFileReference(value: string): { path: string; line: number | null } | null {
  if (!value) return null

  let pathValue = value
  let line: number | null = null

  const hashLineMatch = pathValue.match(/^(.*)#L(\d+)(?:C\d+)?$/u)
  if (hashLineMatch) {
    pathValue = hashLineMatch[1]
    line = Number(hashLineMatch[2])
  } else {
    const colonLineMatch = pathValue.match(/^(.*):(\d+)(?::\d+)?$/u)
    if (colonLineMatch) {
      pathValue = colonLineMatch[1]
      line = Number(colonLineMatch[2])
    }
  }

  if (!isFilePath(pathValue)) return null
  return { path: pathValue, line }
}

function parseInlineSegments(text: string): InlineSegment[] {
  if (!text.includes('`')) return [{ kind: 'text', value: text }]

  const segments: InlineSegment[] = []
  let cursor = 0
  let textStart = 0

  while (cursor < text.length) {
    if (text[cursor] !== '`') {
      cursor += 1
      continue
    }

    let openLength = 1
    while (cursor + openLength < text.length && text[cursor + openLength] === '`') {
      openLength += 1
    }
    const delimiter = '`'.repeat(openLength)

    let searchFrom = cursor + openLength
    let closingStart = -1
    while (searchFrom < text.length) {
      const candidate = text.indexOf(delimiter, searchFrom)
      if (candidate < 0) break

      const hasBacktickBefore = candidate > 0 && text[candidate - 1] === '`'
      const hasBacktickAfter =
        candidate + openLength < text.length && text[candidate + openLength] === '`'
      const hasNewLineInside = text.slice(cursor + openLength, candidate).includes('\n')

      if (!hasBacktickBefore && !hasBacktickAfter && !hasNewLineInside) {
        closingStart = candidate
        break
      }
      searchFrom = candidate + 1
    }

    if (closingStart < 0) {
      cursor += openLength
      continue
    }

    if (cursor > textStart) {
      segments.push({ kind: 'text', value: text.slice(textStart, cursor) })
    }

    const token = text.slice(cursor + openLength, closingStart)
    if (token.length > 0) {
      const fileReference = parseFileReference(token)
      if (fileReference) {
        const basename = getBasename(fileReference.path)
        const displayName = fileReference.line ? `${basename} (line ${String(fileReference.line)})` : basename
        segments.push({ kind: 'file', value: token, displayName })
      } else {
        segments.push({ kind: 'code', value: token })
      }
    } else {
      segments.push({ kind: 'text', value: `${delimiter}${delimiter}` })
    }

    cursor = closingStart + openLength
    textStart = cursor
  }

  if (textStart < text.length) {
    segments.push({ kind: 'text', value: text.slice(textStart) })
  }

  return segments
}

function toRenderableImageUrl(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''
  if (
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/codex-local-image?')
  ) {
    return normalized
  }

  if (normalized.startsWith('file://')) {
    return `/codex-local-image?path=${encodeURIComponent(normalized)}`
  }

  const looksLikeUnixAbsolute = normalized.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(normalized)
  if (looksLikeUnixAbsolute || looksLikeWindowsAbsolute) {
    return `/codex-local-image?path=${encodeURIComponent(normalized)}`
  }

  return normalized
}

function parseRenderableMarkdownBlocks(text: string): ReturnType<typeof parseChatMarkdown> {
  return parseChatMarkdown(text).map((block) => {
    if (block.kind !== 'image') return block
    return {
      ...block,
      url: toRenderableImageUrl(block.url),
    }
  })
}

function parseMessageBlocks(text: string): MessageBlock[] {
  if (!text.includes('![') || !text.includes('](')) {
    return [{ kind: 'text', value: text }]
  }

  const blocks: MessageBlock[] = []
  const imagePattern = /!\[([^\]]*)\]\(([^)\n]+)\)/gu
  let cursor = 0

  for (const match of text.matchAll(imagePattern)) {
    const [fullMatch, altRaw, urlRaw] = match
    if (typeof match.index !== 'number') continue

    const start = match.index
    const end = start + fullMatch.length
    const imageUrl = toRenderableImageUrl(urlRaw.trim())
    if (!imageUrl) continue

    if (start > cursor) {
      blocks.push({ kind: 'text', value: text.slice(cursor, start) })
    }

    blocks.push({ kind: 'image', url: imageUrl, alt: altRaw.trim(), markdown: fullMatch })
    cursor = end
  }

  if (cursor < text.length) {
    blocks.push({ kind: 'text', value: text.slice(cursor) })
  }

  return blocks.length > 0 ? blocks : [{ kind: 'text', value: text }]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function canRollbackMessage(message: UiMessage): boolean {
  if (message.role !== 'user' && message.role !== 'assistant') return false
  if (typeof message.turnIndex !== 'number') return false
  if (props.isTurnInProgress || props.isRollingBack) return false
  return true
}

function onRollback(message: UiMessage): void {
  if (!canRollbackMessage(message)) return
  emit('rollback', { turnIndex: message.turnIndex! })
}

function scrollToBottom(): void {
  const container = conversationListRef.value
  const anchor = bottomAnchorRef.value
  if (!container || !anchor) return
  container.scrollTop = container.scrollHeight
  anchor.scrollIntoView({ block: 'end' })
}

function isAtBottom(container: HTMLElement): boolean {
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance <= BOTTOM_THRESHOLD_PX
}

function emitScrollState(container: HTMLElement): void {
  if (!props.activeThreadId) return
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const scrollRatio = maxScrollTop > 0 ? Math.min(Math.max(container.scrollTop / maxScrollTop, 0), 1) : 1
  emit('updateScrollState', {
    threadId: props.activeThreadId,
    state: {
      scrollTop: container.scrollTop,
      isAtBottom: isAtBottom(container),
      scrollRatio,
    },
  })
}

function applySavedScrollState(): void {
  const container = conversationListRef.value
  if (!container) return

  if (forceBottomOnNextRestore) {
    forceBottomOnNextRestore = false
    enforceBottomState()
    return
  }

  const savedState = props.scrollState
  if (!savedState || savedState.isAtBottom) {
    enforceBottomState()
    return
  }

  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const targetScrollTop =
    typeof savedState.scrollRatio === 'number'
      ? savedState.scrollRatio * maxScrollTop
      : savedState.scrollTop
  container.scrollTop = Math.min(Math.max(targetScrollTop, 0), maxScrollTop)
  emitScrollState(container)
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  scrollToBottom()
  emitScrollState(container)
}

function shouldLockToBottom(): boolean {
  const savedState = props.scrollState
  return !savedState || savedState.isAtBottom === true
}

function runBottomLockFrame(): void {
  if (!shouldLockToBottom()) {
    bottomLockFramesLeft = 0
    bottomLockFrame = 0
    return
  }

  enforceBottomState()
  bottomLockFramesLeft -= 1
  if (bottomLockFramesLeft <= 0) {
    bottomLockFrame = 0
    return
  }
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function scheduleBottomLock(frames = 6): void {
  if (!shouldLockToBottom()) return
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  bottomLockFramesLeft = Math.max(frames, 1)
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function onPendingImageSettled(): void {
  scheduleBottomLock(3)
}

function bindPendingImageHandlers(): void {
  if (!shouldLockToBottom()) return
  const container = conversationListRef.value
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>('img.message-image-preview')
  for (const image of images) {
    if (image.complete || trackedPendingImages.has(image)) continue
    trackedPendingImages.add(image)
    image.addEventListener('load', onPendingImageSettled, { once: true })
    image.addEventListener('error', onPendingImageSettled, { once: true })
  }
}

async function scheduleScrollRestore(): Promise<void> {
  await nextTick()
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  scrollRestoreFrame = requestAnimationFrame(() => {
    scrollRestoreFrame = 0
    applySavedScrollState()
    bindPendingImageHandlers()
    scheduleBottomLock()
  })
}


watch(
  () => props.activeThreadId,
  async (nextThreadId, previousThreadId) => {
    if (!nextThreadId || nextThreadId === previousThreadId) return
    forceBottomOnNextRestore = true
    await scheduleScrollRestore()
  },
  { immediate: true },
)

watch(
  () => props.messages,
  async (next) => {
    if (props.isLoading) return

    for (const m of next) {
      if (m.messageType !== 'commandExecution' || !m.commandExecution) continue
      const prev = prevCommandStatuses.value[m.id]
      const cur = m.commandExecution.status
      if (prev === 'inProgress' && cur !== 'inProgress') {
        scheduleCollapse(m.id)
      }
      prevCommandStatuses.value[m.id] = cur
    }

    await scheduleScrollRestore()
  },
)

watch(
  () => props.liveOverlay,
  async (overlay) => {
    if (!overlay) return
    await nextTick()
    enforceBottomState()
    scheduleBottomLock(8)
  },
  { deep: true },
)


watch(
  () => props.requestRailCount,
  async () => {
    if (props.isLoading) return
    await scheduleScrollRestore()
  },
  { immediate: true },
)

watch(
  () => props.isLoading,
  async (loading) => {
    if (loading) return
    await scheduleScrollRestore()
  },
)

watch(
  () => props.activeThreadId,
  () => {
    modalImageUrl.value = ''
    failedMarkdownImageKeys.value = new Set()
  },
  { flush: 'post' },
)

function onConversationScroll(): void {
  const container = conversationListRef.value
  if (!container || props.isLoading) return
  emitScrollState(container)
}

function openImageModal(imageUrl: string): void {
  modalImageUrl.value = toRenderableImageUrl(imageUrl)
}

function markdownImageKey(messageId: string, blockIndex: number): string {
  return `${messageId}:${String(blockIndex)}`
}

function onMarkdownImageError(messageId: string, blockIndex: number): void {
  const next = new Set(failedMarkdownImageKeys.value)
  next.add(markdownImageKey(messageId, blockIndex))
  failedMarkdownImageKeys.value = next
}

function isMarkdownImageFailed(messageId: string, blockIndex: number): boolean {
  return failedMarkdownImageKeys.value.has(markdownImageKey(messageId, blockIndex))
}

function closeImageModal(): void {
  modalImageUrl.value = ''
}

onBeforeUnmount(() => {
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
  }
})
</script>

<style scoped>
@reference "tailwindcss";

.conversation-root {
  @apply h-full min-h-0 p-0 flex flex-col overflow-y-hidden overflow-x-visible bg-transparent border-none rounded-none;
}

.conversation-loading {
  @apply m-0 px-2 sm:px-6 text-sm text-slate-500;
}

.conversation-empty {
  @apply m-0 px-2 sm:px-6 text-sm text-slate-500;
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-2 sm:px-6 py-0 overflow-y-auto overflow-x-visible flex flex-col gap-2 sm:gap-3;
}

.conversation-item {
  @apply m-0 w-full flex;
}

.live-overlay-inline {
  @apply w-full max-w-180 px-0 py-1 flex flex-col gap-1;
}

.live-overlay-label {
  @apply m-0 text-sm leading-5 font-medium text-zinc-600;
}

.live-overlay-reasoning {
  @apply m-0 text-sm leading-5 text-zinc-500 whitespace-pre-wrap;
}

.live-overlay-error {
  @apply m-0 text-sm leading-5 text-rose-600 whitespace-pre-wrap;
}

.message-body {
  @apply flex flex-col max-w-full;
  width: fit-content;
}

.message-body[data-role='user'] {
  @apply ml-auto items-end;
  align-self: flex-end;
}

.message-image-list {
  @apply list-none m-0 mb-2 p-0 flex flex-wrap gap-2;
}

.message-image-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-image-item {
  @apply m-0;
}

.message-image-button {
  @apply block rounded-xl overflow-hidden border border-slate-300 bg-white p-0 transition hover:border-slate-400;
}

.message-image-preview {
  @apply block w-16 h-16 object-cover;
}

.message-file-attachments {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.message-file-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600;
}

.message-file-chip-icon {
  @apply text-[10px] leading-none;
}

.message-file-chip-name {
  @apply truncate max-w-40 font-mono;
}

.message-card {
  @apply max-w-[min(76ch,100%)] px-0 py-0 bg-transparent border-none rounded-none;
}

.message-text-flow {
  @apply flex flex-col gap-2;
}

.message-text {
  @apply m-0 text-sm leading-relaxed whitespace-pre-wrap text-slate-800;
}

.message-heading {
  @apply m-0 font-semibold text-slate-900 leading-tight;
}

.message-heading[data-level='1'] {
  @apply text-xl;
}

.message-heading[data-level='2'] {
  @apply text-lg;
}

.message-heading[data-level='3'],
.message-heading[data-level='4'],
.message-heading[data-level='5'],
.message-heading[data-level='6'] {
  @apply text-base;
}

.message-inline-strong {
  @apply font-semibold text-slate-900;
}

.message-inline-em {
  @apply italic;
}

.message-inline-strike {
  @apply line-through text-slate-500;
}

.message-hr {
  @apply my-1 border-0 border-t border-slate-200;
}

.message-list {
  @apply m-0 pl-5 text-sm leading-relaxed text-slate-800 list-disc flex flex-col gap-1;
}

.message-list-ordered {
  @apply list-decimal;
}

.message-list-item {
  @apply m-0 flex items-start gap-2;
}

.message-list-item-content {
  @apply min-w-0;
}

.message-task-checkbox {
  @apply mt-1 h-4 w-4 shrink-0 accent-slate-900;
}

.message-blockquote {
  @apply m-0 border-l-4 border-slate-200 bg-slate-50 px-3 py-2 rounded-r-xl text-slate-700 flex flex-col gap-1;
}

.message-blockquote-line {
  @apply m-0 text-sm leading-relaxed;
}

.message-table-wrap {
  @apply overflow-x-auto rounded-2xl border border-slate-200 bg-white;
}

.message-table {
  @apply min-w-full border-collapse text-sm text-slate-800;
}

.message-table-cell {
  @apply border border-slate-200 px-3 py-2 text-left align-top;
}

.message-table-cell-head {
  @apply bg-slate-50 font-semibold text-slate-900;
}

.message-code-group {
  @apply overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-slate-50;
}

.message-code-header {
  @apply border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-300;
}

.message-code-block {
  @apply m-0 overflow-x-auto px-3 py-3 text-[13px] leading-6 font-mono whitespace-pre;
}

.message-link {
  @apply text-[#0969da] no-underline hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.message-markdown-image {
  @apply w-auto h-auto max-w-[min(560px,85vw)] max-h-[min(460px,62vh)] object-contain bg-white;
}

.message-inline-code {
  @apply rounded-md border border-slate-200 bg-slate-100/60 px-1.5 py-0.5 text-[0.875em] leading-[1.4] text-slate-900 font-mono;
}

.message-file-link {
  @apply text-sm leading-relaxed text-[#0969da] no-underline hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.message-stack[data-role='user'] {
  @apply items-end;
}

.message-stack[data-role='assistant'],
.message-stack[data-role='system'] {
  @apply items-start;
}

.message-card[data-role='user'] {
  @apply rounded-2xl bg-slate-200 px-3 sm:px-4 py-2 sm:py-3 max-w-[min(560px,100%)];
  width: fit-content;
  margin-left: auto;
  align-self: flex-end;
}

.message-card[data-role='assistant'],
.message-card[data-role='system'] {
  @apply px-0 py-0 bg-transparent border-none rounded-none;
}

.conversation-item[data-message-type='worked'] .message-stack,
.conversation-item[data-message-type='worked'] .message-body,
.conversation-item[data-message-type='worked'] .message-card {
  @apply w-full max-w-full;
}

.worked-separator-wrap {
  @apply w-full flex flex-col gap-0;
}

.worked-separator {
  @apply w-full flex items-center gap-3 bg-transparent border-none cursor-pointer p-0;
}

.worked-chevron {
  @apply text-[9px] text-zinc-400 transition-transform duration-200 flex-shrink-0;
}

.worked-chevron-open {
  transform: rotate(90deg);
}

.worked-separator-line {
  @apply h-px bg-zinc-300/80 flex-1;
}

.worked-separator-text {
  @apply m-0 text-sm leading-relaxed font-normal text-slate-800;
}

.worked-details {
  @apply flex flex-col gap-1.5 pt-2;
}

.worked-cmd-item {
  @apply flex flex-col;
}

.image-modal-backdrop {
  @apply fixed inset-0 z-50 bg-black/40 p-2 sm:p-6 flex items-center justify-center;
}

.image-modal-content {
  @apply relative max-w-[min(92vw,1100px)] max-h-[92vh];
}

.image-modal-close {
  @apply absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/90 text-slate-900 border border-slate-300 flex items-center justify-center;
}

.image-modal-image {
  @apply block max-w-full max-h-[90vh] rounded-2xl shadow-2xl bg-white;
}

.icon-svg {
  @apply w-5 h-5;
}

.conversation-item-rollbackable:hover .rollback-button {
  @apply opacity-100;
}

.rollback-button {
  @apply opacity-0 mt-1 inline-flex items-center gap-1 self-end rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 hover:border-zinc-300;
}

.rollback-icon {
  @apply w-3.5 h-3.5;
}

.rollback-label {
  @apply leading-none;
}

.cmd-row {
  @apply w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 cursor-pointer transition text-left hover:bg-zinc-100;
}

.cmd-row.cmd-expanded {
  @apply rounded-b-none border-b-0;
}

.cmd-chevron {
  @apply text-[10px] text-zinc-400 transition-transform duration-150 flex-shrink-0;
}

.cmd-chevron-open {
  transform: rotate(90deg);
}

.cmd-label {
  @apply flex-1 min-w-0 truncate text-xs font-mono text-zinc-700;
}

.cmd-status {
  @apply text-[11px] font-medium flex-shrink-0;
}

.cmd-status-running .cmd-status {
  @apply text-amber-600;
}

.cmd-status-ok .cmd-status {
  @apply text-emerald-600;
}

.cmd-status-error .cmd-status {
  @apply text-rose-600;
}

.cmd-output-wrap {
  @apply rounded-b-lg bg-zinc-900;
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease-out, border-color 300ms ease-out;
  border: 1px solid transparent;
  border-top: none;
}

.cmd-output-wrap.cmd-output-visible {
  grid-template-rows: 1fr;
  border-color: #e4e4e7;
}

.cmd-output-wrap.cmd-output-collapsing {
  grid-template-rows: 1fr;
  border-color: #e4e4e7;
}

.cmd-output-inner {
  overflow: hidden;
  min-height: 0;
}

.cmd-output {
  @apply m-0 px-3 py-2 text-xs font-mono text-zinc-200 whitespace-pre-wrap break-words max-h-60 overflow-y-auto;
}
</style>
