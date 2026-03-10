<template>
  <section v-if="isSetupRequired" class="bootstrap-setup-shell">
    <header class="bootstrap-setup-shell-header">
      <div class="bootstrap-setup-shell-identity">
        <p class="bootstrap-setup-shell-eyebrow">Secure the Hub before continuing</p>
        <p class="bootstrap-setup-shell-user">{{ sessionLabel }}</p>
      </div>
      <button
        type="button"
        class="header-session-logout"
        :disabled="isLoggingOut"
        @click="void onLogout()"
      >
        {{ isLoggingOut ? 'Signing out…' : 'Sign out' }}
      </button>
    </header>
    <BootstrapSetupPanel
      :current-username="sessionUser?.username ?? 'admin'"
      @completed="void onBootstrapSetupCompleted()"
    />
  </section>
  <DesktopLayout v-else :is-sidebar-collapsed="isSidebarCollapsed" @close-sidebar="setSidebarCollapsed(true)">
    <template #sidebar>
      <section class="sidebar-root">
        <div class="sidebar-main">
          <SidebarThreadControls
            v-if="!isSidebarCollapsed"
            class="sidebar-thread-controls-host"
            :is-sidebar-collapsed="isSidebarCollapsed"
            :is-auto-refresh-enabled="isAutoRefreshEnabled"
            :auto-refresh-button-label="autoRefreshButtonLabel"
            :show-new-thread-button="true"
            @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
            @toggle-auto-refresh="onToggleAutoRefreshTimer"
            @start-new-thread="onStartNewThreadFromToolbar"
          >
            <button
              class="sidebar-search-toggle"
              type="button"
              :aria-pressed="isSidebarSearchVisible"
              aria-label="Search threads"
              title="Search threads"
              @click="toggleSidebarSearch"
            >
              <IconTablerSearch class="sidebar-search-toggle-icon" />
            </button>
          </SidebarThreadControls>

          <div v-if="!isSidebarCollapsed && isSidebarSearchVisible" class="sidebar-search-bar">
            <IconTablerSearch class="sidebar-search-bar-icon" />
            <input
              ref="sidebarSearchInputRef"
              v-model="sidebarSearchQuery"
              class="sidebar-search-input"
              type="text"
              placeholder="Filter threads..."
              @keydown="onSidebarSearchKeydown"
            />
            <button
              v-if="sidebarSearchQuery.length > 0"
              class="sidebar-search-clear"
              type="button"
              aria-label="Clear search"
              @click="clearSidebarSearch"
            >
              <IconTablerX class="sidebar-search-clear-icon" />
            </button>
          </div>

          <button
            v-if="!isSidebarCollapsed"
            class="sidebar-skills-link"
            :class="{ 'is-active': isSkillsRoute }"
            type="button"
            @click="router.push({ name: 'skills' }); isMobile && setSidebarCollapsed(true)"
          >
            Skill Manager
          </button>

          <button
            v-if="!isSidebarCollapsed"
            class="sidebar-skills-link"
            :class="{ 'is-active': isSettingsRoute }"
            type="button"
            @click="router.push({ name: 'settings' }); isMobile && setSidebarCollapsed(true)"
          >
            Settings
          </button>

          <button
            v-if="!isSidebarCollapsed"
            class="sidebar-skills-link"
            :class="{ 'is-active': isHooksRoute }"
            type="button"
            @click="router.push({ name: 'hooks' }); isMobile && setSidebarCollapsed(true)"
          >
            <span>Hooks</span>
            <span v-if="pendingHookCount > 0" class="sidebar-alert-badge">{{ pendingHookCount }}</span>
          </button>

          <button
            v-if="!isSidebarCollapsed && isAdminUser"
            class="sidebar-skills-link"
            :class="{ 'is-active': isAdminRoute }"
            type="button"
            @click="router.push({ name: 'admin' }); isMobile && setSidebarCollapsed(true)"
          >
            Admin
          </button>

          <SidebarThreadTree :groups="projectGroups" :groups-by-server-id="sidebarGroupsByServerId" :project-display-name-by-id="projectDisplayNameById"
            :project-display-name-by-server-id="sidebarProjectDisplayNamesByServerId"
            v-if="!isSidebarCollapsed"
            :available-servers="availableServers"
            :selected-server-id="selectedServerId"
            :selected-thread-id="selectedThreadId" :is-loading="isLoadingThreads"
            :loading-by-server-id="sidebarLoadingByServerId"
            :search-query="sidebarSearchQuery"
            :has-pending-hooks="hasPendingHooks"
            :hook-count-by-project-name="hookCountByProjectName"
            :hook-count-by-thread-id="hookCountByThreadId"
            @select-server="onSelectServer"
            @select="onSelectThreadFromSidebar"
            @archive="onArchiveThread" @start-new-thread="onStartNewThread" @rename-project="onRenameProject"
            @rename-thread="onRenameThread"
            @remove-project="onRemoveProject" @reorder-project="onReorderProject" />
        </div>

        <footer v-if="!isSidebarCollapsed" class="sidebar-session-footer">
          <div class="sidebar-session-copy">
            <p class="sidebar-session-label">{{ sessionLabel }}</p>
          </div>
          <button
            type="button"
            class="header-session-logout"
            :disabled="isLoggingOut"
            @click="void onLogout()"
          >
            {{ isLoggingOut ? 'Signing out…' : 'Sign out' }}
          </button>
        </footer>
      </section>
    </template>

    <template #content>
        <section class="content-root">
          <ContentHeader :title="contentTitle">
            <template #leading>
            <SidebarThreadControls
              v-if="isSidebarCollapsed || isMobile"
              class="sidebar-thread-controls-header-host"
              :is-sidebar-collapsed="isSidebarCollapsed"
              :is-auto-refresh-enabled="isAutoRefreshEnabled"
              :auto-refresh-button-label="autoRefreshButtonLabel"
              :show-new-thread-button="true"
              @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
              @toggle-auto-refresh="onToggleAutoRefreshTimer"
                @start-new-thread="onStartNewThreadFromToolbar"
            />
          </template>
          <template #meta>
            <div class="header-meta-stack">
              <div v-if="(isHomeRoute && hasRegisteredServers) || isThreadRoute" class="header-control-row">
                <ServerPicker
                  :model-value="selectedServerId"
                  :options="availableServers"
                  mode="compact"
                  :disabled="isThreadRoute"
                  @update:model-value="onSelectServer"
                />
                <CwdPicker
                  class="header-project-picker"
                  :model-value="isHomeRoute ? newThreadCwd : composerCwd"
                  :disabled="isThreadRoute"
                  @update:model-value="(value) => { if (isHomeRoute) newThreadCwd = value }"
                />
              </div>
              <p v-if="isThreadRoute" class="header-thread-title">{{ threadHeaderTitle }}</p>
            </div>
          </template>
          <template #actions>
            <div v-if="isThreadRoute && !isMobile" class="header-panel-actions">
              <ThreadPanelToggles
                :review-open="isThreadReviewOpen"
                :scope-open="isThreadScopeOpen"
                :changes-open="isThreadChangesOpen"
                @toggle-review="toggleThreadReview()"
                @toggle-scope="toggleThreadScope()"
                @toggle-changes="toggleThreadChanges()"
              />
            </div>
          </template>
        </ContentHeader>

        <section class="content-body">
          <div
            v-if="hasPendingHooks && !isHooksRoute"
            class="hook-alert-banner"
            role="status"
            aria-live="polite"
          >
            <div class="hook-alert-banner-copy">
              <p class="hook-alert-banner-title">
                {{ pendingHookCount }} pending approval{{ pendingHookCount === 1 ? '' : 's' }} require{{ pendingHookCount === 1 ? 's' : '' }} attention
              </p>
              <p class="hook-alert-banner-body">
                Review connector hook requests before Codex can continue shell, file, or tool actions.
              </p>
            </div>
            <button type="button" class="hook-alert-banner-action" @click="router.push({ name: 'hooks' })">
              Review hooks
            </button>
          </div>
          <p v-if="hookCompatibilityError" class="content-error">
            {{ hookCompatibilityError }}
          </p>
          <template v-if="isSkillsRoute">
            <SkillsHub
              :server-id="selectedServerId"
              :servers="availableServers"
              @select-server="onSelectServer"
              @skills-changed="onSkillsChanged"
            />
          </template>
          <template v-else-if="isAdminRoute">
            <AdminPanel v-if="isAdminUser" :current-user-id="sessionUser?.id ?? ''" />
            <section v-else class="admin-guard">
              <h2 class="admin-guard-title">Admin access required</h2>
              <p class="admin-guard-subtitle">This page is only available to administrator accounts.</p>
            </section>
          </template>
          <template v-else-if="isSettingsRoute">
            <SettingsPanel
              :servers="availableServers"
              :selected-server-id="selectedServerId"
              @connectors-changed="onConnectorsChanged"
            />
          </template>
          <template v-else-if="isHooksRoute">
            <HookInboxPanel :entries="hookInboxEntries" @open-thread="onOpenHookThread" />
          </template>
          <template v-else-if="isHomeRoute">
            <div class="content-grid">
              <template v-if="hasRegisteredServers">
                <div class="new-thread-empty">
                  <p class="new-thread-hero">New thread</p>
                </div>

                <ThreadComposer :active-thread-id="composerThreadContextId"
                  :cwd="composerCwd"
                  ref="composerRef"
                  :models="availableModelIds" :selected-model="selectedModelId"
                  :selected-reasoning-effort="selectedReasoningEffort" :skills="installedSkills"
                  :is-turn-in-progress="false"
                  :is-interrupting-turn="false" @submit="onSubmitThreadMessage"
                  @update:selected-model="onSelectModel" @update:selected-reasoning-effort="onSelectReasoningEffort" />
              </template>
              <section v-else class="registration-empty-state">
                <p class="registration-empty-eyebrow">Server registration required</p>
                <h2 class="registration-empty-title">Register a server to start a thread</h2>
                <p class="registration-empty-body">
                  Local folders stay unavailable until you explicitly register a server or connector.
                </p>
              </section>
            </div>
          </template>
          <template v-else>
            <div class="thread-workspace">
              <div class="thread-workspace-chat">
                <div class="content-thread">
                  <ThreadConversation :messages="filteredMessages" :is-loading="isLoadingMessages"
                    :active-thread-id="composerThreadContextId" :scroll-state="selectedThreadScrollState"
                    :live-overlay="liveOverlay"
                    :request-rail-count="selectedThreadServerRequests.length"
                    :is-turn-in-progress="isSelectedThreadInProgress"
                    :is-rolling-back="isRollingBack"
                    @update-scroll-state="onUpdateThreadScrollState"
                    @rollback="onRollback" />
                </div>

                <div v-if="!isMobile" class="composer-with-queue">
                  <QueuedMessages
                    :messages="selectedThreadQueuedMessages"
                    @steer="steerQueuedMessage"
                    @delete="removeQueuedMessage"
                  />
                  <ThreadRequestRail
                    :pending-requests="selectedThreadServerRequests"
                    :has-queue-above="selectedThreadQueuedMessages.length > 0"
                    @respond-server-request="onRespondServerRequest"
                  />
                  <ThreadComposer
                    ref="composerRef"
                    :active-thread-id="composerThreadContextId"
                    :draft-scope-key="composerDraftScopeKey"
                    :cwd="composerCwd"
                    :models="availableModelIds"
                    :selected-model="selectedModelId"
                    :selected-reasoning-effort="selectedReasoningEffort"
                    :skills="installedSkills"
                    :is-turn-in-progress="isSelectedThreadInProgress"
                    :is-interrupting-turn="isInterruptingTurn"
                    :has-queue-above="selectedThreadQueuedMessages.length > 0 || selectedThreadServerRequests.length > 0"
                    @submit="onSubmitThreadMessage"
                    @update:selected-model="onSelectModel"
                    @update:selected-reasoning-effort="onSelectReasoningEffort"
                    @interrupt="onInterruptTurn"
                  />
                </div>
              </div>

              <ThreadReviewPanel
                v-if="!isMobile && isThreadReviewOpen"
                :width="threadReviewWidth"
                title="Review to chat"
              >
                <ThreadReviewTabs
                  :tabs="reviewTabs"
                  :active-key="activeReviewTabKey"
                  @select="(key) => { activeReviewTabKey = key }"
                  @close="closeReviewTab"
                />
                <ThreadReviewViewer
                  :cwd="composerCwd"
                  :path="selectedReviewPath"
                  :source="selectedReviewSource"
                  @sync-review-comments="onSyncReviewComments"
                />
              </ThreadReviewPanel>

              <ThreadUtilityPanel
                v-if="!isMobile && isThreadUtilityOpen"
                :width="threadUtilityWidth"
                :scope-open="isThreadScopeOpen"
                :changes-open="isThreadChangesOpen"
                @refresh-scope="scopeRefreshToken += 1"
                @refresh-changes="void refreshThreadReview()"
              >
                <template #scope>
                  <ThreadScopePanel
                    :cwd="composerCwd"
                    :refresh-token="scopeRefreshToken"
                    @select-file="(path) => onSelectReviewFile(path, 'scope')"
                  />
                </template>
                <template #changes>
                  <ThreadChangesPanel
                    :files="reviewChanges"
                    :selected-path="selectedReviewPath"
                    :is-git-repo="reviewIsGitRepo"
                    :is-loading="reviewChangesLoading"
                    :error-message="reviewErrorMessage"
                    @select-file="(path) => onSelectReviewFile(path, 'changes')"
                  />
                </template>
              </ThreadUtilityPanel>

              <div v-if="isMobile" class="composer-with-queue">
                <QueuedMessages
                  :messages="selectedThreadQueuedMessages"
                  @steer="steerQueuedMessage"
                  @delete="removeQueuedMessage"
                />
                <ThreadRequestRail
                  :pending-requests="selectedThreadServerRequests"
                  :has-queue-above="selectedThreadQueuedMessages.length > 0"
                  @respond-server-request="onRespondServerRequest"
                />
                <ThreadComposer :active-thread-id="composerThreadContextId"
                  :cwd="composerCwd"
                  :draft-scope-key="composerDraftScopeKey"
                  ref="composerRef"
                  :models="availableModelIds"
                  :selected-model="selectedModelId" :selected-reasoning-effort="selectedReasoningEffort"
                  :skills="installedSkills"
                  :is-turn-in-progress="isSelectedThreadInProgress" :is-interrupting-turn="isInterruptingTurn"
                  :has-queue-above="selectedThreadQueuedMessages.length > 0 || selectedThreadServerRequests.length > 0"
                  @submit="onSubmitThreadMessage" @update:selected-model="onSelectModel"
                  @update:selected-reasoning-effort="onSelectReasoningEffort" @interrupt="onInterruptTurn" />
              </div>
            </div>
          </template>
        </section>
      </section>
    </template>
  </DesktopLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopLayout from './components/layout/DesktopLayout.vue'
