<template>
  <aside class="thread-review-panel" :style="panelStyle">
    <header class="thread-review-panel-header">
      <div>
        <p class="thread-review-panel-eyebrow">{{ title }}</p>
        <p class="thread-review-panel-description">{{ description }}</p>
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
  description: string
}>()

const panelStyle = computed(() => ({
  '--thread-review-width': `${props.width}px`,
}))
</script>

<style scoped>
@reference "tailwindcss";

.thread-review-panel {
  @apply shrink-0 min-h-0 flex flex-col border-l border-zinc-200 bg-zinc-50/70;
  width: var(--thread-review-width);
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
