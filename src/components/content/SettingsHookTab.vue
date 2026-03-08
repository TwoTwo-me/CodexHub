<template>
  <section class="settings-tab-panel" role="tabpanel" aria-label="Hook settings">
    <div class="settings-card">
      <div class="settings-card-header">
        <div>
          <h3 class="settings-card-title">Hook settings</h3>
          <p class="settings-card-subtitle">
            Manage the selected server’s default approval and sandbox behavior using Codex App Server config values.
          </p>
        </div>
        <button type="button" class="settings-secondary-button" :disabled="isLoading || !selectedServerIdValue" @click="void refresh()">
          {{ isLoading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>

      <div v-if="servers.length > 0" class="settings-hook-server-row">
        <div class="settings-hook-server-picker">
          <ServerPicker
            :model-value="selectedServerIdValue"
            :options="servers"
            mode="compact"
            @update:model-value="onSelectServer"
          />
        </div>
        <p class="settings-field-help settings-field-help-inline">
          Hook settings are server-scoped. Browser notification targets stay in their own tab.
        </p>
      </div>

      <div v-if="!selectedServerIdValue" class="settings-empty-state">
        Register or select a server to manage hook defaults.
      </div>

      <div v-else-if="unsupportedMessage" class="settings-empty-state settings-empty-state-warning">
        <p class="settings-empty-title">Hook settings unavailable</p>
        <p>{{ unsupportedMessage }}</p>
      </div>

      <template v-else>
        <p v-if="errorMessage" class="settings-inline-status settings-inline-status-error">{{ errorMessage }}</p>
        <p v-if="saveStatusMessage" class="settings-inline-status">{{ saveStatusMessage }}</p>

        <div class="settings-detail-grid">
          <label class="settings-field">
            <span class="settings-field-label">Approval policy</span>
            <select
              aria-label="Approval policy"
              class="settings-field-input"
              :disabled="isLoading || !canEdit"
              :value="draftApprovalPolicy"
              @change="onApprovalPolicyChange"
            >
              <option v-for="option in approvalPolicyOptions" :key="option.value" :value="option.value" :disabled="option.disabled">
                {{ option.label }}
              </option>
            </select>
            <p v-if="approvalPolicyOrigin" class="settings-field-help">Source: {{ approvalPolicyOrigin }}</p>
          </label>

          <label class="settings-field">
            <span class="settings-field-label">Sandbox mode</span>
            <select
              aria-label="Sandbox mode"
              class="settings-field-input"
              :disabled="isLoading || !canEdit"
              :value="draftSandboxMode"
              @change="onSandboxModeChange"
            >
              <option v-for="option in sandboxModeOptions" :key="option.value" :value="option.value" :disabled="option.disabled">
                {{ option.label }}
              </option>
            </select>
            <p v-if="sandboxModeOrigin" class="settings-field-help">Source: {{ sandboxModeOrigin }}</p>
          </label>
        </div>

        <div class="settings-status-meta">
          <p>Approval policy controls when Codex pauses for shell, file, or tool consent.</p>
          <p>Sandbox mode controls the execution boundary used for new threads on this server.</p>
          <p>Changes may not affect already-running threads or approvals that are already pending.</p>
        </div>

        <div v-if="requirementsSummary.length > 0" class="settings-card settings-hook-requirements-card">
          <div class="settings-card-header">
            <div>
              <h4 class="settings-card-title">Requirements & restrictions</h4>
              <p class="settings-card-subtitle">Policy constraints reported by the selected Codex App Server.</p>
            </div>
          </div>
          <ul class="settings-hint-list">
            <li v-for="hint in requirementsSummary" :key="hint">{{ hint }}</li>
          </ul>
        </div>

        <div class="settings-action-row">
          <button
            type="button"
            class="settings-primary-button"
            :disabled="!canSave || isSaving"
            @click="void saveSettings()"
          >
            {{ isSaving ? 'Saving…' : 'Save hook settings' }}
          </button>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ServerPicker from './ServerPicker.vue'
import {
  getAppServerConfig,
  getAppServerConfigRequirements,
  getMethodCatalogForServer,
  writeAppServerConfig,
  type CodexServerInfo,
} from '../../api/codexGateway'
import type { AskForApproval, SandboxMode } from '../../api/appServerDtos'

const APPROVAL_POLICY_OPTIONS: Array<{ value: AskForApproval; label: string }> = [
  { value: 'untrusted', label: 'Untrusted' },
  { value: 'on-failure', label: 'On failure' },
  { value: 'on-request', label: 'On request' },
  { value: 'never', label: 'Never' },
]

const SANDBOX_MODE_OPTIONS: Array<{ value: SandboxMode; label: string }> = [
  { value: 'read-only', label: 'Read-only' },
  { value: 'workspace-write', label: 'Workspace write' },
  { value: 'danger-full-access', label: 'Danger full access' },
]

const props = withDefaults(defineProps<{
  servers?: CodexServerInfo[]
  selectedServerId?: string
}>(), {
  servers: () => [],
  selectedServerId: '',
})

const selectedServerIdValue = ref('')
const draftApprovalPolicy = ref<AskForApproval | ''>('')
const draftSandboxMode = ref<SandboxMode | ''>('')
const savedApprovalPolicy = ref<AskForApproval | ''>('')
const savedSandboxMode = ref<SandboxMode | ''>('')
const allowedApprovalPolicies = ref<AskForApproval[]>([])
const allowedSandboxModes = ref<SandboxMode[]>([])
const approvalPolicyOrigin = ref('')
const sandboxModeOrigin = ref('')
const requirementsSummary = ref<string[]>([])
const unsupportedMessage = ref('')
const errorMessage = ref('')
const saveStatusMessage = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const writeMethod = ref<'config/batchWrite' | 'config/value/write' | ''>('')

const approvalPolicyOptions = computed(() => APPROVAL_POLICY_OPTIONS.map((option) => ({
  ...option,
  disabled: allowedApprovalPolicies.value.length > 0 && !allowedApprovalPolicies.value.includes(option.value),
})))

const sandboxModeOptions = computed(() => SANDBOX_MODE_OPTIONS.map((option) => ({
  ...option,
  disabled: allowedSandboxModes.value.length > 0 && !allowedSandboxModes.value.includes(option.value),
})))

const isDirty = computed(() => (
  draftApprovalPolicy.value !== savedApprovalPolicy.value
  || draftSandboxMode.value !== savedSandboxMode.value
))

const canEdit = computed(() => !unsupportedMessage.value && writeMethod.value.length > 0)
const canSave = computed(() => Boolean(selectedServerIdValue.value) && canEdit.value && isDirty.value)

function normalizeSelectedServerId(preferredServerId: string, servers: CodexServerInfo[]): string {
  const normalizedPreferred = preferredServerId.trim()
  if (normalizedPreferred && servers.some((server) => server.id === normalizedPreferred)) {
    return normalizedPreferred
  }
  return servers[0]?.id ?? ''
}

function formatConfigOrigin(origin: unknown): string {
  if (!origin || typeof origin !== 'object' || Array.isArray(origin)) return ''
  const metadata = origin as { name?: { type?: string; file?: string; dotCodexFolder?: string; domain?: string } }
  const source = metadata.name
  if (!source || typeof source !== 'object') return ''
  switch (source.type) {
    case 'user':
      return 'User config'
    case 'project':
      return 'Project config'
    case 'system':
      return 'System config'
    case 'mdm':
      return 'Managed policy'
    case 'sessionFlags':
      return 'Session flags'
    default:
      return source.type || ''
  }
}

function normalizeRequirementsSummary(requirements: unknown): string[] {
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) return []
  const record = requirements as {
    allowedApprovalPolicies?: AskForApproval[] | null
    allowedSandboxModes?: SandboxMode[] | null
    network?: {
      enabled?: boolean | null
      allowedDomains?: string[] | null
      deniedDomains?: string[] | null
      allowLocalBinding?: boolean | null
    } | null
  }

  const summary: string[] = []
  if (Array.isArray(record.allowedApprovalPolicies) && record.allowedApprovalPolicies.length > 0) {
    summary.push(`Allowed approval policies: ${record.allowedApprovalPolicies.join(', ')}`)
  }
  if (Array.isArray(record.allowedSandboxModes) && record.allowedSandboxModes.length > 0) {
    summary.push(`Allowed sandbox modes: ${record.allowedSandboxModes.join(', ')}`)
  }
  if (record.network) {
    if (record.network.enabled === false) {
      summary.push('Network access is disabled by policy.')
    }
    if (Array.isArray(record.network.allowedDomains) && record.network.allowedDomains.length > 0) {
      summary.push(`Allowed outbound domains: ${record.network.allowedDomains.join(', ')}`)
    }
    if (Array.isArray(record.network.deniedDomains) && record.network.deniedDomains.length > 0) {
      summary.push(`Denied domains: ${record.network.deniedDomains.join(', ')}`)
    }
    if (record.network.allowLocalBinding === false) {
      summary.push('Local network binding is disabled.')
    }
  }
  return summary
}

async function refresh(): Promise<void> {
  const serverId = selectedServerIdValue.value.trim()
  if (!serverId) {
    unsupportedMessage.value = ''
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  saveStatusMessage.value = ''
  unsupportedMessage.value = ''

  try {
    const methods = await getMethodCatalogForServer(serverId)
    const canRead = methods.includes('config/read')
    const supportsBatchWrite = methods.includes('config/batchWrite')
    const supportsValueWrite = methods.includes('config/value/write')
    const supportsRequirements = methods.includes('configRequirements/read')

    if (!canRead) {
      writeMethod.value = ''
      unsupportedMessage.value = 'This server does not expose the App Server config methods required for Hook settings.'
      return
    }

    writeMethod.value = supportsBatchWrite ? 'config/batchWrite' : supportsValueWrite ? 'config/value/write' : ''

    const configResponse = await getAppServerConfig(serverId)
    const config = configResponse.config ?? {}
    savedApprovalPolicy.value = config.approval_policy ?? ''
    savedSandboxMode.value = config.sandbox_mode ?? ''
    draftApprovalPolicy.value = savedApprovalPolicy.value
    draftSandboxMode.value = savedSandboxMode.value
    approvalPolicyOrigin.value = formatConfigOrigin(configResponse.origins?.approval_policy)
    sandboxModeOrigin.value = formatConfigOrigin(configResponse.origins?.sandbox_mode)

    if (supportsRequirements) {
      const requirementsResponse = await getAppServerConfigRequirements(serverId)
      const requirements = requirementsResponse.requirements
      allowedApprovalPolicies.value = Array.isArray(requirements?.allowedApprovalPolicies)
        ? requirements.allowedApprovalPolicies
        : []
      allowedSandboxModes.value = Array.isArray(requirements?.allowedSandboxModes)
        ? requirements.allowedSandboxModes
        : []
      requirementsSummary.value = normalizeRequirementsSummary(requirements)
    } else {
      allowedApprovalPolicies.value = []
      allowedSandboxModes.value = []
      requirementsSummary.value = ['This server does not report config requirements; unsupported values may still be rejected during save.']
    }

    if (!writeMethod.value) {
      unsupportedMessage.value = 'This server can be read, but it does not expose a config write method for Hook settings.'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load Hook settings'
  } finally {
    isLoading.value = false
  }
}

function onSelectServer(serverId: string): void {
  selectedServerIdValue.value = normalizeSelectedServerId(serverId, props.servers)
  void refresh()
}

function onApprovalPolicyChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value ?? ''
  draftApprovalPolicy.value = value as AskForApproval | ''
}

function onSandboxModeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value ?? ''
  draftSandboxMode.value = value as SandboxMode | ''
}

async function saveSettings(): Promise<void> {
  const serverId = selectedServerIdValue.value.trim()
  if (!serverId || !writeMethod.value || !isDirty.value) return
  isSaving.value = true
  errorMessage.value = ''
  saveStatusMessage.value = ''
  try {
    await writeAppServerConfig(serverId, {
      approvalPolicy: draftApprovalPolicy.value,
      sandboxMode: draftSandboxMode.value,
      writeMethod: writeMethod.value,
    })
    await refresh()
    saveStatusMessage.value = 'Hook settings saved.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save Hook settings'
  } finally {
    isSaving.value = false
  }
}

watch(
  () => [props.selectedServerId, props.servers] as const,
  ([selectedServerId, servers]) => {
    const nextServerId = normalizeSelectedServerId(selectedServerId ?? '', servers ?? [])
    if (nextServerId !== selectedServerIdValue.value) {
      selectedServerIdValue.value = nextServerId
    }
    if (!nextServerId) {
      unsupportedMessage.value = ''
      errorMessage.value = ''
      saveStatusMessage.value = ''
      return
    }
    void refresh()
  },
  { immediate: true, deep: true },
)
</script>

<style scoped>
@reference "tailwindcss";

.settings-tab-panel {
  @apply flex flex-col gap-4;
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

.settings-secondary-button {
  @apply inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.settings-primary-button {
  @apply inline-flex items-center justify-center rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60;
}

.settings-hook-server-row {
  @apply flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3;
}

.settings-hook-server-picker {
  @apply w-full;
}

.settings-detail-grid {
  @apply grid grid-cols-1 gap-4 md:grid-cols-2;
}

.settings-field {
  @apply flex flex-col gap-1.5;
}

.settings-field-label {
  @apply text-xs font-semibold uppercase tracking-[0.06em] text-zinc-500;
}

.settings-field-input {
  @apply h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-400;
}

.settings-field-help {
  @apply m-0 text-xs leading-5 text-zinc-500;
}

.settings-field-help-inline {
  @apply text-sm;
}

.settings-status-meta {
  @apply rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 flex flex-col gap-1.5;
}

.settings-action-row {
  @apply flex flex-wrap gap-3;
}

.settings-inline-status {
  @apply m-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700;
}

.settings-inline-status-error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.settings-empty-state {
  @apply rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-500;
}

.settings-empty-state-warning {
  @apply border-amber-300 bg-amber-50 text-amber-800;
}

.settings-empty-title {
  @apply m-0 mb-1 text-sm font-semibold;
}

.settings-hint-list {
  @apply m-0 list-disc pl-5 text-sm text-zinc-600 flex flex-col gap-1.5;
}

.settings-hook-requirements-card {
  @apply shadow-none;
}
</style>