import SidebarThreadTree from './components/sidebar/SidebarThreadTree.vue'
import ContentHeader from './components/content/ContentHeader.vue'
import ThreadConversation from './components/content/ThreadConversation.vue'
import ThreadComposer from './components/content/ThreadComposer.vue'
import QueuedMessages from './components/content/QueuedMessages.vue'
import ThreadRequestRail from './components/content/ThreadRequestRail.vue'
import ThreadPanelToggles from './components/content/ThreadPanelToggles.vue'
import ThreadReviewPanel from './components/content/ThreadReviewPanel.vue'
import ThreadReviewViewer from './components/content/ThreadReviewViewer.vue'
import ThreadReviewTabs from './components/content/ThreadReviewTabs.vue'
import ThreadUtilityPanel from './components/content/ThreadUtilityPanel.vue'
import ThreadScopePanel from './components/content/ThreadScopePanel.vue'
import ThreadChangesPanel from './components/content/ThreadChangesPanel.vue'
import CwdPicker from './components/content/CwdPicker.vue'
import ServerPicker from './components/content/ServerPicker.vue'
import SkillsHub from './components/content/SkillsHub.vue'
import AdminPanel from './components/content/AdminPanel.vue'
import SettingsPanel from './components/content/SettingsPanel.vue'
import HookInboxPanel from './components/content/HookInboxPanel.vue'
import BootstrapSetupPanel from './components/content/BootstrapSetupPanel.vue'
import SidebarThreadControls from './components/sidebar/SidebarThreadControls.vue'
import IconTablerSearch from './components/icons/IconTablerSearch.vue'
import IconTablerX from './components/icons/IconTablerX.vue'
import {
  toServerTreeKey,
  upsertServerGroupsCache,
  upsertServerLoadingCache,
} from './composables/sidebarExplorerState.js'
import { toThreadDraftStorageKey } from './composables/useThreadDrafts.js'
import { useDesktopState } from './composables/useDesktopState'
import { getThreadReviewChanges } from './api/codexGateway'
import { useThreadPanels } from './composables/useThreadPanels'
import { useMobile } from './composables/useMobile'
import type { ReasoningEffort, ThreadScrollState, UiThreadReviewChange } from './types/codex'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'codex-web-local.sidebar-collapsed.v1'

