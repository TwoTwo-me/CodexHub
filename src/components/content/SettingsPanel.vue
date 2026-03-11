<template>
  <section class="settings-panel">
    <header class="settings-panel-header">
      <div>
        <p class="settings-panel-eyebrow">Settings</p>
        <h2 class="settings-panel-title">Workspace settings</h2>
        <p class="settings-panel-subtitle">
          Organize connector operations, browser notification devices, and server-scoped hook defaults in one place.
        </p>
      </div>
    </header>

    <p v-if="errorMessage" class="settings-panel-error">{{ errorMessage }}</p>

    <div class="settings-tablist" role="tablist" aria-label="Settings sections">
      <button
        v-for="tab in settingsTabs"
        :id="`settings-tab-${tab.id}`"
        :key="tab.id"
        type="button"
        class="settings-tab"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`settings-panel-${tab.id}`"
        :data-active="activeTab === tab.id"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <template v-if="activeTab === 'connectors'">
      <div id="settings-panel-connectors" class="settings-tab-panel" role="tabpanel" aria-labelledby="settings-tab-connectors">
        <div class="settings-grid">
      <form class="settings-card settings-create-card" @submit.prevent="void createConnector()">
        <div class="settings-card-header">
          <div>
            <h3 class="settings-card-title">Create connector</h3>
            <p class="settings-card-subtitle">Create a per-user outbound connector and linked relay server entry.</p>
          </div>
        </div>

        <label class="settings-field">
          <span class="settings-field-label">Connector name</span>
          <input
            v-model="createForm.name"
            class="settings-field-input"
            type="text"
            name="connector-name"
            autocomplete="off"
            required
          />
        </label>

        <label class="settings-field">
          <span class="settings-field-label">Connector id</span>
          <input
            v-model="createForm.id"
            class="settings-field-input"
            type="text"
            name="connector-id"
            autocomplete="off"
            required
          />
        </label>

        <label class="settings-field">
          <span class="settings-field-label">Hub address</span>
          <input
            v-model="createForm.hubAddress"
            class="settings-field-input"
            type="url"
            name="connector-hub-address"
            autocomplete="off"
            placeholder="https://hub.example.com"
            required
          />
        </label>

        <button type="submit" class="settings-primary-button" :disabled="isCreating">
          {{ isCreating ? 'Creating…' : 'Create connector' }}
        </button>
      </form>

      <section class="settings-card settings-list-card">
        <div class="settings-card-header">
          <div>
            <h3 class="settings-card-title">All Connectors</h3>
            <p class="settings-card-subtitle">Includes connected, pending, offline, expired, and reinstall-required connectors in the current user scope.</p>
          </div>
        </div>

        <ul v-if="connectors.length > 0" class="connector-list">
          <li v-for="connector in connectors" :key="connector.id">
            <button
              type="button"
              class="connector-list-item"
              :data-active="connector.id === selectedConnectorId"
              @click="selectedConnectorId = connector.id"
            >
              <span class="connector-list-row">
                <span class="connector-list-name">{{ connector.name }}</span>
                <span class="connector-status-pill" :data-state="statusPillTone(connector.installState)">
                  {{ formatInstallStateLabel(connector.installState) }}
                </span>
              </span>
              <span class="connector-list-meta">{{ connector.id }} · {{ connector.serverId }}</span>
            </button>
          </li>
        </ul>
        <div v-else class="settings-empty-state">
          No connectors registered yet.
        </div>
      </section>

      <section class="settings-card settings-detail-card">
        <template v-if="selectedConnector">
          <div class="settings-card-header">
            <div>
              <h3 class="settings-card-title">Connector details</h3>
              <p class="settings-card-subtitle">Lifecycle state, bootstrap metadata, and management actions for the selected connector.</p>
            </div>
          </div>

          <div class="settings-detail-grid">
            <label class="settings-field">
              <span class="settings-field-label">Current name</span>
              <input class="settings-field-input" type="text" :value="selectedConnector.name" readonly />
            </label>

            <label class="settings-field">
              <span class="settings-field-label">Selected ID</span>
              <input class="settings-field-input" type="text" :value="selectedConnector.id" readonly />
            </label>

            <label class="settings-field settings-field-wide">
              <span class="settings-field-label">Hub URL</span>
              <input class="settings-field-input" type="text" :value="selectedConnector.hubAddress" readonly />
            </label>

            <label class="settings-field">
              <span class="settings-field-label">Relay agent id</span>
              <input class="settings-field-input" type="text" :value="selectedConnector.relayAgentId" readonly />
            </label>

            <label class="settings-field">
              <span class="settings-field-label">Bound server id</span>
              <input class="settings-field-input" type="text" :value="selectedConnector.serverId" readonly />
            </label>
          </div>

          <div class="connector-summary-bar">
            <span class="connector-status-pill" :data-state="statusPillTone(selectedConnector.installState)">
              {{ formatInstallStateLabel(selectedConnector.installState) }}
            </span>
            <span>{{ selectedConnector.connected ? 'Transport online' : 'Transport offline' }}</span>
            <span>{{ formatProjectCount(selectedConnector) }}</span>
            <span>{{ formatThreadCount(selectedConnector) }}</span>
            <span v-if="selectedConnector.lastSeenAtIso">Last seen {{ formatDate(selectedConnector.lastSeenAtIso) }}</span>
            <span v-else>Last seen —</span>
          </div>

          <div class="settings-status-meta">
            <p v-if="selectedConnector.bootstrapIssuedAtIso">Bootstrap issued {{ formatDate(selectedConnector.bootstrapIssuedAtIso) }}</p>
            <p v-if="selectedConnector.bootstrapExpiresAtIso">Bootstrap expires {{ formatDate(selectedConnector.bootstrapExpiresAtIso) }}</p>
            <p v-if="selectedConnector.bootstrapConsumedAtIso">Bootstrap consumed {{ formatDate(selectedConnector.bootstrapConsumedAtIso) }}</p>
            <p v-if="selectedConnector.credentialIssuedAtIso">Credential issued {{ formatDate(selectedConnector.credentialIssuedAtIso) }}</p>
          </div>

          <section class="connector-update-panel">
            <div class="settings-card-header">
              <div>
                <h4 class="settings-card-title">Managed updates</h4>
                <p class="settings-card-subtitle">Monitor connector version telemetry and queue restart/update jobs from the Hub.</p>
              </div>
            </div>

            <div class="settings-detail-grid">
              <label class="settings-field">
                <span class="settings-field-label">Connector version</span>
                <input class="settings-field-input" type="text" :value="selectedConnector.connectorVersion || '—'" readonly />
              </label>

              <label class="settings-field">
                <span class="settings-field-label">Latest compatible release</span>
                <input class="settings-field-input" type="text" :value="selectedConnector.latestReleaseVersion || '—'" readonly />
              </label>

              <label class="settings-field">
                <span class="settings-field-label">Runner mode</span>
                <input class="settings-field-input" type="text" :value="selectedConnector.runnerMode || '—'" readonly />
              </label>

              <label class="settings-field">
                <span class="settings-field-label">Platform</span>
                <input class="settings-field-input" type="text" :value="selectedConnector.platform || '—'" readonly />
              </label>
            </div>

            <div class="connector-summary-bar">
              <span class="connector-status-pill" :data-state="updateStatusTone(selectedConnector.updateStatus)">
                {{ formatUpdateStatusLabel(selectedConnector.updateStatus) }}
              </span>
              <span>{{ selectedConnector.updateCapable ? 'Hub-managed update ready' : 'Managed update unavailable' }}</span>
              <span>{{ selectedConnector.restartCapable ? 'Restart from Hub supported' : 'Restart from Hub unavailable' }}</span>
              <span v-if="selectedConnector.lastTelemetryAtIso">Telemetry {{ formatDate(selectedConnector.lastTelemetryAtIso) }}</span>
            </div>

            <div class="settings-action-row">
              <button
                type="button"
                class="settings-secondary-button"
                :disabled="!selectedConnector.restartCapable || isRestartingConnector"
                @click="void queueConnectorRestart()"
              >
                {{ isRestartingConnector ? 'Queueing restart…' : 'Restart connector' }}
              </button>
              <button
                type="button"
                class="settings-primary-button"
                :disabled="selectedConnector.updateStatus !== 'update_available' || isUpdatingConnector"
                @click="void queueConnectorUpdate()"
              >
                {{ isUpdatingConnector ? 'Queueing update…' : 'Update connector' }}
              </button>
            </div>

            <p v-if="connectorJobStatusMessage" class="settings-inline-status">{{ connectorJobStatusMessage }}</p>

            <div class="settings-status-meta">
              <p v-if="selectedConnector.latestReleasePublishedAtIso">Release published {{ formatDate(selectedConnector.latestReleasePublishedAtIso) }}</p>
              <p v-if="selectedConnector.latestReleaseReleaseNotesUrl">
                Release notes:
                <a class="settings-inline-link" :href="selectedConnector.latestReleaseReleaseNotesUrl" target="_blank" rel="noreferrer">
                  {{ selectedConnector.latestReleaseReleaseNotesUrl }}
                </a>
              </p>
            </div>

            <div class="connector-jobs">
              <div class="connector-jobs-header">
                <span class="settings-field-label">Recent jobs</span>
                <button type="button" class="settings-secondary-button settings-secondary-button-small" :disabled="isLoadingJobs" @click="void refreshSelectedConnectorJobs()">
                  {{ isLoadingJobs ? 'Refreshing…' : 'Refresh jobs' }}
                </button>
              </div>
              <ul v-if="connectorJobs.length > 0" class="connector-job-list">
                <li v-for="job in connectorJobs" :key="job.id" class="connector-job-item">
                  <div class="connector-list-row">
                    <span class="connector-list-name">{{ job.action === 'update' ? 'Update' : 'Restart' }}</span>
                    <span class="connector-status-pill" :data-state="jobStatusTone(job.status)">
                      {{ formatJobStatusLabel(job.status) }}
                    </span>
                  </div>
                  <span class="connector-list-meta">{{ job.id }} · requested {{ formatDate(job.requestedAtIso) }}</span>
                  <span v-if="job.targetVersion" class="connector-list-meta">Target version {{ job.targetVersion }}</span>
                  <span v-if="job.errorMessage" class="settings-inline-status settings-inline-status-error">{{ job.errorMessage }}</span>
                </li>
              </ul>
              <div v-else class="settings-empty-state settings-empty-state-compact">
                No connector jobs queued yet.
              </div>
            </div>
          </section>

          <div v-if="isRenaming" class="settings-inline-form">
            <label class="settings-field settings-inline-field">
              <span class="settings-field-label">Rename connector</span>
              <input v-model="renameDraft" class="settings-field-input" type="text" autocomplete="off" />
            </label>
            <div class="settings-inline-actions">
              <button type="button" class="settings-secondary-button" :disabled="isRenamingBusy" @click="cancelRename">
                Cancel
              </button>
              <button type="button" class="settings-primary-button" :disabled="isRenamingBusy" @click="void saveRename()">
                {{ isRenamingBusy ? 'Saving…' : 'Save name' }}
              </button>
            </div>
          </div>
          <div v-else class="settings-action-row">
            <button type="button" class="settings-secondary-button" @click="startRename">Edit name</button>
            <button type="button" class="settings-secondary-button" :disabled="isRotating" @click="void rotateToken()">
              {{ isRotating ? 'Reissuing…' : 'Reissue install token' }}
            </button>
            <button type="button" class="settings-danger-button" :disabled="isDeleting" @click="requestDelete">
              Delete connector
            </button>
            <button
              v-if="pendingDeleteConnectorId === selectedConnector.id"
              type="button"
              class="settings-danger-button"
              :disabled="isDeleting"
              @click="void confirmDelete()"
            >
              {{ isDeleting ? 'Deleting…' : 'Confirm delete' }}
            </button>
          </div>
        </template>
        <div v-else class="settings-empty-state">
          Select a connector to inspect status and actions.
        </div>
      </section>
        </div>

        <section v-if="selectedInstallArtifact" class="settings-card settings-install-card">
          <div class="settings-card-header">
            <div>
              <h3 class="settings-card-title">Connector install artifact</h3>
              <p class="settings-card-subtitle">Reveal the one-time bootstrap token and install command for the selected connector.</p>
            </div>
          </div>

          <p class="settings-install-once">Bootstrap token is only shown once.</p>

          <label class="settings-field">
            <span class="settings-field-label">Bootstrap token</span>
            <div class="settings-inline-actions settings-inline-actions-tight">
              <button type="button" class="settings-secondary-button" @click="toggleTokenReveal">
                {{ isTokenRevealed ? 'Hide token' : 'Reveal token' }}
              </button>
            </div>
            <textarea
              class="settings-code-block"
              readonly
              :value="isTokenRevealed ? selectedInstallArtifact.token : '••••••••••••••••'"
            ></textarea>
            <p class="settings-field-help">
              Save this bootstrap token to a secure file on the connector host. The install step rewrites the same file with the durable credential.
            </p>
          </label>

          <label class="settings-field">
            <span class="settings-field-label">Suggested install command</span>
            <textarea class="settings-code-block settings-code-block-large" readonly :value="selectedInstallCommand"></textarea>
            <p class="settings-field-help">
              Reveal token to embed it directly in the command below. Inline tokens are convenient, but they may be saved in shell history.
            </p>
          </label>
        </section>
      </div>
    </template>

    <section
      v-else-if="activeTab === 'notifications'"
      id="settings-panel-notifications"
      class="settings-tab-panel"
      role="tabpanel"
      aria-labelledby="settings-tab-notifications"
    >
      <section class="settings-card settings-notifications-card">
      <div class="settings-card-header">
        <div>
          <h3 class="settings-card-title">Browser notifications</h3>
          <p class="settings-card-subtitle">
            Register this browser as a PWA-capable notification target for hook approvals on Android, iPhone home screen web apps, and desktop browsers.
          </p>
        </div>
      </div>

      <div class="settings-status-meta">
        <p>{{ browserNotificationSupportMessage }}</p>
        <p>{{ browserNotificationPermissionMessage }}</p>
        <p v-if="currentBrowserSubscription">
          This browser is registered as {{ formatNotificationDeviceLabel(currentBrowserSubscription) }}.
        </p>
        <p v-else>No browser subscription stored for this device yet.</p>
      </div>

      <div class="settings-action-row">
        <button
          type="button"
          class="settings-primary-button"
          :disabled="!isBrowserNotificationsSupported || isEnablingBrowserNotifications"
          @click="void enableNotifications()"
        >
          {{ isEnablingBrowserNotifications ? 'Enabling…' : 'Enable notifications' }}
        </button>
        <button
          type="button"
          class="settings-secondary-button"
          :disabled="!currentBrowserSubscription || isDisablingBrowserNotifications"
          @click="void disableNotifications()"
        >
          {{ isDisablingBrowserNotifications ? 'Disabling…' : 'Disable notifications' }}
        </button>
      </div>

      <p v-if="browserNotificationStatusMessage" class="settings-inline-status">
        {{ browserNotificationStatusMessage }}
      </p>
      <p class="settings-field-help">
        iPhone push requires adding the Hub to the Home Screen and opening it as a standalone web app before enabling notifications.
      </p>

      <div class="notification-device-panel">
        <div class="connector-jobs-header">
          <span class="settings-field-label">Registered devices</span>
          <span class="notification-device-summary">{{ browserSubscriptions.length }} saved targets</span>
        </div>

        <ul v-if="browserSubscriptions.length > 0" class="notification-device-list">
          <li
            v-for="subscription in browserSubscriptions"
            :key="subscription.id"
            class="notification-device-item"
            :data-current="isCurrentBrowserDevice(subscription)"
          >
            <div class="notification-device-row">
              <div class="notification-device-copy">
                <div class="notification-device-heading">
                  <span class="notification-device-name">{{ formatNotificationDeviceLabel(subscription) }}</span>
                  <span
                    v-if="isCurrentBrowserDevice(subscription)"
                    class="connector-status-pill"
                    data-state="connected"
                  >
                    Current browser
                  </span>
                </div>
                <div class="notification-device-meta">
                  <span>{{ formatNotificationDevicePlatform(subscription) }}</span>
                  <span>Added {{ formatDate(subscription.createdAtIso) }}</span>
                  <span>Updated {{ formatDate(subscription.updatedAtIso) }}</span>
                </div>
              </div>

              <div class="settings-inline-actions">
                <button
                  v-if="renamingBrowserDeviceId !== subscription.id"
                  type="button"
                  class="settings-secondary-button settings-secondary-button-small"
                  :aria-label="`Edit alias for ${formatNotificationDeviceLabel(subscription)}`"
                  @click="startRenamingBrowserDevice(subscription)"
                >
                  Edit alias
                </button>
                <button
                  type="button"
                  class="settings-danger-button settings-secondary-button-small"
                  :aria-label="`Delete device ${formatNotificationDeviceLabel(subscription)}`"
                  :disabled="deletingBrowserDeviceId === subscription.id"
                  @click="void deleteBrowserDevice(subscription)"
                >
                  {{ deletingBrowserDeviceId === subscription.id ? 'Deleting…' : 'Delete device' }}
                </button>
              </div>
            </div>

            <div class="notification-device-meta notification-device-meta-technical">
              <span>Last success {{ formatDate(subscription.lastSuccessAtIso) }}</span>
              <span>Last failure {{ formatDate(subscription.lastFailureAtIso) }}</span>
              <span>Failures {{ subscription.failureCount ?? 0 }}</span>
            </div>
            <p class="notification-device-endpoint">{{ truncateEndpoint(subscription.endpoint) }}</p>

            <p v-if="isNotificationDeviceStale(subscription)" class="settings-inline-status settings-inline-status-error">
              This device may be stale.
            </p>

            <div v-if="renamingBrowserDeviceId === subscription.id" class="settings-inline-form">
              <label class="settings-field settings-inline-field">
                <span class="settings-field-label">Device alias</span>
                <input
                  v-model="browserDeviceAliasDraft"
                  class="settings-field-input"
                  type="text"
                  aria-label="Device alias"
                  autocomplete="off"
                  maxlength="30"
                />
              </label>
              <p class="settings-field-help">Up to 30 characters.</p>
              <div class="settings-inline-actions">
                <button type="button" class="settings-secondary-button" @click="cancelRenamingBrowserDevice">
                  Cancel
                </button>
                <button
                  type="button"
                  class="settings-primary-button"
                  :disabled="deletingBrowserDeviceId === subscription.id"
                  @click="void saveBrowserDeviceAlias(subscription)"
                >
                  Save alias
                </button>
              </div>
            </div>
          </li>
        </ul>
        <div v-else class="settings-empty-state settings-empty-state-compact">
          No browser notification devices saved yet.
        </div>
      </div>
    </section>
    </section>

    <section
      v-else
      id="settings-panel-hooks"
      class="settings-tab-panel"
      role="tabpanel"
      aria-labelledby="settings-tab-hooks"
    >
      <SettingsHookTab :servers="props.servers" :selected-server-id="props.selectedServerId" />
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { CodexServerInfo } from '../../api/codexGateway'
import {
  createConnectorRegistration,
  deleteConnectorRegistration,
  getConnectorUpdateJobs,
  getConnectorRegistrations,
  renameConnectorRegistration,
  requestConnectorRestart,
  requestConnectorUpdate,
  rotateConnectorRegistrationToken,
  type CodexConnectorInfo,
  type ConnectorUpdateJobInfo,
} from '../../api/codexGateway'
import {
  disableBrowserNotifications,
  enableBrowserNotifications,
  getCurrentBrowserSubscriptionEndpoint,
  getStoredBrowserSubscriptions,
  isBrowserNotificationSupported,
  renameBrowserNotificationDevice,
  type StoredBrowserSubscription,
} from '../../api/pwaGateway'
import { createConnectorInstallCommand } from '../../shared/connectorInstallCommand'
import SettingsHookTab from './SettingsHookTab.vue'

