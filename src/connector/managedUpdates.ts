import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  createManagedConnectorRuntimeState,
  getManagedConnectorRuntimeStatePath,
  getManagedConnectorRunnerPath,
  readManagedConnectorRuntimeState,
  type ConnectorRunnerMode,
  type ManagedConnectorRuntimeState,
  writeManagedConnectorRuntimeState,
  ensureManagedConnectorRuntimeBundle,
} from '../shared/connectorManagedRuntime.js'
import { CONNECTOR_NPM_PACKAGE_SPEC, CONNECTOR_BIN_NAME } from '../shared/connectorInstallCommand.js'

export type ManagedConnectorJobAction = 'restart' | 'update'
export type ManagedConnectorJobStatus = 'queued' | 'downloading' | 'verifying' | 'applying' | 'restarting' | 'healthy' | 'failed'

export type ManagedConnectorJobRecord = {
  id: string
  action: ManagedConnectorJobAction
  targetVersion?: string
  artifact?: {
    version: string
    artifactUrl: string
    sha256: string
  }
}

export type ManagedConnectorJobStatusUpdate = {
  status: ManagedConnectorJobStatus
  connectorVersion?: string
  runnerMode?: ConnectorRunnerMode
  errorMessage?: string
}

type DownloadedArtifact = {
  packageSpec: string
  version: string
}

type ApplyManagedConnectorJobDeps = {
  downloadArtifact?: (artifact: NonNullable<ManagedConnectorJobRecord['artifact']>) => Promise<DownloadedArtifact>
  validatePackageSpec?: (packageSpec: string) => Promise<{ version?: string }>
  reportStatus?: (update: ManagedConnectorJobStatusUpdate) => Promise<void>
}

type FinalizeManagedConnectorJobDeps = {
  reportStatus?: (update: ManagedConnectorJobStatusUpdate) => Promise<void>
}

async function reportStatus(update: ManagedConnectorJobStatusUpdate, deps?: { reportStatus?: (update: ManagedConnectorJobStatusUpdate) => Promise<void> }): Promise<void> {
  await deps?.reportStatus?.(update)
}

function getConnectorReleaseCacheDir(): string {
  return join(homedir(), '.local', 'share', 'codexui-connector', 'releases')
}

function detectPackageVersionFromOutput(output: string): string {
  const trimmed = output.trim()
  return trimmed.length > 0 ? trimmed.split(/\s+/u).pop() ?? trimmed : ''
}

