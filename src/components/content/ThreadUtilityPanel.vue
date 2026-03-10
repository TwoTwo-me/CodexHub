<template>
  <aside class="thread-utility-panel" :style="panelStyle">
    <section v-if="scopeOpen" class="thread-utility-section" aria-label="Scope browser panel">
      <header class="thread-utility-header">
        <p class="thread-utility-title">Scope browser</p>
      </header>
      <div class="thread-utility-body">
        <slot name="scope" />
      </div>
    </section>

    <section v-if="changesOpen" class="thread-utility-section" aria-label="Change navigator panel">
      <header class="thread-utility-header">
        <p class="thread-utility-title">Change navigator</p>
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
}>()

const panelStyle = computed(() => ({
  '--thread-utility-width': `${props.width}px`,
}))
</script>

<style scoped>
@reference "tailwindcss";

.thread-utility-panel {
  @apply shrink-0 min-h-0 flex flex-col border-l border-zinc-200 bg-white;
  width: var(--thread-utility-width);
}

.thread-utility-section {
  @apply flex-1 min-h-0 flex flex-col;
}

.thread-utility-section + .thread-utility-section {
  @apply border-t border-zinc-200;
}

.thread-utility-header {
  @apply px-3 py-3 border-b border-zinc-200 bg-zinc-50;
}

.thread-utility-title {
  @apply m-0 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.thread-utility-body {
  @apply flex-1 min-h-0 overflow-y-auto px-3 py-3;
}
</style>
