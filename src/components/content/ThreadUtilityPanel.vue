<template>
  <aside class="thread-utility-panel" :style="panelStyle">
    <button class="thread-utility-resize-handle" type="button" aria-label="Resize utility panel" @mousedown="$emit('resize-start', $event)" />
    <section v-if="scopeOpen" class="thread-utility-section" :style="scopeSectionStyle" aria-label="Scope browser panel">
      <header class="thread-utility-header">
        <p class="thread-utility-title">Scope browser</p>
        <button class="thread-utility-refresh" type="button" aria-label="Refresh scope browser" @click="$emit('refresh-scope')">
          Refresh
        </button>
      </header>
      <div class="thread-utility-body">
        <slot name="scope" />
      </div>
    </section>

    <button
      v-if="scopeOpen && changesOpen"
      class="thread-utility-split-handle"
      type="button"
      aria-label="Resize scope and changes split"
      @mousedown="$emit('split-resize-start', $event)"
    />

    <section v-if="changesOpen" class="thread-utility-section" aria-label="Change navigator panel">
      <header class="thread-utility-header">
        <p class="thread-utility-title">Change navigator</p>
        <button class="thread-utility-refresh" type="button" aria-label="Refresh change navigator" @click="$emit('refresh-changes')">
          Refresh
        </button>
      </header>
      <div class="thread-utility-body">
        <slot name="changes" />
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  width: number
  scopeOpen: boolean
  changesOpen: boolean
  splitRatio?: number
}>()

defineEmits<{
  'refresh-scope': []
  'refresh-changes': []
  'resize-start': [event: MouseEvent]
  'split-resize-start': [event: MouseEvent]
}>()

const panelStyle = computed(() => ({
  '--thread-utility-width': `${props.width}px`,
}))

const scopeSectionStyle = computed(() => {
  if (!(props.scopeOpen && props.changesOpen)) return undefined
  const ratio = typeof props.splitRatio === 'number' ? props.splitRatio : 0.55
  return {
    flex: `0 0 ${ratio * 100}%`,
  }
})
</script>

<style scoped>
@reference "tailwindcss";

.thread-utility-panel {
  @apply relative shrink-0 min-h-0 flex flex-col border-l border-zinc-200 bg-white;
  width: var(--thread-utility-width);
}

.thread-utility-resize-handle {
  @apply absolute left-0 top-0 bottom-0 w-px bg-zinc-300 hover:bg-zinc-500 cursor-col-resize transition;
}

.thread-utility-resize-handle::before {
  content: '';
  @apply absolute -left-2 -right-2 top-0 bottom-0;
}

.thread-utility-section {
  @apply flex-1 min-h-0 flex flex-col;
}

.thread-utility-section + .thread-utility-section {
  @apply border-t border-zinc-200;
}

.thread-utility-split-handle {
  @apply relative h-px w-full bg-zinc-300 hover:bg-zinc-500 cursor-row-resize transition;
}

.thread-utility-split-handle::before {
  content: '';
  @apply absolute left-0 right-0 -top-2 -bottom-2;
}

.thread-utility-header {
  @apply px-3 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between gap-2;
}

.thread-utility-title {
  @apply m-0 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.thread-utility-body {
  @apply flex-1 min-h-0 overflow-y-auto px-3 py-3;
}

.thread-utility-refresh {
  @apply rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium uppercase tracking-[0.04em] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800;
}
</style>
