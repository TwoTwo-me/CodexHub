<template>
  <div class="thread-changes-panel">
    <p v-if="isLoading" class="thread-changes-status">Loading changes…</p>
    <p v-else-if="errorMessage" class="thread-changes-status thread-changes-status-error">{{ errorMessage }}</p>
    <p v-else-if="!isGitRepo" class="thread-changes-status">This thread cwd is not inside a Git repository.</p>
    <p v-else-if="rows.length === 0" class="thread-changes-status">No changes detected for the active thread scope.</p>

    <ul v-else class="thread-changes-list">
      <li v-for="row in rows" :key="row.key">
        <button
          type="button"
          class="thread-change-button"
          :class="{ 'is-active': row.kind === 'file' && row.path === selectedPath }"
          :style="{ paddingLeft: `${12 + row.depth * 16}px` }"
          @click="onRowClick(row)"
        >
          <span class="thread-change-prefix" aria-hidden="true">{{ row.kind === 'directory' ? (isExpanded(row.path) ? '▾' : '▸') : '•' }}</span>
          <span class="thread-change-path">{{ row.name }}</span>
          <span v-if="row.kind === 'file' && row.file" class="thread-change-meta">
            <span class="thread-change-status" :data-status="row.file.status">{{ row.file.status }}</span>
            <span>{{ row.file.additions }}+</span>
            <span>{{ row.file.deletions }}-</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UiThreadReviewChange } from '../../types/codex'
import { buildThreadChangeTree, flattenThreadChangeTree } from './threadChangeTree.js'

const props = defineProps<{
  files: UiThreadReviewChange[]
  selectedPath: string
  isGitRepo: boolean
  isLoading: boolean
  errorMessage: string
}>()

const emit = defineEmits<{
  'select-file': [path: string]
}>()

const expanded = ref<Record<string, boolean>>({})
const tree = computed(() => buildThreadChangeTree(props.files))
const rows = computed(() => flattenThreadChangeTree(tree.value, expanded.value))

function isExpanded(path: string): boolean {
  return expanded.value[path] === true
}

function onRowClick(row: ReturnType<typeof flattenThreadChangeTree>[number]): void {
  if (row.kind === 'directory') {
    expanded.value = {
      ...expanded.value,
      [row.path]: !isExpanded(row.path),
    }
    return
  }

  emit('select-file', row.path)
}
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
  @apply flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left transition hover:bg-zinc-100;
}

.thread-change-button.is-active {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800;
}

.thread-change-prefix {
  @apply inline-flex w-4 shrink-0 items-center justify-center;
}

.thread-change-path {
  @apply min-w-0 flex-1 truncate text-sm font-medium;
}

.thread-change-meta {
  @apply ml-auto flex shrink-0 items-center gap-2 text-xs;
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
