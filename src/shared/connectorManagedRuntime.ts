import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export type ConnectorRunnerMode = 'script' | 'systemd-user' | 'pm2-user' | 'manual' | 'unknown'
export type ManagedConnectorJobAction = 'restart' | 'update'

export type ManagedConnectorRuntimeState = {
  version: 1
  connectorId: string
  hubAddress: string
  tokenFilePath: string
  packageSpec: string
  runnerMode: ConnectorRunnerMode
  allowInsecureHttp: boolean
  relayE2eeKeyId?: string
  currentVersion?: string
  previousPackageSpec?: string
  previousVersion?: string
  pendingJobId?: string
  pendingAction?: ManagedConnectorJobAction
  pendingTargetVersion?: string
  updatedAtIso: string
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

export function isManagedConnectorRunnerMode(mode: string | undefined | null): mode is Extract<ConnectorRunnerMode, 'script' | 'systemd-user' | 'pm2-user'> {
  return mode === 'script' || mode === 'systemd-user' || mode === 'pm2-user'
}

export function getManagedConnectorConfigDir(): string {
  return join(homedir(), '.config', 'codexui-connector')
}

export function getManagedConnectorRuntimeStatePath(connectorId: string): string {
  return join(getManagedConnectorConfigDir(), `${connectorId}.state.json`)
}

export function getManagedConnectorRuntimeEnvPath(connectorId: string): string {
  return join(getManagedConnectorConfigDir(), `${connectorId}.env`)
}

export function getManagedConnectorRunnerPath(connectorId: string): string {
  return join(getManagedConnectorConfigDir(), `${connectorId}.sh`)
}

export function createManagedConnectorRuntimeState(input: {
  connectorId: string
  hubAddress: string
  tokenFilePath: string
  packageSpec: string
  runnerMode?: ConnectorRunnerMode
  allowInsecureHttp?: boolean
  relayE2eeKeyId?: string
  currentVersion?: string
  previousPackageSpec?: string
  previousVersion?: string
  pendingJobId?: string
  pendingAction?: ManagedConnectorJobAction
  pendingTargetVersion?: string
}): ManagedConnectorRuntimeState {
  return {
    version: 1,
    connectorId: input.connectorId,
    hubAddress: input.hubAddress,
    tokenFilePath: input.tokenFilePath,
    packageSpec: input.packageSpec,
    runnerMode: input.runnerMode ?? 'script',
    allowInsecureHttp: input.allowInsecureHttp === true,
    ...(input.relayE2eeKeyId ? { relayE2eeKeyId: input.relayE2eeKeyId } : {}),
    ...(input.currentVersion ? { currentVersion: input.currentVersion } : {}),
    ...(input.previousPackageSpec ? { previousPackageSpec: input.previousPackageSpec } : {}),
    ...(input.previousVersion ? { previousVersion: input.previousVersion } : {}),
    ...(input.pendingJobId ? { pendingJobId: input.pendingJobId } : {}),
    ...(input.pendingAction ? { pendingAction: input.pendingAction } : {}),
    ...(input.pendingTargetVersion ? { pendingTargetVersion: input.pendingTargetVersion } : {}),
    updatedAtIso: new Date().toISOString(),
  }
}

export function deriveManagedConnectorRuntimeEnvPath(statePath: string): string {
  if (statePath.endsWith('.state.json')) {
    return statePath.slice(0, -'.state.json'.length) + '.env'
  }
  return `${statePath}.env`
}

function normalizeManagedConnectorRuntimeState(value: unknown): ManagedConnectorRuntimeState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const connectorId = typeof record.connectorId === 'string' ? record.connectorId.trim() : ''
  const hubAddress = typeof record.hubAddress === 'string' ? record.hubAddress.trim() : ''
  const tokenFilePath = typeof record.tokenFilePath === 'string' ? record.tokenFilePath.trim() : ''
  const packageSpec = typeof record.packageSpec === 'string' ? record.packageSpec.trim() : ''
  const runnerModeRaw = typeof record.runnerMode === 'string' ? record.runnerMode.trim() : ''
  const runnerMode: ConnectorRunnerMode = runnerModeRaw === 'systemd-user'
    || runnerModeRaw === 'pm2-user'
    || runnerModeRaw === 'manual'
    || runnerModeRaw === 'unknown'
    ? runnerModeRaw
    : 'script'

  if (!connectorId || !hubAddress || !tokenFilePath || !packageSpec) {
    return null
  }

  return {
    version: 1,
    connectorId,
    hubAddress,
    tokenFilePath,
    packageSpec,
    runnerMode,
    allowInsecureHttp: record.allowInsecureHttp === true,
    ...(typeof record.relayE2eeKeyId === 'string' && record.relayE2eeKeyId.trim().length > 0 ? { relayE2eeKeyId: record.relayE2eeKeyId.trim() } : {}),
    ...(typeof record.currentVersion === 'string' && record.currentVersion.trim().length > 0 ? { currentVersion: record.currentVersion.trim() } : {}),
    ...(typeof record.previousPackageSpec === 'string' && record.previousPackageSpec.trim().length > 0 ? { previousPackageSpec: record.previousPackageSpec.trim() } : {}),
    ...(typeof record.previousVersion === 'string' && record.previousVersion.trim().length > 0 ? { previousVersion: record.previousVersion.trim() } : {}),
    ...(typeof record.pendingJobId === 'string' && record.pendingJobId.trim().length > 0 ? { pendingJobId: record.pendingJobId.trim() } : {}),
    ...(record.pendingAction === 'restart' || record.pendingAction === 'update' ? { pendingAction: record.pendingAction } : {}),
    ...(typeof record.pendingTargetVersion === 'string' && record.pendingTargetVersion.trim().length > 0 ? { pendingTargetVersion: record.pendingTargetVersion.trim() } : {}),
    updatedAtIso: typeof record.updatedAtIso === 'string' && record.updatedAtIso.trim().length > 0
      ? record.updatedAtIso.trim()
      : new Date().toISOString(),
  }
}