const {
  availableServers,
  selectedServerId,
  selectServer,
  projectGroups,
  projectDisplayNameById,
  selectedThread,
  selectedThreadScrollState,
  selectedThreadServerRequests,
  hookInboxEntries,
  hookCountByProjectName,
  hookCountByThreadId,
  hasPendingHooks,
  pendingHookCount,
  hookCompatibilityError,
  selectedLiveOverlay,
  selectedThreadId,
  availableModelIds,
  selectedModelId,
  selectedReasoningEffort,
  installedSkills,
  messages,
  isLoadingThreads,
  isLoadingMessages,
  isSendingMessage,
  isInterruptingTurn,
  isAutoRefreshEnabled,
  autoRefreshSecondsLeft,
  refreshAll,
  refreshSkills,
  selectThread,
  setThreadScrollState,
  archiveThreadById,
  sendMessageToSelectedThread,
  sendMessageToNewThread,
  interruptSelectedThreadTurn,
  rollbackSelectedThread,
  isRollingBack,
  selectedThreadQueuedMessages,
  removeQueuedMessage,
  steerQueuedMessage,
  setSelectedModelId,
  setSelectedReasoningEffort,
  respondToPendingServerRequest,
  renameProject,
  renameThreadTitle,
  removeProject,
  reorderProject,
  toggleAutoRefreshTimer,
  startPolling,
  stopPolling,
} = useDesktopState()