const SETTINGS_TAB_STORAGE_KEY = 'codex-web-local.settings-tab.v1'

const props = withDefaults(defineProps<{
  servers?: CodexServerInfo[]
  selectedServerId?: string
}>(), {
  servers: () => [],
  selectedServerId: '',
})

const emit = defineEmits<{
  'connectors-changed': []
}>()

type InstallArtifact = {
  connector: CodexConnectorInfo
  token: string
}

type SettingsTabId = 'connectors' | 'notifications' | 'hooks'

const settingsTabs: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'connectors', label: 'Connector Control' },
  { id: 'notifications', label: 'Browser notifications' },
  { id: 'hooks', label: 'Hook settings' },
]

const connectors = ref<CodexConnectorInfo[]>([])
const selectedConnectorId = ref('')
const activeTab = ref<SettingsTabId>('connectors')
const isLoading = ref(false)
const isCreating = ref(false)
const isRenamingBusy = ref(false)
const isRotating = ref(false)
const isDeleting = ref(false)
const isRenaming = ref(false)
const isTokenRevealed = ref(false)
const isLoadingJobs = ref(false)
const isRestartingConnector = ref(false)
const isUpdatingConnector = ref(false)
const renamingBrowserDeviceId = ref('')
const deletingBrowserDeviceId = ref('')
const errorMessage = ref('')
const connectorJobStatusMessage = ref('')
const renameDraft = ref('')
const browserDeviceAliasDraft = ref('')
const pendingDeleteConnectorId = ref('')
const latestInstallArtifact = ref<InstallArtifact | null>(null)
const connectorJobs = ref<ConnectorUpdateJobInfo[]>([])
const browserSubscriptions = ref<StoredBrowserSubscription[]>([])
const currentBrowserSubscriptionEndpoint = ref('')
const isEnablingBrowserNotifications = ref(false)
const isDisablingBrowserNotifications = ref(false)
const browserNotificationStatusMessage = ref('')