export async function readManagedConnectorRuntimeState(statePath: string): Promise<ManagedConnectorRuntimeState | null> {
  try {
    const raw = await readFile(statePath, 'utf8')
    return normalizeManagedConnectorRuntimeState(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function renderManagedConnectorRuntimeEnv(state: ManagedConnectorRuntimeState, statePath: string): string {
  const lines = [
    '# Generated by codexui-connector install/update. Edit with care.',
    `export CODEXUI_CONNECTOR_RUNTIME_STATE_FILE=${shellQuote(statePath)}`,
    `export CODEXUI_CONNECTOR_CONNECTOR_ID=${shellQuote(state.connectorId)}`,
    `export CODEXUI_CONNECTOR_HUB_ADDRESS=${shellQuote(state.hubAddress)}`,
    `export CODEXUI_CONNECTOR_TOKEN_FILE=${shellQuote(state.tokenFilePath)}`,
    `export CODEXUI_CONNECTOR_PACKAGE_SPEC=${shellQuote(state.packageSpec)}`,
    `export CODEXUI_CONNECTOR_RUNNER_MODE=${shellQuote(state.runnerMode)}`,
    `export CODEXUI_CONNECTOR_ALLOW_INSECURE_HTTP=${shellQuote(state.allowInsecureHttp ? '1' : '0')}`,
    `export CODEXUI_CONNECTOR_CURRENT_VERSION=${shellQuote(state.currentVersion ?? '')}`,
    `export CODEXUI_CONNECTOR_PREVIOUS_PACKAGE_SPEC=${shellQuote(state.previousPackageSpec ?? '')}`,
    `export CODEXUI_CONNECTOR_PREVIOUS_VERSION=${shellQuote(state.previousVersion ?? '')}`,
    `export CODEXUI_CONNECTOR_PENDING_JOB_ID=${shellQuote(state.pendingJobId ?? '')}`,
    `export CODEXUI_CONNECTOR_PENDING_ACTION=${shellQuote(state.pendingAction ?? '')}`,
    `export CODEXUI_CONNECTOR_PENDING_TARGET_VERSION=${shellQuote(state.pendingTargetVersion ?? '')}`,
  ]

  if (state.relayE2eeKeyId) {
    lines.push(`export CODEXUI_CONNECTOR_RELAY_E2EE_KEY_ID=${shellQuote(state.relayE2eeKeyId)}`)
  }

  return `${lines.join('\n')}\n`
}

export function renderManagedConnectorRunnerScript(statePath: string, envPath: string): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `STATE_FILE=${shellQuote(statePath)}`,
    `ENV_FILE=${shellQuote(envPath)}`,
    '',
    'if [ ! -f "$ENV_FILE" ]; then',
    '  echo "Managed connector environment file not found: $ENV_FILE" >&2',
    '  exit 1',
    'fi',
    '',
    'while true; do',
    '  # shellcheck source=/dev/null',
    '  . "$ENV_FILE"',
    '  RUNNER_MODE="${CODEXUI_CONNECTOR_RUNNER_MODE_OVERRIDE:-${CODEXUI_CONNECTOR_RUNNER_MODE:-script}}"',
    '  CMD=(npm exec --yes --package="$CODEXUI_CONNECTOR_PACKAGE_SPEC" -- codexui-connector connect --hub "$CODEXUI_CONNECTOR_HUB_ADDRESS" --connector "$CODEXUI_CONNECTOR_CONNECTOR_ID" --token-file "$CODEXUI_CONNECTOR_TOKEN_FILE" --runner-mode "$RUNNER_MODE" --runtime-state-file "$STATE_FILE" --package-spec "$CODEXUI_CONNECTOR_PACKAGE_SPEC")',
    '  if [ "${CODEXUI_CONNECTOR_ALLOW_INSECURE_HTTP:-0}" = "1" ]; then',
    '    CMD+=(--allow-insecure-http)',
    '  fi',
    '  if [ -n "${CODEXUI_CONNECTOR_RELAY_E2EE_KEY_ID:-}" ]; then',
    '    CMD+=(--key-id "$CODEXUI_CONNECTOR_RELAY_E2EE_KEY_ID")',
    '  fi',
    '  if [ -n "${CODEXUI_CONNECTOR_RELAY_E2EE_PASSPHRASE:-}" ]; then',
    '    CMD+=(--passphrase "$CODEXUI_CONNECTOR_RELAY_E2EE_PASSPHRASE")',
    '  fi',
    '  set +e',
    '  "${CMD[@]}"',
    '  STATUS=$?',
    '  set -e',
    '  if [ "$STATUS" -eq 75 ]; then',
    '    continue',
    '  fi',
    '  exit "$STATUS"',
    'done',
    '',
  ].join('\n')
}

export async function writeManagedConnectorRuntimeState(statePath: string, state: ManagedConnectorRuntimeState): Promise<void> {
  const envPath = deriveManagedConnectorRuntimeEnvPath(statePath)
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 })
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await writeFile(envPath, renderManagedConnectorRuntimeEnv(state, statePath), { encoding: 'utf8', mode: 0o600 })
}

export async function ensureManagedConnectorRuntimeBundle(statePath: string, state: ManagedConnectorRuntimeState): Promise<{ statePath: string; envPath: string; runnerPath: string }> {
  const envPath = deriveManagedConnectorRuntimeEnvPath(statePath)
  const runnerPath = getManagedConnectorRunnerPath(state.connectorId)
  await writeManagedConnectorRuntimeState(statePath, state)
  await mkdir(dirname(runnerPath), { recursive: true, mode: 0o700 })
  await writeFile(runnerPath, renderManagedConnectorRunnerScript(statePath, envPath), { encoding: 'utf8', mode: 0o700 })
  await chmod(runnerPath, 0o700)
  return { statePath, envPath, runnerPath }
}

export function createManagedConnectorRunnerCommand(connectorId: string): string {
  return `$HOME/.config/codexui-connector/${connectorId}.sh`
}
