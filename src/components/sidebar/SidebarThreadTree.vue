<template>
  <section class="thread-tree-root">
    <section v-if="availableServers.length > 0" class="server-hierarchy-section">
      <SidebarMenuRow as="header" class="thread-tree-header-row">
        <span class="thread-tree-header">Explorer</span>
        <template #right>
          <div class="folder-actions">
            <button class="folder-action-button" type="button" @click="expandAllFolders">Expand</button>
            <button class="folder-action-button" type="button" @click="collapseAllFolders">Collapse</button>
          </div>
        </template>
      </SidebarMenuRow>

      <ul class="server-list">
        <li
          v-for="server in availableServers"
          :key="server.id || server.label"
          class="server-row-item"
        >
          <SidebarMenuRow
            as="div"
            class="server-row-button"
            role="button"
            tabindex="0"
            :data-active="isServerSelected(server.id)"
            :title="server.description || server.label"
            @click="onServerRowClick(server.id)"
            @keydown.enter.prevent="onServerRowClick(server.id)"
            @keydown.space.prevent="onServerRowClick(server.id)"
          >
            <template #left>
              <span class="project-icon-stack">
                <span class="project-icon-folder">
                  <IconTablerFolder v-if="isServerCollapsed(server.id)" class="thread-icon" />
                  <IconTablerFolderOpen v-else class="thread-icon" />
                </span>
                <span class="project-icon-chevron">
                  <IconTablerChevronRight v-if="isServerCollapsed(server.id)" class="thread-icon" />
                  <IconTablerChevronDown v-else class="thread-icon" />
                </span>
              </span>
              <span v-if="hasPendingHooks && isServerSelected(server.id)" class="hook-alert-dot" data-scope="server" />
            </template>
            <span class="server-row-label">{{ server.label }}</span>
            <template #right>
              <span v-if="isServerSelected(server.id)" class="server-row-active-tag">Active</span>
            </template>
          </SidebarMenuRow>

          <section v-if="isServerPanelVisibleFor(server.id)" class="server-node-children">
            <SidebarMenuRow v-if="isServerCollapsed(server.id)" as="p" class="server-collapsed-row">
              <template #left>
                <span class="project-empty-spacer" />
              </template>
              <span class="project-empty">Server folder is collapsed</span>
            </SidebarMenuRow>

            <section v-else class="server-tree-children">
              <section v-if="pinnedThreadsForServer(server.id).length > 0" class="pinned-section">
                <ul class="thread-list">
                  <li v-for="thread in pinnedThreadsForServer(server.id)" :key="`pinned:${server.id}:${thread.id}`" class="thread-row-item">
                    <SidebarMenuRow
                      class="thread-row"
                      :data-active="thread.id === selectedThreadId"
                      :data-pinned="isPinned(thread.id)"
                      :force-right-hover="isThreadRenaming(server.id, thread.id)"
                      @mouseleave="onThreadRowLeave(server.id, thread.id)"
                    >
                      <template #left>
                        <span class="thread-left-stack">
                          <span
                            v-if="thread.inProgress || thread.unread"
                            class="thread-status-indicator"
                            :data-state="getThreadState(thread)"
                          />
                          <span v-if="hasThreadPendingHook(thread.id)" class="hook-alert-dot hook-alert-dot-inline" data-scope="thread" />
                          <button class="thread-pin-button" type="button" title="pin" @click.stop="togglePin(thread.id)">
                            <IconTablerPin class="thread-icon" />
                          </button>
                        </span>
                      </template>
                      <button v-if="!isThreadRenaming(server.id, thread.id)" class="thread-main-button" type="button" @click="onSelect(server.id, thread.id)">
                        <span class="thread-row-title-wrap">
                          <span class="thread-row-title">{{ thread.title }}</span>
                          <IconTablerGitFork v-if="thread.hasWorktree" class="thread-row-worktree-icon" title="Worktree thread" />
                        </span>
                      </button>
                      <div v-else class="thread-rename-wrap">
                        <input
                          ref="threadRenameInputRef"
                          v-model="threadRenameDraft"
                          class="thread-rename-input"
                          type="text"
                          aria-label="Rename thread"
                          @click.stop
                          @keydown.enter.prevent="commitThreadRename(server.id, thread.id, thread.title)"
                          @keydown.escape.prevent="cancelThreadRename"
                          @blur="commitThreadRename(server.id, thread.id, thread.title)"
                        />
                      </div>
                      <template #right>
                        <span class="thread-row-time">{{ formatRelative(thread.createdAtIso || thread.updatedAtIso) }}</span>
                      </template>
                      <template #right-hover>
                        <div class="thread-row-hover-actions">
                          <button class="thread-rename-button" type="button" title="rename_thread" @click.stop="openThreadRename(server.id, thread)">
                            <IconTablerFilePencil class="thread-icon" />
                          </button>
                          <button
                            class="thread-archive-button"
                            :data-confirm="archiveConfirmThreadKey === threadRowKey(server.id, thread.id)"
                            type="button"
                            title="archive_thread"
                            @click.stop="onArchiveClick(server.id, thread.id)"
                          >
                            <span v-if="archiveConfirmThreadKey === threadRowKey(server.id, thread.id)">confirm</span>
                            <IconTablerArchive v-else class="thread-icon" />
                          </button>
                        </div>
                      </template>
                    </SidebarMenuRow>
                  </li>
                </ul>
              </section>

              <p v-if="isSearchActive && filteredGroupsForServer(server.id).length === 0 && !serverLoading(server.id)" class="thread-tree-no-results">No matching threads</p>
              <p v-else-if="serverLoading(server.id) && groupsForServer(server.id).length === 0" class="thread-tree-loading">Loading threads...</p>

              <ul v-else-if="isChronologicalView" class="thread-list thread-list-global">
                <li v-for="thread in globalThreadsForServer(server.id)" :key="`${server.id}:${thread.id}`" class="thread-row-item">
                  <SidebarMenuRow
                    class="thread-row"
                    :data-active="thread.id === selectedThreadId"
                    :data-pinned="isPinned(thread.id)"
                    :force-right-hover="isThreadRenaming(server.id, thread.id)"
                    @mouseleave="onThreadRowLeave(server.id, thread.id)"
                  >
                    <template #left>
                      <span class="thread-left-stack">
                        <span
                          v-if="thread.inProgress || thread.unread"
                          class="thread-status-indicator"
                          :data-state="getThreadState(thread)"
                        />
                        <span v-if="hasThreadPendingHook(thread.id)" class="hook-alert-dot hook-alert-dot-inline" data-scope="thread" />
                        <button class="thread-pin-button" type="button" title="pin" @click.stop="togglePin(thread.id)">
                          <IconTablerPin class="thread-icon" />
                        </button>
                      </span>
                    </template>
                    <button v-if="!isThreadRenaming(server.id, thread.id)" class="thread-main-button" type="button" @click="onSelect(server.id, thread.id)">
                      <span class="thread-row-title-wrap">
                        <span class="thread-row-title">{{ thread.title }}</span>
                        <IconTablerGitFork v-if="thread.hasWorktree" class="thread-row-worktree-icon" title="Worktree thread" />
                      </span>
                    </button>
                    <div v-else class="thread-rename-wrap">
                      <input
                        ref="threadRenameInputRef"
                        v-model="threadRenameDraft"
                        class="thread-rename-input"
                        type="text"
                        aria-label="Rename thread"
                        @click.stop
                        @keydown.enter.prevent="commitThreadRename(server.id, thread.id, thread.title)"
                        @keydown.escape.prevent="cancelThreadRename"
                        @blur="commitThreadRename(server.id, thread.id, thread.title)"
                      />
                    </div>
                    <template #right>
                      <span class="thread-row-time">{{ formatRelative(thread.createdAtIso || thread.updatedAtIso) }}</span>
                    </template>
                    <template #right-hover>
                      <div class="thread-row-hover-actions">
                        <button class="thread-rename-button" type="button" title="rename_thread" @click.stop="openThreadRename(server.id, thread)">
                          <IconTablerFilePencil class="thread-icon" />
                        </button>
                        <button
                          class="thread-archive-button"
                          :data-confirm="archiveConfirmThreadKey === threadRowKey(server.id, thread.id)"
                          type="button"
                          title="archive_thread"
                          @click.stop="onArchiveClick(server.id, thread.id)"
                        >
                          <span v-if="archiveConfirmThreadKey === threadRowKey(server.id, thread.id)">confirm</span>
                          <IconTablerArchive v-else class="thread-icon" />
                        </button>
                      </div>
                    </template>
                  </SidebarMenuRow>
                </li>
              </ul>

              <div v-else class="thread-tree-groups">
                <article
                  v-for="group in filteredGroupsForServer(server.id)"
                  :key="scopedProjectKey(server.id, group.projectName)"
                  class="project-group"
                  :data-project-name="group.projectName"
                  :data-expanded="!isProjectCollapsed(server.id, group.projectName)"
                >
                  <SidebarMenuRow
                    as="div"
                    class="project-header-row"
                    role="button"
                    tabindex="0"
                    @click="toggleProjectCollapse(server.id, group.projectName)"
                    @keydown.enter.prevent="toggleProjectCollapse(server.id, group.projectName)"
                    @keydown.space.prevent="toggleProjectCollapse(server.id, group.projectName)"
                    @keydown="onProjectHeaderKeyDown($event, server.id, group.projectName)"
                  >
                    <template #left>
                      <span class="project-icon-stack">
                        <span class="project-icon-folder">
                          <IconTablerFolder v-if="isProjectCollapsed(server.id, group.projectName)" class="thread-icon" />
                          <IconTablerFolderOpen v-else class="thread-icon" />
                        </span>
                        <span class="project-icon-chevron">
                          <IconTablerChevronRight v-if="isProjectCollapsed(server.id, group.projectName)" class="thread-icon" />
                          <IconTablerChevronDown v-else class="thread-icon" />
                        </span>
                      </span>
                      <span v-if="hasProjectPendingHook(group.projectName)" class="hook-alert-dot" data-scope="project" />
                    </template>
                    <span class="project-main-button">
                      <span class="project-title">{{ getProjectDisplayName(server.id, group.projectName) }}</span>
                    </span>
                    <template #right>
                      <div class="project-hover-controls">
                        <div :ref="(el) => setProjectMenuWrapRef(scopedProjectKey(server.id, group.projectName), el)" class="project-menu-wrap">
                          <button
                            class="project-menu-trigger"
                            type="button"
                            title="project_menu"
                            @click.stop="toggleProjectMenu(server.id, group.projectName)"
                          >
                            <IconTablerDots class="thread-icon" />
                          </button>

                          <div v-if="isProjectMenuOpen(server.id, group.projectName)" class="project-menu-panel" @click.stop>
                            <template v-if="projectMenuMode === 'actions'">
                              <button class="project-menu-item" type="button" @click="openRenameProjectMenu(server.id, group.projectName)">
                                Edit name
                              </button>
                              <button
                                class="project-menu-item project-menu-item-danger"
                                type="button"
                                @click="onRemoveProject(server.id, group.projectName)"
                              >
                                Remove
                              </button>
                            </template>
                            <template v-else>
                              <label class="project-menu-label">Project name</label>
                              <input
                                v-model="projectRenameDraft"
                                class="project-menu-input"
                                type="text"
                                @input="onProjectNameInput(server.id, group.projectName)"
                              />
                            </template>
                          </div>
                        </div>

                        <button
                          class="thread-start-button"
                          type="button"
                          :aria-label="getNewThreadButtonAriaLabel(server.id, group.projectName)"
                          :title="getNewThreadButtonAriaLabel(server.id, group.projectName)"
                          @click.stop="onStartNewThread(server.id, group.projectName)"
                        >
                          <IconTablerFilePencil class="thread-icon" />
                        </button>
                      </div>
                    </template>
                  </SidebarMenuRow>

                  <ul v-if="hasThreads(server.id, group)" class="thread-list">
                    <li v-for="thread in visibleThreads(server.id, group)" :key="`${server.id}:${thread.id}`" class="thread-row-item">
                      <SidebarMenuRow
                        class="thread-row"
                        :data-active="thread.id === selectedThreadId"
                        :data-pinned="isPinned(thread.id)"
                        :force-right-hover="isThreadRenaming(server.id, thread.id)"
                        @mouseleave="onThreadRowLeave(server.id, thread.id)"
                      >
                        <template #left>
                          <span class="thread-left-stack">
                            <span
                              v-if="thread.inProgress || thread.unread"
                              class="thread-status-indicator"
                              :data-state="getThreadState(thread)"
                            />
                            <span v-if="hasThreadPendingHook(thread.id)" class="hook-alert-dot hook-alert-dot-inline" data-scope="thread" />
                            <button class="thread-pin-button" type="button" title="pin" @click.stop="togglePin(thread.id)">
                              <IconTablerPin class="thread-icon" />
                            </button>
                          </span>
                        </template>
                        <button v-if="!isThreadRenaming(server.id, thread.id)" class="thread-main-button" type="button" @click="onSelect(server.id, thread.id)">
                          <span class="thread-row-title-wrap">
                            <span class="thread-row-title">{{ thread.title }}</span>
                            <IconTablerGitFork v-if="thread.hasWorktree" class="thread-row-worktree-icon" title="Worktree thread" />
                          </span>
                        </button>
                        <div v-else class="thread-rename-wrap">
                          <input
                            ref="threadRenameInputRef"
                            v-model="threadRenameDraft"
                            class="thread-rename-input"
                            type="text"
                            aria-label="Rename thread"
                            @click.stop
                            @keydown.enter.prevent="commitThreadRename(server.id, thread.id, thread.title)"
                            @keydown.escape.prevent="cancelThreadRename"
                            @blur="commitThreadRename(server.id, thread.id, thread.title)"
                          />
                        </div>
                        <template #right>
                          <span class="thread-row-time">{{ formatRelative(thread.createdAtIso || thread.updatedAtIso) }}</span>
                        </template>
                        <template #right-hover>
                          <div class="thread-row-hover-actions">
                            <button class="thread-rename-button" type="button" title="rename_thread" @click.stop="openThreadRename(server.id, thread)">
                              <IconTablerFilePencil class="thread-icon" />
                            </button>
                            <button
                              class="thread-archive-button"
                              :data-confirm="archiveConfirmThreadKey === threadRowKey(server.id, thread.id)"
                              type="button"
                              title="archive_thread"
                              @click.stop="onArchiveClick(server.id, thread.id)"
                            >
                              <span v-if="archiveConfirmThreadKey === threadRowKey(server.id, thread.id)">confirm</span>
                              <IconTablerArchive v-else class="thread-icon" />
                            </button>
                          </div>
                        </template>
                      </SidebarMenuRow>
                    </li>
                  </ul>

                  <SidebarMenuRow v-else-if="shouldShowProjectEmpty(isProjectCollapsed(server.id, group.projectName), group.threads.length)" as="p" class="project-empty-row">
                    <template #left>
                      <span class="project-empty-spacer" />
                    </template>
                    <span class="project-empty">No threads</span>
                  </SidebarMenuRow>

                  <SidebarMenuRow v-if="hasHiddenThreads(server.id, group)" class="thread-show-more-row">
                    <template #left>
                      <span class="thread-show-more-spacer" />
                    </template>
                    <button class="thread-show-more-button" type="button" @click="toggleProjectExpansion(server.id, group.projectName)">
                      {{ isExpanded(server.id, group.projectName) ? 'Show less' : 'Show more' }}
                    </button>
                  </SidebarMenuRow>
                </article>
              </div>
            </section>
          </section>
        </li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { UiProjectGroup, UiThread } from '../../types/codex'