const createForm = reactive({
  name: '',
  id: '',
  hubAddress: typeof window !== 'undefined' ? window.location.origin : '',
})

const selectedConnector = computed<CodexConnectorInfo | null>(() => {
  return connectors.value.find((connector) => connector.id === selectedConnectorId.value) ?? connectors.value[0] ?? null
})

const selectedInstallArtifact = computed<InstallArtifact | null>(() => {
  const artifact = latestInstallArtifact.value
  const connector = selectedConnector.value
  if (!artifact || !connector || artifact.connector.id !== connector.id) {
    return null
  }
  return artifact
})

const selectedInstallCommand = computed(() => {
  const artifact = selectedInstallArtifact.value
  if (!artifact) return ''
  return createConnectorInstallCommand({
    hubAddress: artifact.connector.hubAddress,
    connectorId: artifact.connector.id,
    bootstrapToken: isTokenRevealed.value ? artifact.token : '',
    ...(artifact.connector.relayE2eeKeyId ? { relayE2eeKeyId: artifact.connector.relayE2eeKeyId } : {}),
  })
})

const isBrowserNotificationsSupported = computed(() => isBrowserNotificationSupported())
const currentBrowserSubscription = computed(() => {
  const endpoint = currentBrowserSubscriptionEndpoint.value
  if (!endpoint) return null
  return browserSubscriptions.value.find((subscription) => subscription.endpoint === endpoint) ?? null
})
const browserNotificationSupportMessage = computed(() => (
  isBrowserNotificationsSupported.value
    ? 'This browser can receive push notifications through the Hub PWA service worker.'
    : 'This browser does not expose the Service Worker Push APIs required for Hub notifications.'
))
const browserNotificationPermissionMessage = computed(() => {
  if (typeof Notification === 'undefined') {
    return 'Notification permission is unavailable in this environment.'
  }
  switch (Notification.permission) {
    case 'granted':
      return 'Notification permission has been granted for this browser.'
    case 'denied':
      return 'Notification permission was denied. Update the browser site settings to re-enable it.'
    default:
      return 'Notification permission has not been requested yet.'
  }
})

