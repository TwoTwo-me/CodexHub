<template>
  <aside class="thread-review-panel" :style="panelStyle">
    <button class="thread-review-resize-handle" type="button" aria-label="Resize review panel" @mousedown="$emit('resize-start', $event)" />
    <header class="thread-review-panel-header">
      <div>
        <p class="thread-review-panel-eyebrow">{{ title }}</p>
        <p v-if="description" class="thread-review-panel-description">{{ description }}</p>
      </div>
    </header>
    <div class="thread-review-panel-body">
      <slot />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  width: number
  title: string
  description?: string
}>()

defineEmits<{
  'resize-start': [event: MouseEvent]
}>()

const panelStyle = computed(() => ({
  '--thread-review-width': `${props.width}px`,
}))
</script>

<style scoped>
@reference "tailwindcss";

.thread-review-panel {
  @apply relative shrink-0 min-h-0 flex flex-col border-l border-zinc-200 bg-zinc-50/70;
  width: var(--thread-review-width);
}

.thread-review-resize-handle {
  @apply absolute left-0 top-0 bottom-0 w-px bg-zinc-300 hover:bg-zinc-500 cursor-col-resize transition;
}

.thread-review-resize-handle::before {
  content: '';
  @apply absolute -left-2 -right-2 top-0 bottom-0;
}

.thread-review-panel-header {
  @apply px-3 py-3 border-b border-zinc-200;
}

.thread-review-panel-eyebrow {
  @apply m-0 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.thread-review-panel-description {
  @apply m-0 mt-1 text-sm text-zinc-600 leading-5;
}

.thread-review-panel-body {
  @apply flex-1 min-h-0 flex flex-col justify-start gap-0 bg-zinc-50/70 pt-3;
}
</style>
