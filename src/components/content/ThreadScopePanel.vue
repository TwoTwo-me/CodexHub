<template>
  <div class="thread-scope-panel">
    <div class="thread-scope-copy">
      <p class="thread-scope-line"><strong>Server:</strong> {{ serverLabel }}</p>
      <p class="thread-scope-line"><strong>Project:</strong> {{ projectLabel }}</p>
      <p class="thread-scope-line"><strong>CWD:</strong> {{ cwd || 'Not available' }}</p>
    </div>

    <p v-if="isLoadingRoot" class="thread-scope-status">Loading files…</p>
    <p v-else-if="errorMessage" class="thread-scope-status thread-scope-status-error">{{ errorMessage }}</p>
    <p v-else-if="visibleRows.length === 0" class="thread-scope-status">No files found for this scope.</p>

    <ul v-else class="thread-scope-results">
      <li v-for="row in visibleRows" :key="row.path">
        <button
          type="button"
          class="thread-scope-result"
          :class="{ 'is-directory': row.kind === 'directory', 'is-binary': row.kind === 'file' && !row.isText }"
          :style="{ paddingLeft: `${12 + row.depth * 16}px` }"
          @click="void onRowClick(row)"
        >
          <span class="thread-scope-result-prefix" aria-hidden="true">{{ row.kind === 'directory' ? (isExpanded(row.path) ? '▾' : '▸') : row.isText ? '•' : '×' }}</span>
          <span class="thread-scope-result-name">{{ row.name }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getFsTree, type FsTreeEntry, type FsTreeListing } from '../../api/codexGateway'

const emit = defineEmits<{
  'select-file': [path: string]
}>()

const props = defineProps<{
  serverLabel: string
  projectLabel: string
  cwd: string
}>()

const listings = ref<Record<string, FsTreeListing>>({})
const expanded = ref<Record<string, boolean>>({})
const errorMessage = ref('')
const isLoadingRoot = ref(false)
let requestToken = 0

const rootPath = computed(() => props.cwd.trim())

function isExpanded(path: string): boolean {
  return expanded.value[path] === true
}

function resetTree(): void {
  listings.value = {}
  expanded.value = {}
  errorMessage.value = ''
  isLoadingRoot.value = false
}

async function loadTree(path: string): Promise<void> {
  const cwd = rootPath.value
  if (!cwd) return
  const token = ++requestToken
  const target = path.trim() || cwd
  if (target === cwd) {
    isLoadingRoot.value = true
  }
  errorMessage.value = ''
  try {
    const listing = await getFsTree(cwd, target)
    if (token !== requestToken) return
    listings.value = {
      ...listings.value,
      [listing.currentPath]: listing,
    }
  } catch (error) {
    if (token !== requestToken) return
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load scoped files.'
  } finally {
    if (token === requestToken && target === cwd) {
      isLoadingRoot.value = false
    }
  }
}

function buildVisibleRows(path: string): FsTreeEntry[] {
  const listing = listings.value[path]
  if (!listing) return []
  const rows: FsTreeEntry[] = []
  for (const entry of listing.entries) {
    rows.push(entry)
    if (entry.kind === 'directory' && isExpanded(entry.path)) {
      rows.push(...buildVisibleRows(entry.path))
    }
  }
  return rows
}

const visibleRows = computed(() => {
  const cwd = rootPath.value
  if (!cwd) return []
  return buildVisibleRows(cwd)
})

async function onRowClick(row: FsTreeEntry): Promise<void> {
  errorMessage.value = ''
  if (row.kind === 'directory') {
    const nextExpanded = !isExpanded(row.path)
    expanded.value = {
      ...expanded.value,
      [row.path]: nextExpanded,
    }
    if (nextExpanded && !listings.value[row.path]) {
      await loadTree(row.path)
    }
    return
  }

  if (!row.isText) {
    errorMessage.value = 'Binary files are not opened in the review viewer.'
    return
  }

  emit('select-file', row.path)
}

watch(
  () => props.cwd,
  (nextCwd) => {
    resetTree()
    const cwd = nextCwd.trim()
    if (!cwd) return
    void loadTree(cwd)
  },
  { immediate: true },
)
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
  @apply flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900;
}

.thread-scope-result.is-directory {
  @apply font-medium;
}

.thread-scope-result.is-binary {
  @apply text-zinc-400;
}

.thread-scope-result-prefix {
  @apply inline-flex w-4 shrink-0 items-center justify-center;
}

.thread-scope-result-name {
  @apply min-w-0 truncate;
}
</style>