import { isServerPanelVisible, shouldShowProjectEmpty, toServerTreeKey } from '../../composables/sidebarExplorerState.js'
import IconTablerArchive from '../icons/IconTablerArchive.vue'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'
import IconTablerDots from '../icons/IconTablerDots.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerFolderOpen from '../icons/IconTablerFolderOpen.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'
import IconTablerPin from '../icons/IconTablerPin.vue'
import SidebarMenuRow from './SidebarMenuRow.vue'

type ServerOption = {
  id: string
  label: string
  description?: string
}

const props = withDefaults(defineProps<{
  groups: UiProjectGroup[]
  groupsByServerId?: Record<string, UiProjectGroup[]>
  projectDisplayNameById: Record<string, string>
  projectDisplayNameByServerId?: Record<string, Record<string, string>>
  availableServers: ServerOption[]
  selectedServerId: string
  selectedThreadId: string
  isLoading: boolean
  loadingByServerId?: Record<string, boolean>
  searchQuery: string
  hasPendingHooks: boolean
  hookCountByProjectName: Record<string, number>
  hookCountByThreadId: Record<string, number>
}>(), {
  groupsByServerId: () => ({}),
  projectDisplayNameByServerId: () => ({}),
  loadingByServerId: () => ({}),
})

const emit = defineEmits<{
  'select-server': [serverId: string]
  select: [payload: { threadId: string; serverId: string }]
  archive: [payload: { threadId: string; serverId: string }]
  'start-new-thread': [payload: { projectName: string; serverId: string }]
  'rename-project': [payload: { projectName: string; serverId: string; displayName: string }]
  'remove-project': [payload: { projectName: string; serverId: string }]
  'reorder-project': [payload: { projectName: string; serverId: string; toIndex: number }]
  'rename-thread': [payload: { threadId: string; serverId: string; title: string }]
}>()