const route = useRoute()
const router = useRouter()
const { isMobile } = useMobile()
const {
  reviewOpen: isThreadReviewOpen,
  scopeOpen: isThreadScopeOpen,
  changesOpen: isThreadChangesOpen,
  utilityOpen: isThreadUtilityOpen,
  reviewWidth: threadReviewWidth,
  utilityWidth: threadUtilityWidth,
  toggleReview: toggleThreadReview,
  toggleScope: toggleThreadScope,
  toggleChanges: toggleThreadChanges,
} = useThreadPanels()
const composerRef = ref<{
  setReviewComments: (path: string, comments: Array<{ path: string; line: number; text: string }>) => void
} | null>(null)
const reviewChanges = ref<UiThreadReviewChange[]>([])
const reviewIsGitRepo = ref(false)
const reviewErrorMessage = ref('')
const reviewChangesLoading = ref(false)
const reviewTabs = ref<Array<{ key: string; path: string; source: 'scope' | 'changes' }>>([])
const activeReviewTabKey = ref('')
const scopeRefreshToken = ref(0)
let reviewChangesToken = 0
const isRouteSyncInProgress = ref(false)
const hasInitialized = ref(false)
const newThreadCwd = ref('~')
const isSidebarCollapsed = ref(loadSidebarCollapsed())
const sidebarSearchQuery = ref('')
const isSidebarSearchVisible = ref(false)
const sidebarSearchInputRef = ref<HTMLInputElement | null>(null)
const lastAnnouncedPendingHookCount = ref(0)
const sidebarGroupsByServerId = ref<Record<string, typeof projectGroups.value>>({})
const sidebarLoadingByServerId = ref<Record<string, boolean>>({})
const sidebarProjectDisplayNamesByServerId = ref<Record<string, Record<string, string>>>({})

const routeThreadId = computed(() => {
  const rawThreadId = route.params.threadId
  return typeof rawThreadId === 'string' ? rawThreadId : ''
})

const knownThreadIdSet = computed(() => {
  const ids = new Set<string>()
  for (const group of projectGroups.value) {
    for (const thread of group.threads) {
      ids.add(thread.id)
    }
  }
  return ids
})

const isHomeRoute = computed(() => route.name === 'home')
const isSkillsRoute = computed(() => route.name === 'skills')
const isAdminRoute = computed(() => route.name === 'admin')
const isSettingsRoute = computed(() => route.name === 'settings')
const isHooksRoute = computed(() => route.name === 'hooks')
const isThreadRoute = computed(() => route.name === 'thread')
const isBootstrapSetupRoute = computed(() => route.name === 'bootstrap-setup')
type SessionUser = {
  id: string
  username: string
  role: 'admin' | 'user'
  setupRequired: boolean
  mustChangeUsername: boolean
  mustChangePassword: boolean
  bootstrapState: string
}
const sessionUser = ref<SessionUser | null>(null)
const isLoggingOut = ref(false)
const isAdminUser = computed(() => sessionUser.value?.role === 'admin')
const isSetupRequired = computed(() => sessionUser.value?.setupRequired === true)
const hasRegisteredServers = computed(() => availableServers.value.length > 0)
const sessionLabel = computed(() => {
  const user = sessionUser.value
  if (!user) return 'Guest'
  return `${user.username} (${user.role})`
})
const selectedServerLabel = computed(() => {
  const selectedId = selectedServerId.value
  const selected = availableServers.value.find((server) => server.id === selectedId)
  if (selected) return selected.label
  return availableServers.value[0]?.label ?? 'No server registered'
})
const selectedProjectLabel = computed(() => {
  const thread = selectedThread.value
  if (!thread) return '~'
  const projectName = thread.projectName?.trim() ?? ''
  if (!projectName) return '~'
  return projectDisplayNameById.value[projectName] ?? projectName
})
const contentTitle = computed(() => {
  if (isSkillsRoute.value) return 'Skills'
  if (isAdminRoute.value) return 'Admin'
  if (isSettingsRoute.value) return 'Settings'
  if (isHooksRoute.value) return 'Hooks'
  if (isHomeRoute.value) return 'New thread'
  if (isThreadRoute.value) return ''
  return `${selectedServerLabel.value} / ${selectedProjectLabel.value}`
})
const threadHeaderTitle = computed(() => selectedThread.value?.title ?? 'Choose a thread')
const autoRefreshButtonLabel = computed(() =>
  isAutoRefreshEnabled.value
    ? `Auto refresh in ${String(autoRefreshSecondsLeft.value)}s`
    : 'Enable 4s refresh',
)
const filteredMessages = computed(() =>
  messages.value.filter((message) => {
    const type = normalizeMessageType(message.messageType, message.role)
    if (type === 'worked') return true
    if (type === 'turnActivity.live' || type === 'turnError.live' || type === 'agentReasoning.live') return false
    return true
  }),
)
const liveOverlay = computed(() => selectedLiveOverlay.value)
const composerThreadContextId = computed(() => (isHomeRoute.value ? '__new-thread__' : selectedThreadId.value))
const composerDraftScopeKey = computed(() => toThreadDraftStorageKey(selectedServerId.value, composerThreadContextId.value))
const composerCwd = computed(() => {
  if (isHomeRoute.value) return newThreadCwd.value.trim()
  return selectedThread.value?.cwd?.trim() ?? ''
})
const isSelectedThreadInProgress = computed(() => !isHomeRoute.value && selectedThread.value?.inProgress === true)
const activeReviewTab = computed(() => reviewTabs.value.find((tab) => tab.key === activeReviewTabKey.value) ?? reviewTabs.value[0] ?? null)
const selectedReviewPath = computed(() => activeReviewTab.value?.path ?? '')
const selectedReviewSource = computed<'scope' | 'changes'>(() => activeReviewTab.value?.source ?? 'changes')
const threadServerIdById = computed(() => {
  const next = new Map<string, string>()
  for (const [serverKey, groups] of Object.entries(sidebarGroupsByServerId.value)) {
    for (const group of groups) {
      for (const thread of group.threads) {
        next.set(thread.id, serverKey)
      }
    }
  }
  return next
})

