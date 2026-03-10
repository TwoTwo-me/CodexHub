<template>
  <header class="content-header">
    <div class="content-leading">
      <slot name="leading" />
    </div>
    <div class="content-main">
      <h1 v-if="title" class="content-title">{{ title }}</h1>
      <div v-if="$slots.meta" class="content-meta">
        <slot name="meta" />
      </div>
    </div>
    <div class="content-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style scoped>
@reference "tailwindcss";

.content-header {
  @apply relative z-10 w-full min-h-12 sm:min-h-14 flex items-start gap-2 sm:gap-3 px-2 sm:px-3 pt-3 sm:pt-4 pb-3 bg-white border-b border-zinc-300;
}

.content-main {
  @apply min-w-0 flex-1 flex flex-col items-start justify-center gap-1;
}

.content-title {
  @apply m-0 min-w-0 w-full truncate text-sm font-medium leading-6 text-slate-900 max-sm:text-xs;
}

.content-meta {
  @apply min-w-0 w-full;
}

.content-actions {
  @apply self-stretch flex items-end justify-end gap-1;
}

.content-leading {
  @apply flex items-center gap-1;
}
</style>