function normalizeSelection(nextRows: CodexConnectorInfo[]): void {
  if (nextRows.length === 0) {
    selectedConnectorId.value = ''
    return
  }
  const current = selectedConnectorId.value.trim()
  if (current && nextRows.some((connector) => connector.id === current)) {
    return
  }
  selectedConnectorId.value = nextRows[0].id
}

function statusPillTone(state: CodexConnectorInfo['installState']): 'connected' | 'offline' | 'pending' | 'expired' | 'reinstall' {
  switch (state) {
    case 'connected':
      return 'connected'
    case 'offline':
      return 'offline'
    case 'expired_bootstrap':
      return 'expired'
    case 'reinstall_required':
      return 'reinstall'
    case 'pending_install':
    default:
      return 'pending'
  }
}

function formatInstallStateLabel(state: CodexConnectorInfo['installState']): string {
  switch (state) {
    case 'connected':
      return 'Connected'
    case 'offline':
      return 'Offline'
    case 'expired_bootstrap':
      return 'Expired bootstrap'
    case 'reinstall_required':
      return 'Reinstall required'
    case 'pending_install':
    default:
      return 'Pending install'
  }
}

function updateStatusTone(state: CodexConnectorInfo['updateStatus'] | undefined): 'connected' | 'offline' | 'pending' | 'expired' | 'reinstall' {
  switch (state) {
    case 'up_to_date':
      return 'connected'
    case 'update_available':
      return 'pending'
    case 'unsupported':
      return 'offline'
    case 'unknown':
    default:
      return 'reinstall'
  }
}

