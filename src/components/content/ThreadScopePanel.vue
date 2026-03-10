<template>
  <div class="thread-scope-panel">
    <div class="thread-scope-copy">
      <p class="thread-scope-line"><strong>Server:</strong> {{ serverLabel }}</p>
      <p class="thread-scope-line"><strong>Project:</strong> {{ projectLabel }}</p>
      <p class="thread-scope-line"><strong>CWD:</strong> {{ cwd || 'Not available' }}</p>
    </div>

    <label class="thread-scope-search-wrap">
      <span class="thread-scope-search-label">Files</span>
      <input
        v-model="query"
        class="thread-scope-search-input"
        type="text"
        placeholder="Search files in scope"
      />
    </label>

    <p v-if="isLoading" class="thread-scope-status">Loading files…</p>
    <p v-else-if="errorMessage" class="thread-scope-status thread-scope-status-error">{{ errorMessage }}</p>
    <p v-else-if="rows.length === 0" class="thread-scope-status">No files found for this scope.</p>

    <ul v-else class="thread-scope-results">
      <li v-for="row in rows" :key="row.path">
        <button type="button" class="thread-scope-result" @click="$emit('select-file', row.path)">
          {{ row.path }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { searchComposerFiles } from '../../api/codexGateway'

defineEmits<{
  'select-file': [path: string]
}>()

const props = defineProps<{
  serverLabel: string
  projectLabel: string
  cwd: string
}>()

const query = ref('')
const rows = ref<Array<{ path: string }>>([])
const isLoading = ref(false)
const errorMessage = ref('')
let searchToken = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null

function clearPendingSearch(): void {
  if (!searchTimer) return
  clearTimeout(searchTimer)
  searchTimer = null
}

async function runSearch(): Promise<void> {
  const cwd = props.cwd.trim()
  const token = ++searchToken
  if (!cwd) {
    rows.value = []
    errorMessage.value = ''
    isLoading.value = false
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    const nextRows = await searchComposerFiles(cwd, query.value.trim(), 20)
    if (token !== searchToken) return
    rows.value = nextRows
  } catch (error) {
    if (token !== searchToken) return
    rows.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load scoped files.'
  } finally {
    if (token === searchToken) {
      isLoading.value = false
    }
  }
}

watch(
  () => [props.cwd, query.value],
  () => {
    clearPendingSearch()
    searchTimer = setTimeout(() => {
      void runSearch()
    }, 120)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearPendingSearch()
  searchToken += 1
})
</script>

<style scoped>
@reference "tailwindcss";

.thread-scope-panel {
  @apply flex min-h-0 flex-col gap-3;
}

.thread-scope-copy {
  @apply rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2;
}

.thread-scope-line {
  @apply m-0 text-sm text-zinc-700 break-all;
}

.thread-scope-line + .thread-scope-line {
  @apply mt-1;
}

.thread-scope-search-wrap {
  @apply flex flex-col gap-1;
}

.thread-scope-search-label {
  @apply text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.thread-scope-search-input {
  @apply rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500;
}

.thread-scope-status {
  @apply m-0 text-sm text-zinc-500;
}

.thread-scope-status-error {
  @apply text-rose-600;
}

.thread-scope-results {
  @apply m-0 flex min-h-0 flex-col gap-1 overflow-y-auto p-0;
}

.thread-scope-result {
  @apply w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900;
}
</style>