function clearThreadReviewState(): void {
  reviewChanges.value = []
  reviewIsGitRepo.value = false
  reviewErrorMessage.value = ''
  reviewChangesLoading.value = false
  clearReviewTabs()
}

function reviewTabKey(path: string, source: 'scope' | 'changes'): string {
  return `${source}:${path}`
}

function clearReviewTabs(): void {
  reviewTabs.value = []
  activeReviewTabKey.value = ''
}

function closeReviewTab(tabKey: string): void {
  const nextTabs = reviewTabs.value.filter((tab) => tab.key !== tabKey)
  reviewTabs.value = nextTabs
  if (activeReviewTabKey.value !== tabKey) return
  activeReviewTabKey.value = nextTabs.at(-1)?.key ?? ''
}

async function refreshThreadReview(): Promise<void> {
  const cwd = composerCwd.value.trim()
  if (!isThreadRoute.value || !cwd) {
    clearThreadReviewState()
    return
  }

  const token = ++reviewChangesToken
  reviewChangesLoading.value = true
  reviewErrorMessage.value = ''

  try {
    const payload = await getThreadReviewChanges(cwd)
    if (token !== reviewChangesToken) return
    reviewChanges.value = payload.files
    reviewIsGitRepo.value = payload.isGitRepo
    const currentPath = selectedReviewPath.value
    if (currentPath && !payload.files.some((file) => file.path === currentPath)) {
      closeReviewTab(reviewTabKey(currentPath, selectedReviewSource.value))
    }
  } catch (error) {
    if (token !== reviewChangesToken) return
    reviewChanges.value = []
    reviewIsGitRepo.value = false
    clearReviewTabs()
    reviewErrorMessage.value = error instanceof Error ? error.message : 'Failed to load review changes.'
  } finally {
    if (token === reviewChangesToken) {
      reviewChangesLoading.value = false
    }
  }
}

function onSelectReviewFile(path: string, source: 'scope' | 'changes'): void {
  if (!isThreadReviewOpen.value) {
    toggleThreadReview()
  }
  const normalizedPath = path.trim()
  if (!normalizedPath) return
  const key = reviewTabKey(normalizedPath, source)
  if (!reviewTabs.value.some((tab) => tab.key === key)) {
    reviewTabs.value = [...reviewTabs.value, { key, path: normalizedPath, source }]
  }
  activeReviewTabKey.value = key
}

function onSyncReviewComments(payload: { path: string; comments: Array<{ path: string; line: number; text: string }> }): void {
  const path = payload.path.trim()
  if (!path) return
  composerRef.value?.setReviewComments(path, payload.comments)
}

watch([isThreadRoute, composerCwd, selectedServerId], () => {
  void refreshThreadReview()
}, { immediate: true })

watch(
  () => [selectedThreadId.value, selectedServerId.value, composerCwd.value] as const,
  (next, previous) => {
    if (!previous) return
    if (next[0] !== previous[0] || next[1] !== previous[1] || next[2] !== previous[2]) {
      clearReviewTabs()
    }
  },
)
onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown)
  void initialize()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKeyDown)
  stopPolling()
})

function onSkillsChanged(): void {
  if (isSetupRequired.value) return
  void refreshSkills()
}

function onConnectorsChanged(): void {
  if (isSetupRequired.value) return
  void refreshAll()
}

function toggleSidebarSearch(): void {
  isSidebarSearchVisible.value = !isSidebarSearchVisible.value
  if (isSidebarSearchVisible.value) {
    nextTick(() => sidebarSearchInputRef.value?.focus())
  } else {
    sidebarSearchQuery.value = ''
  }
}

function clearSidebarSearch(): void {
  sidebarSearchQuery.value = ''
  sidebarSearchInputRef.value?.focus()
}

function onSidebarSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    isSidebarSearchVisible.value = false
    sidebarSearchQuery.value = ''
  }
}

function onSelectThread(threadId: string): void {
  void onSelectThreadFromSidebar({ threadId, serverId: selectedServerId.value })
}

async function ensureSidebarServerSelected(serverId: string): Promise<void> {
  const normalizedServerId = serverId.trim()
  if (!normalizedServerId || normalizedServerId === selectedServerId.value) return
  await selectServer(normalizedServerId)
}

async function onSelectThreadFromSidebar(payload: { threadId: string; serverId: string }): Promise<void> {
  if (isSetupRequired.value) return
  if (!payload.threadId) return
  await ensureSidebarServerSelected(payload.serverId)
  if (route.name === 'thread' && routeThreadId.value === payload.threadId) return
  await router.push({ name: 'thread', params: { threadId: payload.threadId } })
  if (isMobile.value) setSidebarCollapsed(true)
}

async function onArchiveThread(payload: { threadId: string; serverId: string }): Promise<void> {
  if (isSetupRequired.value) return
  await ensureSidebarServerSelected(payload.serverId)
  await archiveThreadById(payload.threadId)
}