function formatUpdateStatusLabel(state: CodexConnectorInfo['updateStatus'] | undefined): string {
  switch (state) {
    case 'up_to_date':
      return 'Up to date'
    case 'update_available':
      return 'Update available'
    case 'unsupported':
      return 'Unsupported'
    case 'unknown':
    default:
      return 'Status unknown'
  }
}

function jobStatusTone(status: ConnectorUpdateJobInfo['status']): 'connected' | 'offline' | 'pending' | 'expired' | 'reinstall' {
  switch (status) {
    case 'healthy':
      return 'connected'
    case 'failed':
      return 'expired'
    case 'queued':
    case 'downloading':
    case 'verifying':
    case 'applying':
    case 'restarting':
    default:
      return 'pending'
  }
}

function formatJobStatusLabel(status: ConnectorUpdateJobInfo['status']): string {
  switch (status) {
    case 'healthy':
      return 'Healthy'
    case 'failed':
      return 'Failed'
    case 'queued':
      return 'Queued'
    case 'downloading':
      return 'Downloading'
    case 'verifying':
      return 'Verifying'
    case 'applying':
      return 'Applying'
    case 'restarting':
    default:
      return 'Restarting'
  }
}

function setLatestInstallArtifact(connector: CodexConnectorInfo, token: string): void {
  latestInstallArtifact.value = {
    connector,
    token,
  }
  isTokenRevealed.value = false
}

function toggleTokenReveal(): void {
  isTokenRevealed.value = !isTokenRevealed.value
}

function formatCount(value: number | undefined, singular: string, plural = `${singular}s`): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `— ${plural}`
  }
  return `${String(value)} ${value === 1 ? singular : plural}`
}

function formatProjectCount(connector: CodexConnectorInfo): string {
  return formatCount(connector.projectCount, 'project')
}

function formatThreadCount(connector: CodexConnectorInfo): string {
  return formatCount(connector.threadCount, 'thread')
}

function formatDate(value?: string): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) return '—'
  return parsed.toLocaleString()
}

function browserFamilyFromUserAgent(userAgent?: string): string {
  const source = (userAgent ?? '').toLowerCase()
  if (!source) return 'Browser'
  if (source.includes('edg/')) return 'Edge'
  if (source.includes('chrome/')) return 'Chrome'
  if (source.includes('firefox/')) return 'Firefox'
  if (source.includes('safari/') && !source.includes('chrome/')) return 'Safari'
  return 'Browser'
}

function formatNotificationDevicePlatform(subscription: StoredBrowserSubscription): string {
  const platform = subscription.platform?.trim() || 'Unknown platform'
  const browser = browserFamilyFromUserAgent(subscription.userAgent)
  return `${browser} · ${platform}`
}

function formatNotificationDeviceLabel(subscription: StoredBrowserSubscription): string {
  const alias = subscription.deviceAlias?.trim()
  if (alias) return alias
  const browser = browserFamilyFromUserAgent(subscription.userAgent)
  const platform = subscription.platform?.trim() || 'device'
  return `${platform} ${browser}`
}

