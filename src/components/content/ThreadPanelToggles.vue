<template>
  <div class="thread-panel-toggles" aria-label="Thread panels">
    <button
      type="button"
      class="thread-panel-toggle"
      :class="{ 'is-active': reviewOpen }"
      :aria-pressed="reviewOpen"
      @click="$emit('toggle-review')"
    >
      Review
    </button>
    <button
      type="button"
      class="thread-panel-toggle"
      :class="{ 'is-active': scopeOpen }"
      :aria-pressed="scopeOpen"
      @click="$emit('toggle-scope')"
    >
      Scope
    </button>
    <button
      type="button"
      class="thread-panel-toggle"
      :class="{ 'is-active': changesOpen }"
      :aria-pressed="changesOpen"
      @click="$emit('toggle-changes')"
    >
      Changes
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  reviewOpen: boolean
  scopeOpen: boolean
  changesOpen: boolean
}>()

defineEmits<{
  'toggle-review': []
  'toggle-scope': []
  'toggle-changes': []
}>()
</script>

<style scoped>
@reference "tailwindcss";

.thread-panel-toggles {
  @apply flex items-center gap-1;
}

.thread-panel-toggle {
  @apply rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900;
}

.thread-panel-toggle.is-active {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white;
}
</style>