async function onStartNewThread(payload: { projectName: string; serverId: string }): Promise<void> {
  if (isSetupRequired.value) return
  await ensureSidebarServerSelected(payload.serverId)
  newThreadCwd.value = '~'
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  await router.push({ name: 'home' })
}

function onStartNewThreadFromToolbar(): void {
  if (isSetupRequired.value) return
  newThreadCwd.value = '~'
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

async function onRenameProject(payload: { projectName: string; serverId: string; displayName: string }): Promise<void> {
  if (isSetupRequired.value) return
  await ensureSidebarServerSelected(payload.serverId)
  renameProject(payload.projectName, payload.displayName)
}

async function onRenameThread(payload: { threadId: string; serverId: string; title: string }): Promise<void> {
  if (isSetupRequired.value) return
  await ensureSidebarServerSelected(payload.serverId)
  renameThreadTitle(payload.threadId, payload.title)
}

async function onRemoveProject(payload: { projectName: string; serverId: string }): Promise<void> {
  if (isSetupRequired.value) return
  await ensureSidebarServerSelected(payload.serverId)
  removeProject(payload.projectName)
}

async function onReorderProject(payload: { projectName: string; serverId: string; toIndex: number }): Promise<void> {
  if (isSetupRequired.value) return
  await ensureSidebarServerSelected(payload.serverId)
  reorderProject(payload.projectName, payload.toIndex)
}

function onUpdateThreadScrollState(payload: { threadId: string; state: ThreadScrollState }): void {
  setThreadScrollState(payload.threadId, payload.state)
}

function onRespondServerRequest(payload: { id: number; result?: unknown; error?: { code?: number; message: string } }): void {
  if (isSetupRequired.value) return
  void respondToPendingServerRequest(payload)
}

function onToggleAutoRefreshTimer(): void {
  if (isSetupRequired.value) return
  toggleAutoRefreshTimer()
}

function onSelectServer(serverId: string): void {
  if (isSetupRequired.value) return
  if (isHomeRoute.value) {
    newThreadCwd.value = '~'
  }
  void selectServer(serverId)
}

function onOpenHookThread(threadId: string): void {
  if (isSetupRequired.value) return
  if (!threadId) return
  void router.push({ name: 'thread', params: { threadId } })
  if (isMobile.value) setSidebarCollapsed(true)
}

function setSidebarCollapsed(nextValue: boolean): void {
  if (isSidebarCollapsed.value === nextValue) return
  isSidebarCollapsed.value = nextValue
  saveSidebarCollapsed(nextValue)
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (!event.ctrlKey && !event.metaKey) return
  if (event.shiftKey || event.altKey) return
  if (event.key.toLowerCase() !== 'b') return
  event.preventDefault()
  setSidebarCollapsed(!isSidebarCollapsed.value)
}

function onSubmitThreadMessage(payload: { text: string; imageUrls: string[]; fileAttachments: Array<{ label: string; path: string; fsPath: string }>; skills: Array<{ name: string; path: string }>; mode: 'steer' | 'queue' }): void {
  if (isSetupRequired.value) return
  const text = payload.text
  if (isHomeRoute.value) {
    void submitFirstMessageForNewThread(text, payload.imageUrls, payload.skills, payload.fileAttachments)
    return
  }
  void sendMessageToSelectedThread(text, payload.imageUrls, payload.skills, payload.mode, payload.fileAttachments)
}

function onSelectModel(modelId: string): void {
  if (isSetupRequired.value) return
  setSelectedModelId(modelId)
}

function onSelectReasoningEffort(effort: ReasoningEffort | ''): void {
  if (isSetupRequired.value) return
  setSelectedReasoningEffort(effort)
}

function onInterruptTurn(): void {
  if (isSetupRequired.value) return
  void interruptSelectedThreadTurn()
}

function onRollback(payload: { turnIndex: number }): void {
  if (isSetupRequired.value) return
  void rollbackSelectedThread(payload.turnIndex)
}

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
}

function saveSidebarCollapsed(value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, value ? '1' : '0')
}

function normalizeMessageType(rawType: string | undefined, role: string): string {
  const normalized = (rawType ?? '').trim()
  if (normalized.length > 0) {
    return normalized
  }
  return role.trim() || 'message'
}

async function initialize(): Promise<void> {
  await refreshSessionUser()
  if (!isSetupRequired.value) {
    await refreshAll()
  }
  hasInitialized.value = true
  await syncThreadSelectionWithRoute()
  if (isSetupRequired.value) {
    stopPolling()
    return
  }
  startPolling()
}

async function syncThreadSelectionWithRoute(): Promise<void> {
  if (isRouteSyncInProgress.value) return
  isRouteSyncInProgress.value = true

  try {
    if (isSetupRequired.value) {
      stopPolling()
      if (!isBootstrapSetupRoute.value) {
        await router.replace({ name: 'bootstrap-setup' })
        return
      }
      if (selectedThreadId.value !== '') {
        await selectThread('')
      }
      return
    }

    if (isBootstrapSetupRoute.value) {
      await router.replace({ name: 'home' })
      return
    }

    if (route.name === 'home' || route.name === 'skills' || route.name === 'settings' || route.name === 'hooks') {
      if (selectedThreadId.value !== '') {
        await selectThread('')
      }
      return
    }

    if (route.name === 'admin') {
      if (!isAdminUser.value) {
        await router.replace({ name: 'home' })
        return
      }
      if (selectedThreadId.value !== '') {
        await selectThread('')
      }
      return
    }

    if (route.name === 'thread') {
      const threadId = routeThreadId.value
      if (!threadId) return

      if (!knownThreadIdSet.value.has(threadId)) {
        await router.replace({ name: 'home' })
        return
      }

      if (selectedThreadId.value !== threadId) {
        await selectThread(threadId)
      }
      return
    }

  } finally {
    isRouteSyncInProgress.value = false
  }
}

