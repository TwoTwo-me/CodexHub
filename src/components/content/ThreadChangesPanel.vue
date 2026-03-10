<template>
  <div class="thread-changes-panel">
    <p v-if="isLoading" class="thread-changes-status">Loading changes…</p>
    <p v-else-if="errorMessage" class="thread-changes-status thread-changes-status-error">{{ errorMessage }}</p>
    <p v-else-if="!isGitRepo" class="thread-changes-status">This thread cwd is not inside a Git repository.</p>
    <p v-else-if="files.length === 0" class="thread-changes-status">No changes detected for the active thread scope.</p>

    <ul v-else class="thread-changes-list">
      <li v-for="row in files" :key="row.path">
        <button
          type="button"
          class="thread-change-button"
          :class="{ 'is-active': row.path === selectedPath }"
          @click="$emit('select-file', row.path)"
        >
          <span class="thread-change-path">{{ row.path }}</span>
          <span class="thread-change-meta">
            <span class="thread-change-status" :data-status="row.status">{{ row.status }}</span>
            <span>{{ row.additions }}+</span>
            <span>{{ row.deletions }}-</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { UiThreadReviewChange } from '../../types/codex'

defineProps<{
  files: UiThreadReviewChange[]
  selectedPath: string
  isGitRepo: boolean
  isLoading: boolean
  errorMessage: string
}>()

defineEmits<{
  'select-file': [path: string]
}>()
</script>

<style scoped>
@reference "tailwindcss";

.thread-changes-panel {
  @apply flex min-h-0 flex-col gap-3;
}

.thread-changes-status {
  @apply m-0 text-sm text-zinc-500;
}

.thread-changes-status-error {
  @apply text-rose-600;
}

.thread-changes-list {
  @apply m-0 flex min-h-0 flex-col gap-1 overflow-y-auto p-0;
}

.thread-change-button {
  @apply flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left transition hover:bg-zinc-100;
}

.thread-change-button.is-active {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800;
}

.thread-change-path {
  @apply min-w-0 flex-1 truncate text-sm font-medium;
}

.thread-change-meta {
  @apply flex shrink-0 items-center gap-2 text-xs;
}

.thread-change-status[data-status='modified'] {
  @apply text-amber-600;
}

.thread-change-status[data-status='added'],
.thread-change-status[data-status='untracked'] {
  @apply text-emerald-600;
}

.thread-change-status[data-status='deleted'] {
  @apply text-rose-600;
}
</style>