async function defaultDownloadArtifact(artifact: NonNullable<ManagedConnectorJobRecord['artifact']>): Promise<DownloadedArtifact> {
  const response = await fetch(artifact.artifactUrl)
  if (!response.ok) {
    throw new Error(`Failed to download connector artifact: HTTP ${String(response.status)}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const digest = createHash('sha256').update(buffer).digest('hex')
  if (digest !== artifact.sha256.toLowerCase()) {
    throw new Error('Connector artifact checksum mismatch')
  }

  const targetDir = getConnectorReleaseCacheDir()
  await mkdir(targetDir, { recursive: true, mode: 0o700 })
  const fileName = `${artifact.version.replace(/[^A-Za-z0-9._-]+/g, '-')}.tgz`
  const filePath = resolve(targetDir, fileName)
  await writeFile(filePath, buffer, { mode: 0o600 })
  return {
    packageSpec: filePath,
    version: artifact.version,
  }
}

async function defaultValidatePackageSpec(packageSpec: string): Promise<{ version?: string }> {
  const result = spawnSync('npm', ['exec', '--yes', `--package=${packageSpec}`, '--', CONNECTOR_BIN_NAME, '--version'], {
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Failed to validate connector package').trim())
  }
  const version = detectPackageVersionFromOutput(result.stdout)
  return version ? { version } : {}
}

export function createManagedConnectorRuntimeBundle(input: {
  connectorId: string
  hubAddress: string
  tokenFilePath: string
  runnerMode?: ConnectorRunnerMode
  allowInsecureHttp?: boolean
  relayE2eeKeyId?: string
  currentVersion?: string
  packageSpec?: string
  runtimeStateFile?: string
}): Promise<{ statePath: string; envPath: string; runnerPath: string }> {
  const statePath = input.runtimeStateFile?.trim() || getManagedConnectorRuntimeStatePath(input.connectorId)
  return ensureManagedConnectorRuntimeBundle(statePath, createManagedConnectorRuntimeState({
    connectorId: input.connectorId,
    hubAddress: input.hubAddress,
    tokenFilePath: input.tokenFilePath,
    runnerMode: input.runnerMode ?? 'script',
    allowInsecureHttp: input.allowInsecureHttp === true,
    ...(input.relayE2eeKeyId ? { relayE2eeKeyId: input.relayE2eeKeyId } : {}),
    ...(input.currentVersion ? { currentVersion: input.currentVersion } : {}),
    packageSpec: input.packageSpec?.trim() || CONNECTOR_NPM_PACKAGE_SPEC,
  }))
}

export async function applyManagedConnectorJob(input: {
  runtimeStateFile: string
  job: ManagedConnectorJobRecord
}, deps: ApplyManagedConnectorJobDeps = {}): Promise<{ restartRequested: boolean }> {
  const state = await readManagedConnectorRuntimeState(input.runtimeStateFile)
  if (!state) {
    throw new Error('Managed connector runtime state was not found')
  }

  if (input.job.action === 'restart') {
    const nextState: ManagedConnectorRuntimeState = {
      ...state,
      pendingJobId: input.job.id,
      pendingAction: 'restart',
      pendingTargetVersion: undefined,
      updatedAtIso: new Date().toISOString(),
    }
    await writeManagedConnectorRuntimeState(input.runtimeStateFile, nextState)
    await reportStatus({ status: 'restarting', connectorVersion: state.currentVersion, runnerMode: state.runnerMode }, deps)
    return { restartRequested: true }
  }

  if (!input.job.artifact) {
    throw new Error('Update jobs require an artifact payload')
  }

  const downloadArtifact = deps.downloadArtifact ?? defaultDownloadArtifact
  const validatePackageSpec = deps.validatePackageSpec ?? defaultValidatePackageSpec

  await reportStatus({ status: 'downloading', connectorVersion: state.currentVersion, runnerMode: state.runnerMode }, deps)
  const downloaded = await downloadArtifact(input.job.artifact)
  await reportStatus({ status: 'verifying', connectorVersion: state.currentVersion, runnerMode: state.runnerMode }, deps)
  const validated = await validatePackageSpec(downloaded.packageSpec)
  const resolvedVersion = validated.version?.trim() || downloaded.version.trim() || input.job.targetVersion?.trim() || ''
  if (input.job.targetVersion?.trim() && resolvedVersion && resolvedVersion !== input.job.targetVersion.trim()) {
    throw new Error(`Validated connector version ${resolvedVersion} did not match target ${input.job.targetVersion.trim()}`)
  }

  await reportStatus({ status: 'applying', connectorVersion: state.currentVersion, runnerMode: state.runnerMode }, deps)
  const nextState: ManagedConnectorRuntimeState = {
    ...state,
    previousPackageSpec: state.packageSpec,
    previousVersion: state.currentVersion,
    packageSpec: downloaded.packageSpec,
    currentVersion: resolvedVersion || state.currentVersion,
    pendingJobId: input.job.id,
    pendingAction: 'update',
    pendingTargetVersion: input.job.targetVersion?.trim() || resolvedVersion || undefined,
    updatedAtIso: new Date().toISOString(),
  }
  await writeManagedConnectorRuntimeState(input.runtimeStateFile, nextState)
  await reportStatus({ status: 'restarting', connectorVersion: nextState.currentVersion, runnerMode: state.runnerMode }, deps)
  return { restartRequested: true }
}

export async function finalizeManagedConnectorJob(input: {
  runtimeStateFile: string
  currentVersion?: string
}, deps: FinalizeManagedConnectorJobDeps = {}): Promise<{ restartRequested: boolean }> {
  const state = await readManagedConnectorRuntimeState(input.runtimeStateFile)
  if (!state?.pendingJobId || !state.pendingAction) {
    return { restartRequested: false }
  }

  const resolvedCurrentVersion = input.currentVersion?.trim() || state.currentVersion?.trim() || ''
  if (state.pendingAction === 'update' && state.pendingTargetVersion && resolvedCurrentVersion && resolvedCurrentVersion !== state.pendingTargetVersion) {
    const rolledBackState: ManagedConnectorRuntimeState = {
      ...state,
      packageSpec: state.previousPackageSpec || state.packageSpec,
      currentVersion: state.previousVersion || state.currentVersion,
      pendingJobId: undefined,
      pendingAction: undefined,
      pendingTargetVersion: undefined,
      updatedAtIso: new Date().toISOString(),
    }
    await writeManagedConnectorRuntimeState(input.runtimeStateFile, rolledBackState)
    await reportStatus({
      status: 'failed',
      connectorVersion: resolvedCurrentVersion,
      runnerMode: state.runnerMode,
      errorMessage: `Connector reported ${resolvedCurrentVersion} instead of ${state.pendingTargetVersion}. Rolled back to the previous package spec.`,
    }, deps)
    return { restartRequested: true }
  }

  const nextState: ManagedConnectorRuntimeState = {
    ...state,
    currentVersion: resolvedCurrentVersion || state.currentVersion,
    pendingJobId: undefined,
    pendingAction: undefined,
    pendingTargetVersion: undefined,
    updatedAtIso: new Date().toISOString(),
  }
  await writeManagedConnectorRuntimeState(input.runtimeStateFile, nextState)
  await reportStatus({
    status: 'healthy',
    connectorVersion: nextState.currentVersion,
    runnerMode: state.runnerMode,
  }, deps)
  return { restartRequested: false }
}

export {
  createManagedConnectorRuntimeState,
  getManagedConnectorRuntimeStatePath,
  getManagedConnectorRunnerPath,
  readManagedConnectorRuntimeState,
  writeManagedConnectorRuntimeState,
}