watch(
  () =>
    [
      route.name,
      routeThreadId.value,
      isLoadingThreads.value,
      knownThreadIdSet.value.has(routeThreadId.value),
      selectedThreadId.value,
      isAdminUser.value,
      isSetupRequired.value,
    ] as const,
  async () => {
    if (!hasInitialized.value) return
    await syncThreadSelectionWithRoute()
  },
)

watch(
  () => selectedThreadId.value,
  async (threadId) => {
    if (!hasInitialized.value) return
    if (isRouteSyncInProgress.value) return
    if (isHomeRoute.value || isSkillsRoute.value || isAdminRoute.value || isSettingsRoute.value || isHooksRoute.value || isBootstrapSetupRoute.value) return

    if (!threadId) {
      if (route.name !== 'home') {
        await router.replace({ name: 'home' })
      }
      return
    }

    if (route.name === 'thread' && routeThreadId.value === threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  },
)

watch(isMobile, (mobile) => {
  if (mobile && !isSidebarCollapsed.value) {
    setSidebarCollapsed(true)
  }
})

watch(
  [selectedServerId, projectGroups],
  ([serverId, groups]) => {
    const normalizedServerId = serverId.trim()
    if (!normalizedServerId) return
    sidebarGroupsByServerId.value = upsertServerGroupsCache(sidebarGroupsByServerId.value, normalizedServerId, groups)
  },
  { deep: true, immediate: true },
)

watch(
  [selectedServerId, isLoadingThreads],
  ([serverId, isLoading]) => {
    const normalizedServerId = serverId.trim()
    if (!normalizedServerId) return
    sidebarLoadingByServerId.value = upsertServerLoadingCache(sidebarLoadingByServerId.value, normalizedServerId, isLoading)
  },
  { immediate: true },
)

watch(
  [selectedServerId, projectDisplayNameById],
  ([serverId, displayNames]) => {
    const normalizedServerId = serverId.trim()
    if (!normalizedServerId) return
    sidebarProjectDisplayNamesByServerId.value = {
      ...sidebarProjectDisplayNamesByServerId.value,
      [toServerTreeKey(normalizedServerId)]: { ...displayNames },
    }
  },
  { deep: true, immediate: true },
)

watch(
  availableServers,
  (servers) => {
    const allowed = new Set(servers.map((server) => toServerTreeKey(server.id)))
    sidebarGroupsByServerId.value = Object.fromEntries(
      Object.entries(sidebarGroupsByServerId.value).filter(([key]) => allowed.has(key)),
    )
    sidebarLoadingByServerId.value = Object.fromEntries(
      Object.entries(sidebarLoadingByServerId.value).filter(([key]) => allowed.has(key)),
    )
    sidebarProjectDisplayNamesByServerId.value = Object.fromEntries(
      Object.entries(sidebarProjectDisplayNamesByServerId.value).filter(([key]) => allowed.has(key)),
    )
  },
  { immediate: true },
)

watch(
  () => pendingHookCount.value,
  (count) => {
    if (!hasInitialized.value) {
      lastAnnouncedPendingHookCount.value = count
      return
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      lastAnnouncedPendingHookCount.value = count
      return
    }
    if (count <= lastAnnouncedPendingHookCount.value) {
      lastAnnouncedPendingHookCount.value = count
      return
    }

    const latestHook = hookInboxEntries.value[0]
    const notification = new Notification(
      count === 1 ? '1 pending approval requires attention' : `${String(count)} pending approvals require attention`,
      {
        body: latestHook
          ? `${latestHook.projectLabel} · ${latestHook.threadTitle}`
          : 'Open the Hooks page to review pending approvals.',
        tag: 'codexui-pending-hooks',
      },
    )
    notification.onclick = () => {
      window.focus()
      void router.push(latestHook ? { name: 'thread', params: { threadId: latestHook.threadId } } : { name: 'hooks' })
    }
    lastAnnouncedPendingHookCount.value = count
  },
)

async function submitFirstMessageForNewThread(
  text: string,
  imageUrls: string[] = [],
  skills: Array<{ name: string; path: string }> = [],
  fileAttachments: Array<{ label: string; path: string; fsPath: string }> = [],
): Promise<void> {
  try {
    const threadId = await sendMessageToNewThread(text, newThreadCwd.value, imageUrls, skills, fileAttachments)
    if (!threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  } catch {
    // Error is already reflected in state.
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

async function refreshSessionUser(): Promise<void> {
  try {
    const response = await fetch('/auth/session', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const payload = await response.json().catch(() => ({}))
    const root = asRecord(payload)
    const rawUser = asRecord(root?.user)
    const authenticated = root?.authenticated === true

    if (!response.ok || !authenticated || !rawUser) {
      sessionUser.value = null
      return
    }

    const id = typeof rawUser.id === 'string' ? rawUser.id.trim() : ''
    const username = typeof rawUser.username === 'string' ? rawUser.username.trim() : ''
    const role = rawUser.role === 'admin' ? 'admin' : 'user'
    const setupRequired = root?.setupRequired === true
    const mustChangeUsername = root?.mustChangeUsername === true
    const mustChangePassword = root?.mustChangePassword === true
    const bootstrapState = typeof root?.bootstrapState === 'string' ? root.bootstrapState : 'none'
    if (!id || !username) {
      sessionUser.value = null
      return
    }
    sessionUser.value = { id, username, role, setupRequired, mustChangeUsername, mustChangePassword, bootstrapState }
  } catch {
    sessionUser.value = null
  }
}

async function onBootstrapSetupCompleted(): Promise<void> {
  await refreshSessionUser()
  if (isSetupRequired.value) {
    return
  }
  await refreshAll()
  startPolling()
  await router.replace({ name: 'home' })
}

async function onLogout(): Promise<void> {
  if (isLoggingOut.value) return
  isLoggingOut.value = true
  try {
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
  } finally {
    sessionUser.value = null
    isLoggingOut.value = false
    window.location.reload()
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-root {
  @apply min-h-full py-4 px-2 flex flex-col gap-2 select-none;
}

.sidebar-main {
  @apply min-h-0 flex-1 flex flex-col gap-2 overflow-y-auto;
}

.sidebar-session-footer {
  @apply mt-auto mx-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 flex items-center justify-between gap-3;
}

.sidebar-session-copy {
  @apply min-w-0 flex flex-col gap-0.5;
}

.sidebar-session-label {
  @apply m-0 truncate text-sm font-medium text-zinc-700;
}

.sidebar-root input,
.sidebar-root textarea {
  @apply select-text;
}

.content-root {
  @apply h-full min-h-0 w-full flex flex-col overflow-y-hidden overflow-x-visible bg-white;
}

.sidebar-thread-controls-host {
  @apply mt-1 -translate-y-px px-2 pb-1;
}

.sidebar-search-toggle {
  @apply h-6.75 w-6.75 rounded-md border border-transparent bg-transparent text-zinc-600 flex items-center justify-center transition hover:border-zinc-200 hover:bg-zinc-50;
}

.sidebar-search-toggle[aria-pressed='true'] {
  @apply border-zinc-300 bg-zinc-100 text-zinc-700;
}

.sidebar-search-toggle-icon {
  @apply w-4 h-4;
}

.sidebar-search-bar {
  @apply flex items-center gap-1.5 mx-2 px-2 py-1 rounded-md border border-zinc-200 bg-white transition-colors focus-within:border-zinc-400;
}

.sidebar-search-bar-icon {
  @apply w-3.5 h-3.5 text-zinc-400 shrink-0;
}

.sidebar-search-input {
  @apply flex-1 min-w-0 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 outline-none border-none p-0;
}

.sidebar-search-clear {
  @apply w-4 h-4 rounded text-zinc-400 flex items-center justify-center transition hover:text-zinc-600;
}

.sidebar-search-clear-icon {
  @apply w-3.5 h-3.5;
}

.sidebar-skills-link {
  @apply mx-2 flex items-center rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900 cursor-pointer;
}

.sidebar-skills-link.is-active {
  @apply bg-zinc-200 text-zinc-900 font-medium;
}

.sidebar-alert-badge {
  @apply ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white;
}

.sidebar-thread-controls-header-host {
  @apply ml-1;
}

.header-cwd-readonly {
  @apply m-0 max-w-full truncate text-xs text-zinc-500;
}

.header-meta-stack {
  @apply min-w-0 w-full flex flex-col items-end gap-2;
}

.header-control-row {
  @apply min-w-0 w-full flex items-center justify-end gap-2 flex-wrap;
}

.header-project-picker {
  @apply max-w-full;
}

.header-thread-title {
  @apply m-0 w-full text-right text-sm font-semibold text-zinc-800 truncate;
}

.header-session-row {
  @apply min-w-0 flex items-center justify-end gap-2;
}

.header-session-identity {
  @apply text-xs text-zinc-600 truncate;
}

.header-session-logout {
  @apply rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 disabled:cursor-not-allowed;
}

.header-panel-actions {
  @apply h-full flex items-end justify-end;
}

.content-body {
  @apply flex-1 min-h-0 w-full flex flex-col gap-2 sm:gap-3 pt-1 pb-2 sm:pb-4 overflow-y-hidden overflow-x-visible;
}

.hook-alert-banner {
  @apply mx-3 sm:mx-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 sm:px-5 flex items-center justify-between gap-3;
}

.hook-alert-banner-copy {
  @apply min-w-0 flex flex-col gap-1;
}

.hook-alert-banner-title {
  @apply m-0 text-sm font-semibold text-red-900;
}

.hook-alert-banner-body {
  @apply m-0 text-sm text-red-700;
}

.hook-alert-banner-action {
  @apply shrink-0 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100;
}

.content-error {
  @apply m-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.content-grid {
  @apply flex-1 min-h-0 flex flex-col gap-3;
}

.thread-workspace {
  @apply flex-1 min-h-0 flex gap-0 overflow-hidden;
}

.thread-workspace-chat {
  @apply flex-1 min-w-0 min-h-0 flex flex-col;
}

.content-thread {
  @apply flex-1 min-h-0;
}

.composer-with-queue {
  @apply w-full;
}

.thread-panel-copy {
  @apply flex flex-col gap-2;
}

.thread-panel-eyebrow {
  @apply m-0 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.thread-panel-copy-line {
  @apply m-0 text-sm leading-5 text-zinc-700 break-all;
}

.new-thread-empty {
  @apply flex-1 min-h-0 flex flex-col items-center justify-center gap-0.5 px-3 sm:px-6;
}

.new-thread-hero {
  @apply m-0 text-2xl sm:text-[2.5rem] font-semibold leading-[1.05] text-zinc-900;
}

.registration-empty-state {
  @apply flex-1 min-h-0 mx-3 sm:mx-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-8 sm:px-8 sm:py-10 flex flex-col items-start justify-center gap-3;
}

.registration-empty-eyebrow {
  @apply m-0 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.registration-empty-title {
  @apply m-0 text-2xl sm:text-3xl font-semibold text-zinc-950;
}

.registration-empty-body {
  @apply m-0 max-w-2xl text-sm sm:text-base leading-6 text-zinc-600;
}

.admin-guard {
  @apply h-full w-full flex flex-col items-center justify-center gap-2 text-center px-4;
}

.admin-guard-title {
  @apply m-0 text-lg font-semibold text-zinc-900;
}

.admin-guard-subtitle {
  @apply m-0 text-sm text-zinc-500;
}

.bootstrap-setup-shell {
  @apply min-h-screen bg-zinc-50 flex flex-col;
}

.bootstrap-setup-shell-header {
  @apply flex items-center justify-between gap-3 px-4 py-4 sm:px-6;
}

.bootstrap-setup-shell-identity {
  @apply min-w-0 flex flex-col gap-1;
}

.bootstrap-setup-shell-eyebrow {
  @apply m-0 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.bootstrap-setup-shell-user {
  @apply m-0 text-sm font-medium text-zinc-800 truncate;
}

</style>
