<template>
  <div ref="rootRef" class="cwd-picker">
    <button class="cwd-trigger" type="button" :aria-expanded="isOpen" @click="onToggleOpen">
      <IconTablerFolder class="cwd-trigger-icon" />
      <span class="cwd-trigger-label">{{ selectedLabel }}</span>
      <IconTablerChevronDown class="cwd-trigger-chevron" />
    </button>

    <div v-if="isOpen" class="cwd-menu-wrap">
      <div class="cwd-menu">
        <div class="cwd-menu-header">
          <button
            class="cwd-up-button"
            type="button"
            :disabled="isLoading || !directory?.parentPath"
            @click="onGoParent"
          >
            ↑ Up
          </button>
          <button
            class="cwd-use-button"
            type="button"
            :disabled="isLoading || !directory"
            @click="onSelectCurrentDirectory"
          >
            Use this folder
          </button>
        </div>

        <p class="cwd-current">{{ currentDirectoryLabel }}</p>
        <p v-if="errorMessage" class="cwd-error">{{ errorMessage }}</p>
        <p v-else-if="isLoading" class="cwd-status">Loading folders...</p>

        <ul v-else class="cwd-list">
          <li v-for="entry in directory?.entries ?? []" :key="entry.path">
            <button class="cwd-entry" type="button" @click="onOpenEntry(entry.path)">
              <IconTablerFolderOpen class="cwd-entry-icon" />
              <span class="cwd-entry-name">{{ entry.name }}</span>
              <IconTablerChevronRight class="cwd-entry-chevron" />
            </button>
          </li>
          <li v-if="(directory?.entries.length ?? 0) === 0" class="cwd-empty">No subfolders</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getFsDirectoryList, type FsDirectoryListing } from '../../api/codexGateway'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerFolderOpen from '../icons/IconTablerFolderOpen.vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const directory = ref<FsDirectoryListing | null>(null)

const selectedLabel = computed(() => formatPathLabel(props.modelValue || '~', directory.value?.homePath ?? ''))
const currentDirectoryLabel = computed(() => {
  if (!directory.value) return selectedLabel.value
  return formatPathLabel(directory.value.currentPath, directory.value.homePath)
})

function onToggleOpen(): void {
  isOpen.value = !isOpen.value
  if (!isOpen.value) return
  const targetPath = props.modelValue.trim()
  void loadDirectory(targetPath === '~' ? '' : (targetPath || '~'))
}

function onOpenEntry(path: string): void {
  if (!path.trim()) return
  void loadDirectory(path)
}

function onGoParent(): void {
  const parentPath = directory.value?.parentPath?.trim() ?? ''
  if (!parentPath) return
  void loadDirectory(parentPath)
}

function onSelectCurrentDirectory(): void {
  const currentPath = directory.value?.currentPath?.trim()
  if (!currentPath) return
  emit('update:modelValue', currentPath)
  isOpen.value = false
}

async function loadDirectory(path: string): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const nextDirectory = await getFsDirectoryList(path)
    directory.value = nextDirectory
    const currentValue = props.modelValue.trim()
    if (!currentValue || currentValue === '~') {
      emit('update:modelValue', nextDirectory.homePath || nextDirectory.currentPath)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load folders'
    errorMessage.value = message
  } finally {
    isLoading.value = false
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (root.contains(target)) return
  isOpen.value = false
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (!isOpen.value) return
  if (event.key !== 'Escape') return
  isOpen.value = false
}

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onDocumentKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('keydown', onDocumentKeyDown)
})

function formatPathLabel(path: string, homePath: string): string {
  const normalizedPath = path.trim()
  const normalizedHome = homePath.trim()
  if (!normalizedPath) return '~'
  if (!normalizedHome) return normalizedPath
  if (normalizedPath === normalizedHome) return '~'
  if (normalizedPath.startsWith(`${normalizedHome}/`)) {
    return `~${normalizedPath.slice(normalizedHome.length)}`
  }
  return normalizedPath
}
</script>

<style scoped>
@reference "tailwindcss";

.cwd-picker {
  @apply relative inline-flex min-w-0;
}

.cwd-trigger {
  @apply inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 transition hover:bg-zinc-100;
}

.cwd-trigger-icon {
  @apply h-3.5 w-3.5 shrink-0 text-zinc-500;
}

.cwd-trigger-label {
  @apply min-w-0 truncate text-left;
}

.cwd-trigger-chevron {
  @apply h-3.5 w-3.5 shrink-0 text-zinc-500;
}

.cwd-menu-wrap {
  @apply absolute left-0 top-[calc(100%+8px)] z-30;
}

.cwd-menu {
  @apply flex w-72 max-w-[min(90vw,28rem)] flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg;
}

.cwd-menu-header {
  @apply flex items-center justify-between gap-1;
}

.cwd-up-button,
.cwd-use-button {
  @apply rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400;
}

.cwd-current {
  @apply m-0 truncate px-1 text-xs text-zinc-500;
}

.cwd-error {
  @apply m-0 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700;
}

.cwd-status {
  @apply m-0 px-1 text-xs text-zinc-500;
}

.cwd-list {
  @apply m-0 max-h-64 list-none overflow-y-auto p-0;
}

.cwd-entry {
  @apply flex w-full items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-1 text-left text-xs text-zinc-700 transition hover:bg-zinc-100;
}

.cwd-entry-icon {
  @apply h-3.5 w-3.5 shrink-0 text-zinc-500;
}

.cwd-entry-name {
  @apply min-w-0 flex-1 truncate;
}

.cwd-entry-chevron {
  @apply h-3.5 w-3.5 shrink-0 text-zinc-400;
}

.cwd-empty {
  @apply px-1.5 py-2 text-xs text-zinc-500;
}
</style>