function truncateEndpoint(endpoint: string): string {
  const normalized = endpoint.trim()
  if (normalized.length <= 68) return normalized
  return `${normalized.slice(0, 44)}…${normalized.slice(-18)}`
}

function isCurrentBrowserDevice(subscription: StoredBrowserSubscription): boolean {
  return Boolean(
    currentBrowserSubscriptionEndpoint.value
      && subscription.endpoint === currentBrowserSubscriptionEndpoint.value,
  )
}

function isNotificationDeviceStale(subscription: StoredBrowserSubscription): boolean {
  const lastFailure = subscription.lastFailureAtIso ? Date.parse(subscription.lastFailureAtIso) : Number.NaN
  const lastSuccess = subscription.lastSuccessAtIso ? Date.parse(subscription.lastSuccessAtIso) : Number.NaN
  return (subscription.failureCount ?? 0) > 0 && (!Number.isFinite(lastSuccess) || lastFailure >= lastSuccess)
}

function resetCreateForm(): void {
  createForm.name = ''
  createForm.id = ''
  createForm.hubAddress = typeof window !== 'undefined' ? window.location.origin : ''
}

function loadPersistedTab(): SettingsTabId {
  if (typeof window === 'undefined') return 'connectors'
  const raw = window.localStorage.getItem(SETTINGS_TAB_STORAGE_KEY)
  return settingsTabs.some((tab) => tab.id === raw) ? (raw as SettingsTabId) : 'connectors'
}

function savePersistedTab(tabId: SettingsTabId): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, tabId)
}

async function refreshConnectors(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const rows = await getConnectorRegistrations({ includeStats: true })
    connectors.value = rows
    normalizeSelection(rows)
    await refreshSelectedConnectorJobs()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load connectors'
    connectors.value = []
    selectedConnectorId.value = ''
    connectorJobs.value = []
  } finally {
    isLoading.value = false
  }
}

async function refreshSelectedConnectorJobs(): Promise<void> {
  const connector = selectedConnector.value
  if (!connector) {
    connectorJobs.value = []
    return
  }
  isLoadingJobs.value = true
  connectorJobStatusMessage.value = ''
  try {
    connectorJobs.value = await getConnectorUpdateJobs(connector.id)
  } catch (error) {
    connectorJobs.value = []
    connectorJobStatusMessage.value = error instanceof Error ? error.message : 'Failed to load connector jobs'
  } finally {
    isLoadingJobs.value = false
  }
}

async function refreshBrowserSubscriptions(): Promise<void> {
  if (!isBrowserNotificationsSupported.value) {
    browserSubscriptions.value = []
    currentBrowserSubscriptionEndpoint.value = ''
    return
  }
  try {
    currentBrowserSubscriptionEndpoint.value = await getCurrentBrowserSubscriptionEndpoint()
    browserSubscriptions.value = await getStoredBrowserSubscriptions()
  } catch (error) {
    browserNotificationStatusMessage.value = error instanceof Error
      ? error.message
      : 'Failed to load browser notification subscriptions'
  }
}

function startRenamingBrowserDevice(subscription: StoredBrowserSubscription): void {
  renamingBrowserDeviceId.value = subscription.id
  browserDeviceAliasDraft.value = subscription.deviceAlias ?? ''
}

function cancelRenamingBrowserDevice(): void {
  renamingBrowserDeviceId.value = ''
  browserDeviceAliasDraft.value = ''
}

async function saveBrowserDeviceAlias(subscription: StoredBrowserSubscription): Promise<void> {
  browserNotificationStatusMessage.value = ''
  try {
    const renamed = await renameBrowserNotificationDevice(subscription.id, browserDeviceAliasDraft.value)
    browserSubscriptions.value = browserSubscriptions.value.map((row) => (row.id === renamed.id ? renamed : row))
    cancelRenamingBrowserDevice()
    browserNotificationStatusMessage.value = `Saved alias for ${formatNotificationDeviceLabel(renamed)}.`
  } catch (error) {
    browserNotificationStatusMessage.value = error instanceof Error
      ? error.message
      : 'Failed to rename browser notification device'
  }
}

async function deleteBrowserDevice(subscription: StoredBrowserSubscription): Promise<void> {
  deletingBrowserDeviceId.value = subscription.id
  browserNotificationStatusMessage.value = ''
  try {
    const removedCurrentBrowser = await disableBrowserNotifications(subscription)
    browserSubscriptions.value = browserSubscriptions.value.filter((row) => row.id !== subscription.id)
    if (removedCurrentBrowser) {
      currentBrowserSubscriptionEndpoint.value = ''
      browserNotificationStatusMessage.value = 'Notifications disabled for this browser.'
    } else {
      browserNotificationStatusMessage.value = `Removed ${formatNotificationDeviceLabel(subscription)} from browser notifications.`
    }
    if (renamingBrowserDeviceId.value === subscription.id) {
      cancelRenamingBrowserDevice()
    }
  } catch (error) {
    browserNotificationStatusMessage.value = error instanceof Error
      ? error.message
      : 'Failed to delete browser notification device'
  } finally {
    deletingBrowserDeviceId.value = ''
  }
}

async function createConnector(): Promise<void> {
  if (isCreating.value) return
  isCreating.value = true
  errorMessage.value = ''
  try {
    const created = await createConnectorRegistration({
      id: createForm.id,
      name: createForm.name,
      hubAddress: createForm.hubAddress,
    })
    connectors.value = [created.connector, ...connectors.value]
    selectedConnectorId.value = created.connector.id
    latestInstallArtifact.value = null
    setLatestInstallArtifact(created.connector, created.bootstrapToken)
    pendingDeleteConnectorId.value = ''
    isRenaming.value = false
    connectorJobs.value = []
    connectorJobStatusMessage.value = ''
    emit('connectors-changed')
    resetCreateForm()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to create connector'
  } finally {
    isCreating.value = false
  }
}

