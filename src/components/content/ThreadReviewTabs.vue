<template>
  <div class="thread-review-tabs" @wheel.prevent="onWheel" @mousedown="onMouseDown">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="thread-review-tab"
      :class="{ 'is-active': tab.key === activeKey }"
      :title="tab.path"
      type="button"
      @click="$emit('select', tab.key)"
    >
      <span class="thread-review-tab-label">{{ fileName(tab.path) }}</span>
      <button
        v-if="tab.key === activeKey"
        class="thread-review-tab-close"
        type="button"
        aria-label="Close review tab"
        @click.stop="$emit('close', tab.key)"
      >
        ×
      </button>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  tabs: Array<{ key: string; path: string; source: 'scope' | 'changes' }>
  activeKey: string
}>()

const emit = defineEmits<{
  select: [key: string]
  close: [key: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
let dragStartX = 0
let dragStartScrollLeft = 0
let isDragging = false

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function onWheel(event: WheelEvent): void {
  const root = event.currentTarget as HTMLElement | null
  if (!root) return
  root.scrollLeft += event.deltaY
}

function onMouseDown(event: MouseEvent): void {
  const root = event.currentTarget as HTMLElement | null
  if (!root) return
  rootRef.value = root
  dragStartX = event.clientX
  dragStartScrollLeft = root.scrollLeft
  isDragging = true
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(event: MouseEvent): void {
  if (!isDragging || !rootRef.value) return
  rootRef.value.scrollLeft = dragStartScrollLeft - (event.clientX - dragStartX)
}

function onMouseUp(): void {
  isDragging = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-review-tabs {
  @apply flex items-center gap-1 overflow-x-auto px-3 pb-2 cursor-grab;
  scrollbar-width: thin;
}

.thread-review-tabs:active {
  @apply cursor-grabbing;
}

.thread-review-tab {
  @apply shrink-0 inline-flex items-center gap-1 rounded-t-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600;
}

.thread-review-tab.is-active {
  @apply border-zinc-900 bg-zinc-900 text-white;
}

.thread-review-tab-label {
  @apply max-w-36 truncate;
}

.thread-review-tab-close {
  @apply inline-flex h-4 w-4 items-center justify-center rounded-full border-0 bg-transparent text-inherit;
}
</style>
