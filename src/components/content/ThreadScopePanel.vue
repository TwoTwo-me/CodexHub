<template>
  <div class="thread-scope-panel">
    <p v-if="isLoadingRoot" class="thread-scope-status">Loading files…</p>
    <p v-else-if="errorMessage" class="thread-scope-status thread-scope-status-error">{{ errorMessage }}</p>
    <p v-else-if="visibleRows.length === 0" class="thread-scope-status">No files found for this scope.</p>

    <ul v-else class="thread-scope-results">
      <li v-for="row in visibleRows" :key="row.path">
        <button
          type="button"
          class="thread-scope-result"
          :class="{ 'is-directory': row.kind === 'directory', 'is-binary': row.kind === 'file' && !row.isText }"
          :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
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
  'select-file': [payload: { path: string; allowBinaryRaw?: boolean }]
}>()

const props = defineProps<{
  cwd: string
  refreshToken?: number
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
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('This looks like a binary file. Open it in Review to chat anyway?')
      : false
    if (!confirmed) return
  }

  emit('select-file', {
    path: row.path,
    ...(row.isText ? {} : { allowBinaryRaw: true }),
  })
}

watch(
  () => [props.cwd, props.refreshToken] as const,
  ([nextCwd]) => {
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
  @apply flex min-h-0 flex-col gap-2;
}

.thread-scope-status {
  @apply m-0 text-sm text-zinc-500;
}

.thread-scope-status-error {
  @apply text-rose-600;
}

.thread-scope-results {
  @apply m-0 flex min-h-0 flex-col gap-0.5 overflow-y-auto p-0;
}

.thread-scope-result {
  @apply flex w-full items-center gap-1 rounded-md border-0 bg-transparent px-2 py-1 text-left text-xs text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900;
}

.thread-scope-result.is-directory {
  @apply font-medium;
}

.thread-scope-result.is-binary {
  @apply text-zinc-500;
}

.thread-scope-result-prefix {
  @apply inline-flex w-4 shrink-0 items-center justify-center text-zinc-400;
}

.thread-scope-result-name {
  @apply min-w-0 truncate;
}
</style>