const expandedProjects = ref<Record<string, boolean>>({})
const collapsedProjects = ref<Record<string, boolean>>(loadCollapsedState())
const collapsedServers = ref<Record<string, boolean>>(loadCollapsedServerState())
const pinnedThreadIds = ref<string[]>([])
const archiveConfirmThreadKey = ref('')
const openProjectMenuId = ref('')
const projectMenuMode = ref<'actions' | 'rename'>('actions')
const projectRenameDraft = ref('')
const openThreadRenameKey = ref('')
const threadRenameDraft = ref('')
const threadRenameInputRef = ref<HTMLInputElement | null>(null)
const projectMenuWrapElementByName = new Map<string, HTMLElement>()
const organizeMenuWrapRef = ref<HTMLElement | null>(null)
const isOrganizeMenuOpen = ref(false)
const THREAD_VIEW_MODE_STORAGE_KEY = 'codex-web-local.thread-view-mode.v1'
const threadViewMode = ref<'project' | 'chronological'>(loadThreadViewMode())
const COLLAPSED_STORAGE_KEY = 'codex-web-local.collapsed-projects.v1'
const COLLAPSED_SERVERS_STORAGE_KEY = 'codex-web-local.collapsed-servers.v1'

function loadCollapsedState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, boolean>
  } catch {
    return {}
  }
}