function startRename(): void {
  const connector = selectedConnector.value
  if (!connector) return
  renameDraft.value = connector.name
  isRenaming.value = true
  pendingDeleteConnectorId.value = ''
}

function cancelRename(): void {
  isRenaming.value = false
  renameDraft.value = ''
}

async function saveRename(): Promise<void> {
  const connector = selectedConnector.value
  if (!connector || isRenamingBusy.value) return
  isRenamingBusy.value = true
  errorMessage.value = ''
  try {
    const renamed = await renameConnectorRegistration(connector.id, { name: renameDraft.value })
    connectors.value = connectors.value.map((entry) => (entry.id === connector.id ? renamed : entry))
    isRenaming.value = false
    renameDraft.value = ''
    emit('connectors-changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to rename connector'
  } finally {
    isRenamingBusy.value = false
  }
}

async function rotateToken(): Promise<void> {
  const connector = selectedConnector.value
  if (!connector || isRotating.value) return
  isRotating.value = true
  errorMessage.value = ''
  try {
    const rotated = await rotateConnectorRegistrationToken(connector.id)
    connectors.value = connectors.value.map((entry) => (entry.id === connector.id ? rotated.connector : entry))
    setLatestInstallArtifact(rotated.connector, rotated.bootstrapToken)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to reissue install token'
  } finally {
    isRotating.value = false
  }
}

async function queueConnectorRestart(): Promise<void> {
  const connector = selectedConnector.value
  if (!connector || isRestartingConnector.value) return
  isRestartingConnector.value = true
  errorMessage.value = ''
  connectorJobStatusMessage.value = ''
  try {
    const job = await requestConnectorRestart(connector.id)
    connectorJobStatusMessage.value = `Restart job ${job.id} queued.`
    await refreshSelectedConnectorJobs()
    await refreshConnectors()
  } catch (error) {
    connectorJobStatusMessage.value = error instanceof Error ? error.message : 'Failed to queue connector restart'
  } finally {
    isRestartingConnector.value = false
  }
}

async function queueConnectorUpdate(): Promise<void> {
  const connector = selectedConnector.value
  if (!connector || isUpdatingConnector.value) return
  isUpdatingConnector.value = true
  errorMessage.value = ''
  connectorJobStatusMessage.value = ''
  try {
    const job = await requestConnectorUpdate(connector.id)
    connectorJobStatusMessage.value = `Update job ${job.id} queued for ${job.targetVersion ?? 'the latest release'}.`
    await refreshSelectedConnectorJobs()
    await refreshConnectors()
  } catch (error) {
    connectorJobStatusMessage.value = error instanceof Error ? error.message : 'Failed to queue connector update'
  } finally {
    isUpdatingConnector.value = false
  }
}

function requestDelete(): void {
  const connector = selectedConnector.value
  if (!connector) return
  pendingDeleteConnectorId.value = connector.id
  isRenaming.value = false
}

async function confirmDelete(): Promise<void> {
  const connector = selectedConnector.value
  if (!connector || isDeleting.value || pendingDeleteConnectorId.value !== connector.id) return
  isDeleting.value = true
  errorMessage.value = ''
  try {
    await deleteConnectorRegistration(connector.id)
    await refreshConnectors()
    latestInstallArtifact.value = latestInstallArtifact.value?.connector.id === connector.id ? null : latestInstallArtifact.value
    if (latestInstallArtifact.value === null) {
      isTokenRevealed.value = false
    }
    pendingDeleteConnectorId.value = ''
    emit('connectors-changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to delete connector'
  } finally {
    isDeleting.value = false
  }
}

async function enableNotifications(): Promise<void> {
  if (!isBrowserNotificationsSupported.value || isEnablingBrowserNotifications.value) return
  isEnablingBrowserNotifications.value = true
  browserNotificationStatusMessage.value = ''
  try {
    const stored = await enableBrowserNotifications()
    currentBrowserSubscriptionEndpoint.value = stored.endpoint
    browserSubscriptions.value = [
      stored,
      ...browserSubscriptions.value.filter((row) => row.id !== stored.id),
    ]
    browserNotificationStatusMessage.value = 'Notifications enabled for this browser.'
  } catch (error) {
    browserNotificationStatusMessage.value = error instanceof Error
      ? error.message
      : 'Failed to enable browser notifications'
  } finally {
    isEnablingBrowserNotifications.value = false
  }
}

async function disableNotifications(): Promise<void> {
  const subscription = currentBrowserSubscription.value
  if (!subscription || isDisablingBrowserNotifications.value) return
  isDisablingBrowserNotifications.value = true
  browserNotificationStatusMessage.value = ''
  try {
    await disableBrowserNotifications(subscription)
    currentBrowserSubscriptionEndpoint.value = ''
    browserSubscriptions.value = browserSubscriptions.value.filter((row) => row.id !== subscription.id)
    browserNotificationStatusMessage.value = 'Notifications disabled for this browser.'
  } catch (error) {
    browserNotificationStatusMessage.value = error instanceof Error
      ? error.message
      : 'Failed to disable browser notifications'
  } finally {
    isDisablingBrowserNotifications.value = false
  }
}

onMounted(() => {
  activeTab.value = loadPersistedTab()
  void refreshConnectors()
  void refreshBrowserSubscriptions()
})

watch(selectedConnectorId, () => {
  void refreshSelectedConnectorJobs()
})

watch(activeTab, (tabId) => {
  savePersistedTab(tabId)
})
</script>

<style scoped>
@reference "tailwindcss";

.settings-panel {
  @apply h-full overflow-auto px-4 pb-6 sm:px-6 flex flex-col gap-4;
}

.settings-panel-header {
  @apply flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between;
}

.settings-panel-eyebrow {
  @apply m-0 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.settings-panel-title {
  @apply m-0 text-2xl font-semibold text-zinc-950;
}

.settings-panel-subtitle {
  @apply m-0 mt-1 max-w-3xl text-sm leading-6 text-zinc-600;
}

.settings-tablist {
  @apply flex flex-wrap gap-2;
}

.settings-tab {
  @apply inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50;
}

.settings-tab[data-active='true'] {
  @apply border-zinc-950 bg-zinc-950 text-white;
}

.settings-tab-panel {
  @apply flex flex-col gap-4;
}

.settings-panel-refresh {
  @apply rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.settings-panel-error {
  @apply m-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.settings-grid {
  @apply grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1.15fr)];
}

.settings-card {
  @apply rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm flex flex-col gap-4;
}

.settings-card-header {
  @apply flex items-start justify-between gap-3;
}

.settings-card-title {
  @apply m-0 text-base font-semibold text-zinc-950;
}

.settings-card-subtitle {
  @apply m-0 mt-1 text-sm leading-5 text-zinc-500;
}

.settings-field {
  @apply flex flex-col gap-1.5;
}

.settings-field-wide {
  @apply md:col-span-2;
}

.settings-field-label {
  @apply text-xs font-semibold uppercase tracking-[0.06em] text-zinc-500;
}

.settings-field-input {
  @apply h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-400;
}

.settings-primary-button {
  @apply inline-flex items-center justify-center rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60;
}

.settings-secondary-button {
  @apply inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.settings-danger-button {
  @apply inline-flex items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60;
}

.connector-list {
  @apply m-0 flex list-none flex-col gap-2 p-0;
}

.connector-list-item {
  @apply w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-zinc-300 hover:bg-zinc-100;
}

.connector-list-item[data-active='true'] {
  @apply border-zinc-900 bg-zinc-950 text-white;
}

.connector-list-item[data-active='true'] .connector-list-meta,
.connector-list-item[data-active='true'] .connector-list-stats {
  @apply text-zinc-200;
}

.connector-list-row {
  @apply flex items-center justify-between gap-3;
}

.connector-list-name {
  @apply text-sm font-semibold;
}

.connector-list-meta {
  @apply mt-1 block text-xs text-zinc-500;
}

.connector-list-stats {
  @apply mt-2 flex flex-wrap gap-3 text-xs text-zinc-600;
}

.connector-update-panel {
  @apply rounded-2xl border border-zinc-200 bg-zinc-50 p-4;
}

.connector-status-pill {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em];
}

.connector-status-pill[data-state='connected'] {
  @apply bg-emerald-100 text-emerald-700;
}

.connector-status-pill[data-state='offline'] {
  @apply bg-zinc-200 text-zinc-600;
}

.connector-status-pill[data-state='pending'] {
  @apply bg-amber-100 text-amber-700;
}

.connector-status-pill[data-state='expired'] {
  @apply bg-rose-100 text-rose-700;
}

.connector-status-pill[data-state='reinstall'] {
  @apply bg-violet-100 text-violet-700;
}

.settings-detail-grid {
  @apply grid grid-cols-1 gap-3 md:grid-cols-2;
}

.connector-summary-bar {
  @apply flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600;
}

.settings-status-meta {
  @apply flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600;
}

.settings-status-meta p {
  @apply m-0;
}

.settings-inline-form {
  @apply flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3;
}

.settings-inline-field {
  @apply w-full;
}

.settings-inline-actions,
.settings-action-row {
  @apply flex flex-wrap gap-2;
}

.settings-inline-actions-tight {
  @apply justify-start;
}

.settings-install-card {
  @apply mt-1;
}

.settings-notifications-card {
  @apply mt-1;
}

.notification-device-panel {
  @apply flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4;
}

.notification-device-summary {
  @apply text-sm text-zinc-500;
}

.notification-device-list {
  @apply m-0 flex list-none flex-col gap-3 p-0;
}

.notification-device-item {
  @apply rounded-2xl border border-zinc-200 bg-white p-3;
}

.notification-device-item[data-current='true'] {
  @apply border-emerald-300 bg-emerald-50/60;
}

.notification-device-row {
  @apply flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between;
}

.notification-device-copy {
  @apply flex flex-col gap-1.5;
}

.notification-device-heading {
  @apply flex flex-wrap items-center gap-2;
}

.notification-device-name {
  @apply text-sm font-semibold text-zinc-900;
}

.notification-device-meta {
  @apply flex flex-wrap gap-3 text-xs text-zinc-500;
}

.notification-device-meta-technical {
  @apply mt-3;
}

.notification-device-endpoint {
  @apply m-0 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-600 break-all;
}

.settings-install-once {
  @apply m-0 text-sm font-medium text-zinc-700;
}

.settings-code-block {
  @apply min-h-20 w-full rounded-2xl border border-zinc-200 bg-zinc-950 px-3 py-2 font-mono text-xs leading-6 text-zinc-50 outline-none resize-y;
}

.settings-code-block-large {
  @apply min-h-28;
}

.settings-empty-state {
  @apply rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500;
}

.settings-field-help {
  @apply m-0 text-xs leading-5 text-zinc-500;
}

.settings-inline-status {
  @apply m-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700;
}

.settings-inline-status-error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.settings-inline-link {
  @apply font-medium text-blue-600 underline underline-offset-2;
}

.connector-jobs {
  @apply flex flex-col gap-3;
}

.connector-jobs-header {
  @apply flex items-center justify-between gap-3;
}

.connector-job-list {
  @apply m-0 flex list-none flex-col gap-2 p-0;
}

.connector-job-item {
  @apply rounded-2xl border border-zinc-200 bg-white p-3;
}

.settings-secondary-button-small {
  @apply px-3 py-1.5 text-xs;
}

.settings-empty-state-compact {
  @apply py-3;
}
</style>