function loadCollapsedServerState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(COLLAPSED_SERVERS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, boolean>
  } catch {
    return {}
  }
}

function loadThreadViewMode(): 'project' | 'chronological' {
  if (typeof window === 'undefined') return 'project'
  const raw = window.localStorage.getItem(THREAD_VIEW_MODE_STORAGE_KEY)
  return raw === 'chronological' ? 'chronological' : 'project'
}

watch(
  collapsedProjects,
  (value) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(value))
  },
  { deep: true },
)

watch(
  collapsedServers,
  (value) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COLLAPSED_SERVERS_STORAGE_KEY, JSON.stringify(value))
  },
  { deep: true },
)

watch(threadViewMode, (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THREAD_VIEW_MODE_STORAGE_KEY, value)
})

const normalizedSearchQuery = computed(() => props.searchQuery.trim().toLowerCase())
const isSearchActive = computed(() => normalizedSearchQuery.value.length > 0)
const isChronologicalView = computed(() => threadViewMode.value === 'chronological')
const selectedServerKey = computed(() => toServerTreeKey(props.selectedServerId || props.availableServers[0]?.id || ''))

function scopedProjectKey(serverId: string, projectName: string): string {
  return `${toServerTreeKey(serverId)}::${projectName.trim()}`
}

function threadRowKey(serverId: string, threadId: string): string {
  return `${toServerTreeKey(serverId)}::${threadId.trim()}`
}

function serverLoading(serverId: string): boolean {
  const key = toServerTreeKey(serverId)
  if (props.loadingByServerId[key] !== undefined) {
    return props.loadingByServerId[key] === true
  }
  return isServerSelected(serverId) ? props.isLoading : false
}

function groupsForServer(serverId: string): UiProjectGroup[] {
  const key = toServerTreeKey(serverId)
  const cached = props.groupsByServerId[key]
  if (cached) return cached
  return isServerSelected(serverId) ? props.groups : []
}

function filteredGroupsForServer(serverId: string): UiProjectGroup[] {
  const groups = groupsForServer(serverId)
  if (!isSearchActive.value) return groups
  return groups
    .map((group) => ({
      ...group,
      threads: group.threads.filter(threadMatchesSearch),
    }))
    .filter((group) => group.threads.length > 0)
}

function globalThreadsForServer(serverId: string): UiThread[] {
  const rows: UiThread[] = []
  for (const group of filteredGroupsForServer(serverId)) {
    rows.push(...group.threads)
  }
  return rows.sort((first, second) => {
    const firstTimestamp = new Date(first.updatedAtIso || first.createdAtIso).getTime()
    const secondTimestamp = new Date(second.updatedAtIso || second.createdAtIso).getTime()
    return secondTimestamp - firstTimestamp
  })
}

function projectDisplayNamesForServer(serverId: string): Record<string, string> {
  const key = toServerTreeKey(serverId)
  return props.projectDisplayNameByServerId[key] ?? (isServerSelected(serverId) ? props.projectDisplayNameById : {})
}

function getProjectDisplayName(serverId: string, projectName: string): string {
  return projectDisplayNamesForServer(serverId)[projectName] ?? projectName
}

function threadMatchesSearch(thread: UiThread): boolean {
  if (!isSearchActive.value) return true
  const q = normalizedSearchQuery.value
  return thread.title.toLowerCase().includes(q) || thread.preview.toLowerCase().includes(q)
}

function pinnedThreadsForServer(serverId: string): UiThread[] {
  const threadById = new Map<string, UiThread>()
  for (const group of groupsForServer(serverId)) {
    for (const thread of group.threads) {
      threadById.set(thread.id, thread)
    }
  }
  return pinnedThreadIds.value
    .map((threadId) => threadById.get(threadId) ?? null)
    .filter((thread): thread is UiThread => thread !== null)
    .filter(threadMatchesSearch)
}

function formatRelative(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'n/a'
  const diffMs = Math.abs(Date.now() - timestamp)
  if (diffMs < 60000) return 'now'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function isPinned(threadId: string): boolean {
  return pinnedThreadIds.value.includes(threadId)
}

function togglePin(threadId: string): void {
  if (isPinned(threadId)) {
    pinnedThreadIds.value = pinnedThreadIds.value.filter((id) => id !== threadId)
    return
  }
  pinnedThreadIds.value = [threadId, ...pinnedThreadIds.value]
}

function isServerCollapsedByKey(serverKey: string): boolean {
  return collapsedServers.value[serverKey] === true
}

function isServerCollapsed(serverId: string): boolean {
  return isServerCollapsedByKey(toServerTreeKey(serverId))
}

function isServerSelected(serverId: string): boolean {
  return selectedServerKey.value === toServerTreeKey(serverId)
}

function isServerPanelVisibleFor(serverId: string): boolean {
  return isServerPanelVisible(collapsedServers.value, props.selectedServerId, serverId)
}

function onServerRowClick(serverId: string): void {
  const serverKey = toServerTreeKey(serverId)
  if (!isServerSelected(serverId)) {
    collapsedServers.value = {
      ...collapsedServers.value,
      [serverKey]: false,
    }
    emit('select-server', serverId)
    return
  }
  collapsedServers.value = {
    ...collapsedServers.value,
    [serverKey]: !isServerCollapsedByKey(serverKey),
  }
}

function onSelect(serverId: string, threadId: string): void {
  emit('select', { threadId, serverId })
}

function openThreadRename(serverId: string, thread: UiThread): void {
  openThreadRenameKey.value = threadRowKey(serverId, thread.id)
  threadRenameDraft.value = thread.title
  nextTick(() => threadRenameInputRef.value?.focus())
}

function isThreadRenaming(serverId: string, threadId: string): boolean {
  return openThreadRenameKey.value === threadRowKey(serverId, threadId)
}

function cancelThreadRename(): void {
  openThreadRenameKey.value = ''
  threadRenameDraft.value = ''
}

function commitThreadRename(serverId: string, threadId: string, previousTitle: string): void {
  const nextTitle = threadRenameDraft.value.trim()
  const activeKey = threadRowKey(serverId, threadId)
  if (openThreadRenameKey.value !== activeKey) return
  cancelThreadRename()
  if (!nextTitle || nextTitle === previousTitle.trim()) return
  emit('rename-thread', { threadId, serverId, title: nextTitle })
}

function expandAllFolders(): void {
  const nextCollapsedServers = { ...collapsedServers.value }
  for (const server of props.availableServers) {
    nextCollapsedServers[toServerTreeKey(server.id)] = false
  }
  collapsedServers.value = nextCollapsedServers

  const nextCollapsedProjects = { ...collapsedProjects.value }
  const nextExpandedProjects = { ...expandedProjects.value }
  for (const server of props.availableServers) {
    for (const group of groupsForServer(server.id)) {
      nextCollapsedProjects[scopedProjectKey(server.id, group.projectName)] = false
      nextExpandedProjects[scopedProjectKey(server.id, group.projectName)] = true
    }
  }
  collapsedProjects.value = nextCollapsedProjects
  expandedProjects.value = nextExpandedProjects
}

function collapseAllFolders(): void {
  const nextCollapsedServers = { ...collapsedServers.value }
  for (const server of props.availableServers) {
    nextCollapsedServers[toServerTreeKey(server.id)] = true
  }
  collapsedServers.value = nextCollapsedServers

  const nextCollapsedProjects = { ...collapsedProjects.value }
  const nextExpandedProjects = { ...expandedProjects.value }
  for (const server of props.availableServers) {
    for (const group of groupsForServer(server.id)) {
      nextCollapsedProjects[scopedProjectKey(server.id, group.projectName)] = true
      nextExpandedProjects[scopedProjectKey(server.id, group.projectName)] = false
    }
  }
  collapsedProjects.value = nextCollapsedProjects
  expandedProjects.value = nextExpandedProjects
}

function onArchiveClick(serverId: string, threadId: string): void {
  const nextKey = threadRowKey(serverId, threadId)
  if (archiveConfirmThreadKey.value !== nextKey) {
    archiveConfirmThreadKey.value = nextKey
    return
  }
  archiveConfirmThreadKey.value = ''
  pinnedThreadIds.value = pinnedThreadIds.value.filter((id) => id !== threadId)
  emit('archive', { threadId, serverId })
}

function onThreadRowLeave(serverId: string, threadId: string): void {
  if (archiveConfirmThreadKey.value === threadRowKey(serverId, threadId)) {
    archiveConfirmThreadKey.value = ''
  }
}

function isProjectMenuOpen(serverId: string, projectName: string): boolean {
  return openProjectMenuId.value === scopedProjectKey(serverId, projectName)
}

function closeProjectMenu(): void {
  openProjectMenuId.value = ''
  projectMenuMode.value = 'actions'
  projectRenameDraft.value = ''
}

function toggleOrganizeMenu(): void {
  isOrganizeMenuOpen.value = !isOrganizeMenuOpen.value
}

function setThreadViewMode(mode: 'project' | 'chronological'): void {
  threadViewMode.value = mode
  isOrganizeMenuOpen.value = false
}

function toggleProjectMenu(serverId: string, projectName: string): void {
  const nextKey = scopedProjectKey(serverId, projectName)
  if (openProjectMenuId.value === nextKey) {
    closeProjectMenu()
    return
  }
  openProjectMenuId.value = nextKey
  projectMenuMode.value = 'actions'
  projectRenameDraft.value = getProjectDisplayName(serverId, projectName)
}

function openRenameProjectMenu(serverId: string, projectName: string): void {
  openProjectMenuId.value = scopedProjectKey(serverId, projectName)
  projectMenuMode.value = 'rename'
  projectRenameDraft.value = getProjectDisplayName(serverId, projectName)
}

function onProjectNameInput(serverId: string, projectName: string): void {
  emit('rename-project', {
    projectName,
    serverId,
    displayName: projectRenameDraft.value,
  })
}

function onRemoveProject(serverId: string, projectName: string): void {
  emit('remove-project', { projectName, serverId })
  closeProjectMenu()
}

function onProjectHeaderKeyDown(event: KeyboardEvent, serverId: string, projectName: string): void {
  if (!event.altKey) return
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  const groups = groupsForServer(serverId)
  const currentIndex = groups.findIndex((group) => group.projectName === projectName)
  if (currentIndex < 0) return
  const delta = event.key === 'ArrowUp' ? -1 : 1
  const targetIndex = Math.max(0, Math.min(currentIndex + delta, groups.length - 1))
  if (targetIndex === currentIndex) return
  event.preventDefault()
  emit('reorder-project', { projectName, serverId, toIndex: targetIndex })
}

function expansionKey(serverId: string, projectName: string): string {
  return scopedProjectKey(serverId, projectName)
}

function isExpanded(serverId: string, projectName: string): boolean {
  return expandedProjects.value[expansionKey(serverId, projectName)] === true
}

function isProjectCollapsed(serverId: string, projectName: string): boolean {
  return collapsedProjects.value[scopedProjectKey(serverId, projectName)] === true
}

function hasProjectPendingHook(projectName: string): boolean {
  return (props.hookCountByProjectName[projectName] ?? 0) > 0
}

function hasThreadPendingHook(threadId: string): boolean {
  return (props.hookCountByThreadId[threadId] ?? 0) > 0
}

function toggleProjectExpansion(serverId: string, projectName: string): void {
  const key = expansionKey(serverId, projectName)
  expandedProjects.value = {
    ...expandedProjects.value,
    [key]: !isExpanded(serverId, projectName),
  }
}

function toggleProjectCollapse(serverId: string, projectName: string): void {
  const key = scopedProjectKey(serverId, projectName)
  collapsedProjects.value = {
    ...collapsedProjects.value,
    [key]: !isProjectCollapsed(serverId, projectName),
  }
}

function visibleThreads(serverId: string, group: UiProjectGroup): UiThread[] {
  if (isSearchActive.value) return group.threads
  if (isProjectCollapsed(serverId, group.projectName)) return []
  return isExpanded(serverId, group.projectName) ? group.threads : group.threads.slice(0, 10)
}

function hasHiddenThreads(serverId: string, group: UiProjectGroup): boolean {
  if (isSearchActive.value) return false
  return !isProjectCollapsed(serverId, group.projectName) && group.threads.length > 10
}

function hasThreads(serverId: string, group: UiProjectGroup): boolean {
  return visibleThreads(serverId, group).length > 0
}

function getThreadState(thread: UiThread): 'working' | 'unread' | 'idle' {
  if (thread.inProgress) return 'working'
  if (thread.unread) return 'unread'
  return 'idle'
}

function getNewThreadButtonAriaLabel(serverId: string, projectName: string): string {
  return `start new thread ${getProjectDisplayName(serverId, projectName)}`
}

function onStartNewThread(serverId: string, projectName: string): void {
  emit('start-new-thread', { projectName, serverId })
}

function setProjectMenuWrapRef(projectKey: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement =
    element instanceof HTMLElement
      ? element
      : element && '$el' in element && element.$el instanceof HTMLElement
        ? element.$el
        : null
  if (htmlElement) {
    projectMenuWrapElementByName.set(projectKey, htmlElement)
    return
  }
  projectMenuWrapElementByName.delete(projectKey)
}

function isEventInsideOpenProjectMenu(event: Event): boolean {
  const projectKey = openProjectMenuId.value
  if (!projectKey) return false
  const openMenuWrapElement = projectMenuWrapElementByName.get(projectKey)
  if (!openMenuWrapElement) return false
  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (eventPath.includes(openMenuWrapElement)) return true
  const target = event.target
  return target instanceof Node ? openMenuWrapElement.contains(target) : false
}

function onProjectMenuPointerDown(event: PointerEvent): void {
  if (isOrganizeMenuOpen.value) {
    const organizeElement = organizeMenuWrapRef.value
    const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
    const isInsideOrganizeMenu = !!organizeElement && (eventPath.includes(organizeElement) || (event.target instanceof Node && organizeElement.contains(event.target)))
    if (!isInsideOrganizeMenu) {
      isOrganizeMenuOpen.value = false
    }
  }
  if (!openProjectMenuId.value) return
  if (isEventInsideOpenProjectMenu(event)) return
  closeProjectMenu()
}

function onProjectMenuFocusIn(event: FocusEvent): void {
  if (!openProjectMenuId.value) return
  if (isEventInsideOpenProjectMenu(event)) return
  closeProjectMenu()
}

function onWindowBlurForProjectMenu(): void {
  if (isOrganizeMenuOpen.value) {
    isOrganizeMenuOpen.value = false
  }
  if (!openProjectMenuId.value) return
  closeProjectMenu()
}

function bindProjectMenuDismissListeners(): void {
  window.addEventListener('pointerdown', onProjectMenuPointerDown, { capture: true })
  window.addEventListener('focusin', onProjectMenuFocusIn, { capture: true })
  window.addEventListener('blur', onWindowBlurForProjectMenu)
}

function unbindProjectMenuDismissListeners(): void {
  window.removeEventListener('pointerdown', onProjectMenuPointerDown, { capture: true })
  window.removeEventListener('focusin', onProjectMenuFocusIn, { capture: true })
  window.removeEventListener('blur', onWindowBlurForProjectMenu)
}

watch(
  () => ({
    selectedServerId: props.selectedServerId,
    serverKeys: props.availableServers.map((server) => toServerTreeKey(server.id)),
  }),
  ({ selectedServerId, serverKeys }) => {
    if (serverKeys.length === 0) return
    const activeServerKey = toServerTreeKey(selectedServerId || props.availableServers[0]?.id || '')
    if (isServerCollapsedByKey(activeServerKey)) {
      collapsedServers.value = {
        ...collapsedServers.value,
        [activeServerKey]: false,
      }
    }
    const serverKeySet = new Set(serverKeys)
    const nextCollapsedServers = Object.fromEntries(
      Object.entries(collapsedServers.value).filter(([serverKey]) => serverKeySet.has(serverKey)),
    ) as Record<string, boolean>
    if (Object.keys(nextCollapsedServers).length !== Object.keys(collapsedServers.value).length) {
      collapsedServers.value = nextCollapsedServers
    }
  },
  { immediate: true },
)

const hasOpenDismissableMenu = computed(() => isOrganizeMenuOpen.value || openProjectMenuId.value !== '')

watch(hasOpenDismissableMenu, (isOpen) => {
  if (isOpen) {
    bindProjectMenuDismissListeners()
    return
  }
  unbindProjectMenuDismissListeners()
})

onBeforeUnmount(() => {
  projectMenuWrapElementByName.clear()
  unbindProjectMenuDismissListeners()
})
</script>

<style scoped>
@reference "tailwindcss";

.thread-tree-root {
  @apply flex flex-col;
}

.server-hierarchy-section {
  @apply mb-1;
}

.folder-actions {
  @apply flex items-center gap-1;
}

.folder-action-button {
  @apply h-5 rounded-md border border-zinc-200 px-1.5 text-[10px] font-medium uppercase tracking-[0.04em] text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-700;
}

.server-list {
  @apply list-none m-0 p-0 flex flex-col gap-0.5;
}

.server-row-item {
  @apply m-0;
}

.server-row-button {
  @apply w-full rounded-lg transition bg-zinc-100/70 hover:bg-zinc-200 cursor-pointer;
}

.server-row-button[data-active='true'] {
  @apply bg-zinc-900 text-white;
}

.server-row-label {
  @apply block text-sm font-medium truncate;
}

.server-row-active-tag {
  @apply text-[10px] uppercase tracking-[0.06em] text-inherit/80;
}

.server-collapsed-row {
  @apply py-1;
}

.server-node-children {
  @apply mt-0.5 ml-2;
}

.server-tree-children {
  @apply pl-2 border-l border-zinc-200 flex flex-col gap-1;
}

.pinned-section {
  @apply mb-1;
}

.thread-tree-header-row {
  @apply cursor-default;
}

.thread-tree-header {
  @apply text-sm font-normal text-zinc-500 select-none;
}

.organize-menu-wrap {
  @apply relative;
}

.organize-menu-trigger {
  @apply h-5 w-5 rounded text-zinc-500 flex items-center justify-center transition hover:bg-zinc-200 hover:text-zinc-700;
}

.organize-menu-panel {
  @apply absolute right-0 top-full mt-1 z-30 min-w-44 rounded-xl border border-zinc-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm;
}

.organize-menu-title {
  @apply px-2 py-1 text-xs text-zinc-500;
}

.organize-menu-item {
  @apply w-full rounded-lg px-2 py-1.5 text-sm text-zinc-700 flex items-center justify-between hover:bg-zinc-100;
}

.organize-menu-item[data-active='true'] {
  @apply bg-zinc-100 text-zinc-900;
}

.thread-tree-loading {
  @apply px-3 py-2 text-sm text-zinc-500;
}

.thread-tree-no-results {
  @apply px-3 py-2 text-sm text-zinc-400;
}

.thread-tree-groups {
  @apply pr-0.5 flex flex-col gap-1;
}

.project-group {
  @apply m-0;
}

.project-header-row {
  @apply hover:bg-zinc-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400;
}

.project-main-button {
  @apply min-w-0 w-full text-left rounded px-0 py-0 flex items-center min-h-5;
}

.project-icon-stack {
  @apply relative w-4 h-4 flex items-center justify-center text-zinc-500;
}

.project-icon-folder {
  @apply absolute inset-0 flex items-center justify-center opacity-100;
}

.project-icon-chevron {
  @apply absolute inset-0 items-center justify-center opacity-0 hidden;
}

.project-title {
  @apply text-sm font-normal text-zinc-700 truncate select-none;
}

.project-menu-wrap {
  @apply relative;
}

.project-hover-controls {
  @apply flex items-center gap-1;
}

.project-menu-trigger {
  @apply h-4 w-4 rounded p-0 text-zinc-600 flex items-center justify-center;
}

.project-menu-panel {
  @apply absolute right-0 top-full mt-1 z-20 min-w-36 rounded-md border border-zinc-200 bg-white p-1 shadow-md flex flex-col gap-0.5;
}

.project-menu-item {
  @apply rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100;
}

.project-menu-item-danger {
  @apply text-rose-700 hover:bg-rose-50;
}

.project-menu-label {
  @apply px-2 pt-1 text-xs text-zinc-500;
}

.project-menu-input {
  @apply px-2 py-1 text-sm text-zinc-800 bg-transparent border-none outline-none;
}

.thread-start-button {
  @apply h-5 w-5 rounded text-zinc-500 flex items-center justify-center transition hover:bg-zinc-200 hover:text-zinc-700;
}

.project-empty-row {
  @apply cursor-default;
}

.project-empty-spacer {
  @apply block w-4 h-4;
}

.project-empty {
  @apply text-sm text-zinc-400;
}

.thread-list {
  @apply list-none m-0 p-0 flex flex-col gap-0.5;
}

.thread-list-global {
  @apply pr-0.5;
}

.project-group > .thread-list {
  @apply mt-0.5;
}

.thread-row-item {
  @apply m-0;
}

.thread-row {
  @apply hover:bg-zinc-200;
}

.thread-left-stack {
  @apply relative w-4 h-4 flex items-center justify-center;
}

.thread-pin-button {
  @apply absolute inset-0 w-4 h-4 rounded text-zinc-500 opacity-0 pointer-events-none transition flex items-center justify-center;
}

.thread-main-button {
  @apply min-w-0 w-full text-left rounded px-0 py-0 flex items-center min-h-5;
}

.thread-row-title-wrap {
  @apply min-w-0 inline-flex items-center gap-1;
}

.thread-row-title {
  @apply block text-sm leading-5 font-normal text-zinc-800 truncate whitespace-nowrap;
}

.thread-row-worktree-icon {
  @apply w-3 h-3 text-zinc-500 shrink-0;
}

.thread-status-indicator {
  @apply w-2.5 h-2.5 rounded-full;
}

.thread-row-time {
  @apply block text-sm font-normal text-zinc-500;
}

.thread-row-hover-actions {
  @apply flex items-center gap-1;
}

.thread-rename-button,
.thread-archive-button {
  @apply h-4 w-4 rounded p-0 text-xs text-zinc-600 flex items-center justify-center;
}

.thread-archive-button[data-confirm='true'] {
  @apply h-5 w-auto px-1.5;
}

.thread-rename-wrap {
  @apply flex min-w-0 flex-1 items-center;
}

.thread-rename-input {
  @apply w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 outline-none focus:border-zinc-500;
}

.thread-icon {
  @apply w-4 h-4;
}

.thread-show-more-row {
  @apply mt-1;
}

.thread-show-more-spacer {
  @apply block w-4 h-4;
}

.thread-show-more-button {
  @apply block mx-auto rounded-lg px-2 py-0.5 text-sm font-normal text-zinc-600 transition hover:text-zinc-800 hover:bg-zinc-200;
}

.project-header-row:hover .project-icon-folder {
  @apply opacity-0;
}

.project-header-row:hover .project-icon-chevron {
  @apply flex opacity-100;
}

.thread-row[data-active='true'] {
  @apply bg-zinc-200;
}

.thread-row:hover .thread-pin-button,
.thread-row:focus-within .thread-pin-button {
  @apply opacity-100 pointer-events-auto;
}

.thread-status-indicator[data-state='unread'] {
  width: 6.6667px;
  height: 6.6667px;
  @apply bg-blue-600;
}

.thread-status-indicator[data-state='working'] {
  @apply border-2 border-zinc-500 border-t-transparent bg-transparent animate-spin;
}

.thread-row:hover .thread-status-indicator[data-state='unread'],
.thread-row:hover .thread-status-indicator[data-state='working'],
.thread-row:focus-within .thread-status-indicator[data-state='unread'],
.thread-row:focus-within .thread-status-indicator[data-state='working'] {
  @apply opacity-0;
}
</style>

<style scoped>
.hook-alert-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #dc2626;
  box-shadow: 0 0 0 2px rgb(255 255 255 / 0.95);
  flex: 0 0 auto;
}

.hook-alert-dot-inline {
  margin-right: 2px;
}
</style>
