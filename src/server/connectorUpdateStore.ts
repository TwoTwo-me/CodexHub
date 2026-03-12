import { randomBytes } from 'node:crypto'
import packageJson from '../../package.json'
import { readStateEntry, writeStateEntry } from './sqliteStore.js'
import type { ConnectorRunnerMode } from '../shared/connectorManagedRuntime.js'
import { createVersionPinnedConnectorPackageSpec } from '../shared/connectorInstallCommand.js'

export type ConnectorReleaseRecord = {
  version: string
  artifactUrl: string
  sha256: string
  releaseNotes?: string
  releaseNotesUrl?: string
  publishedAtIso?: string
  runnerModes?: ConnectorRunnerMode[]
  platforms?: string[]
}

export type ConnectorCompatibilityRelease = {
  version: string
  packageSpec: string
  releaseNotesUrl?: string
}

export type ConnectorUpdateStatus = 'unknown' | 'up_to_date' | 'update_available' | 'unsupported'
export type ConnectorUpdateJobAction = 'restart' | 'update'
export type ConnectorUpdateJobStatus = 'queued' | 'downloading' | 'verifying' | 'applying' | 'restarting' | 'healthy' | 'failed'

export type ConnectorUpdateJobRecord = {
  id: string
  connectorId: string
  serverId: string
  action: ConnectorUpdateJobAction
  status: ConnectorUpdateJobStatus
  requestedAtIso: string
  startedAtIso?: string
  completedAtIso?: string
  targetVersion?: string
  connectorVersion?: string
  runnerMode?: ConnectorRunnerMode
  errorMessage?: string
  artifact?: ConnectorReleaseRecord
}

const RELEASE_SCOPE = 'hub'
const RELEASE_ENTRY_KEY = 'connector-release-manifest-v1'
const UPDATE_JOBS_SCOPE_PREFIX = 'connector-update-jobs:'
const HUB_COMPATIBILITY_VERSION = normalizeHubCompatibilityVersion(packageJson.version)

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeHubCompatibilityVersion(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRunnerMode(value: unknown): ConnectorRunnerMode | undefined {
  const mode = readString(value)
  return mode === 'script' || mode === 'systemd-user' || mode === 'pm2-user' || mode === 'manual' || mode === 'unknown'
    ? mode
    : undefined
}

function normalizePlatforms(value: unknown): string[] | undefined {
  const rows = Array.isArray(value) ? value : []
  const normalized = rows
    .map((entry) => readString(entry).toLowerCase())
    .filter((entry, index, items) => entry.length > 0 && items.indexOf(entry) === index)
  return normalized.length > 0 ? normalized : undefined
}

function normalizeReleaseRecord(value: unknown): ConnectorReleaseRecord | null {
  const record = asRecord(value)
  if (!record) return null
  const version = readString(record.version)
  const artifactUrl = readString(record.artifactUrl)
  const sha256 = readString(record.sha256).toLowerCase()
  if (!version || !artifactUrl || !/^[a-f0-9]{64}$/u.test(sha256)) {
    return null
  }
  const runnerModes = Array.isArray(record.runnerModes)
    ? record.runnerModes.map((entry) => normalizeRunnerMode(entry)).filter((entry): entry is ConnectorRunnerMode => !!entry)
    : []
  return {
    version,
    artifactUrl,
    sha256,
    ...(readString(record.releaseNotes) ? { releaseNotes: readString(record.releaseNotes) } : {}),
    ...(readString(record.releaseNotesUrl) ? { releaseNotesUrl: readString(record.releaseNotesUrl) } : {}),
    ...(readString(record.publishedAtIso) ? { publishedAtIso: readString(record.publishedAtIso) } : {}),
    ...(runnerModes.length > 0 ? { runnerModes } : {}),
    ...(normalizePlatforms(record.platforms) ? { platforms: normalizePlatforms(record.platforms) } : {}),
  }
}

function parseVersion(version: string): { core: number[]; prerelease: string } {
  const [coreRaw, prereleaseRaw = ''] = version.trim().split('-', 2)
  const core = coreRaw.split('.').map((entry) => {
    const parsed = Number(entry)
    return Number.isFinite(parsed) ? parsed : 0
  })
  return {
    core,
    prerelease: prereleaseRaw.trim(),
  }
}

export function compareConnectorVersions(left: string, right: string): number {
  const parsedLeft = parseVersion(left)
  const parsedRight = parseVersion(right)
  const maxLength = Math.max(parsedLeft.core.length, parsedRight.core.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = parsedLeft.core[index] ?? 0
    const rightValue = parsedRight.core[index] ?? 0
    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1
    }
  }
  if (!parsedLeft.prerelease && parsedRight.prerelease) return 1
  if (parsedLeft.prerelease && !parsedRight.prerelease) return -1
  if (parsedLeft.prerelease === parsedRight.prerelease) return 0
  return parsedLeft.prerelease.localeCompare(parsedRight.prerelease)
}

function isWithinHubCompatibilityCeiling(version: string): boolean {
  if (!HUB_COMPATIBILITY_VERSION) return true
  return compareConnectorVersions(version, HUB_COMPATIBILITY_VERSION) <= 0
}

function releaseMatchesPlatform(release: ConnectorReleaseRecord, platform?: string): boolean {
  if (!release.platforms || release.platforms.length === 0) {
    return true
  }
  const normalizedPlatform = readString(platform).toLowerCase()
  if (!normalizedPlatform) return false
  const platformSeed = normalizedPlatform.split('-', 1)[0] ?? normalizedPlatform
  return release.platforms.includes(normalizedPlatform) || release.platforms.includes(platformSeed)
}

function releaseMatchesRunnerMode(release: ConnectorReleaseRecord, runnerMode?: ConnectorRunnerMode): boolean {
  if (!release.runnerModes || release.runnerModes.length === 0) {
    return true
  }
  return !!runnerMode && release.runnerModes.includes(runnerMode)
}

export function normalizeConnectorReleaseCatalog(value: unknown): ConnectorReleaseRecord[] {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(asRecord(value)?.releases)
      ? (asRecord(value)?.releases as unknown[])
      : []
  const releases = rows
    .map((entry) => normalizeReleaseRecord(entry))
    .filter((entry): entry is ConnectorReleaseRecord => !!entry)
    .filter((entry) => isWithinHubCompatibilityCeiling(entry.version))

  releases.sort((left, right) => compareConnectorVersions(right.version, left.version))
  return releases
}

export function readHubCompatibilityRelease(): ConnectorCompatibilityRelease | null {
  return HUB_COMPATIBILITY_VERSION
    ? {
        version: HUB_COMPATIBILITY_VERSION,
        packageSpec: createVersionPinnedConnectorPackageSpec(HUB_COMPATIBILITY_VERSION),
        releaseNotesUrl: `https://github.com/TwoTwo-me/CodexHub/releases/tag/v${HUB_COMPATIBILITY_VERSION}`,
      }
    : null
}

export function readConnectorReleaseCatalog(): ConnectorReleaseRecord[] {
  return normalizeConnectorReleaseCatalog(readStateEntry(RELEASE_SCOPE, RELEASE_ENTRY_KEY) ?? [])
}

export function writeConnectorReleaseCatalog(releases: ConnectorReleaseRecord[]): void {
  writeStateEntry(RELEASE_SCOPE, RELEASE_ENTRY_KEY, { releases })
}

export function resolveLatestCompatibleConnectorRelease(input: {
  runnerMode?: ConnectorRunnerMode
  platform?: string
}): ConnectorReleaseRecord | null {
  for (const release of readConnectorReleaseCatalog()) {
    if (!releaseMatchesRunnerMode(release, input.runnerMode)) continue
    if (!releaseMatchesPlatform(release, input.platform)) continue
    return release
  }
  return null
}

export function deriveConnectorUpdateStatus(input: {
  currentVersion?: string
  updateCapable?: boolean
  compatibilityRelease: ConnectorCompatibilityRelease | null
  latestRelease: ConnectorReleaseRecord | null
}): ConnectorUpdateStatus {
  if (!input.updateCapable) return 'unsupported'
  if (!input.compatibilityRelease) return 'unknown'
  if (!input.currentVersion) {
    return input.latestRelease ? 'update_available' : 'unknown'
  }
  const compatibilityComparison = compareConnectorVersions(input.currentVersion, input.compatibilityRelease.version)
  if (compatibilityComparison > 0) {
    return input.latestRelease ? 'update_available' : 'unsupported'
  }
  if (compatibilityComparison === 0) {
    return 'up_to_date'
  }
  return input.latestRelease
    ? 'update_available'
    : 'unknown'
}

function normalizeJobStatus(value: unknown): ConnectorUpdateJobStatus | undefined {
  const status = readString(value)
  return status === 'queued'
    || status === 'downloading'
    || status === 'verifying'
    || status === 'applying'
    || status === 'restarting'
    || status === 'healthy'
    || status === 'failed'
    ? status
    : undefined
}

function normalizeJobAction(value: unknown): ConnectorUpdateJobAction | undefined {
  const action = readString(value)
  return action === 'restart' || action === 'update' ? action : undefined
}

function normalizeConnectorUpdateJobRecord(value: unknown): ConnectorUpdateJobRecord | null {
  const record = asRecord(value)
  if (!record) return null
  const id = readString(record.id)
  const connectorId = readString(record.connectorId)
  const serverId = readString(record.serverId)
  const action = normalizeJobAction(record.action)
  const status = normalizeJobStatus(record.status)
  const requestedAtIso = readString(record.requestedAtIso)
  if (!id || !connectorId || !serverId || !action || !status || !requestedAtIso) {
    return null
  }
  const artifact = normalizeReleaseRecord(record.artifact)
  return {
    id,
    connectorId,
    serverId,
    action,
    status,
    requestedAtIso,
    ...(readString(record.startedAtIso) ? { startedAtIso: readString(record.startedAtIso) } : {}),
    ...(readString(record.completedAtIso) ? { completedAtIso: readString(record.completedAtIso) } : {}),
    ...(readString(record.targetVersion) ? { targetVersion: readString(record.targetVersion) } : {}),
    ...(readString(record.connectorVersion) ? { connectorVersion: readString(record.connectorVersion) } : {}),
    ...(normalizeRunnerMode(record.runnerMode) ? { runnerMode: normalizeRunnerMode(record.runnerMode) } : {}),
    ...(readString(record.errorMessage) ? { errorMessage: readString(record.errorMessage) } : {}),
    ...(artifact ? { artifact } : {}),
  }
}

function getUpdateJobsScope(userId: string): string {
  return `${UPDATE_JOBS_SCOPE_PREFIX}${userId}`
}

export function readConnectorUpdateJobs(userId: string): ConnectorUpdateJobRecord[] {
  if (!userId) return []
  const raw = readStateEntry(getUpdateJobsScope(userId), 'jobs')
  const rows = Array.isArray(raw) ? raw : Array.isArray(asRecord(raw)?.jobs) ? (asRecord(raw)?.jobs as unknown[]) : []
  return rows
    .map((entry) => normalizeConnectorUpdateJobRecord(entry))
    .filter((entry): entry is ConnectorUpdateJobRecord => !!entry)
    .sort((left, right) => right.requestedAtIso.localeCompare(left.requestedAtIso))
}

export function writeConnectorUpdateJobs(userId: string, jobs: ConnectorUpdateJobRecord[]): void {
  writeStateEntry(getUpdateJobsScope(userId), 'jobs', { jobs })
}

export function createConnectorUpdateJob(input: {
  connectorId: string
  serverId: string
  action: ConnectorUpdateJobAction
  targetVersion?: string
  connectorVersion?: string
  runnerMode?: ConnectorRunnerMode
  artifact?: ConnectorReleaseRecord
}): ConnectorUpdateJobRecord {
  const nowIso = new Date().toISOString()
  return {
    id: `job-${randomBytes(6).toString('hex')}`,
    connectorId: input.connectorId,
    serverId: input.serverId,
    action: input.action,
    status: 'queued',
    requestedAtIso: nowIso,
    ...(input.targetVersion ? { targetVersion: input.targetVersion } : {}),
    ...(input.connectorVersion ? { connectorVersion: input.connectorVersion } : {}),
    ...(input.runnerMode ? { runnerMode: input.runnerMode } : {}),
    ...(input.artifact ? { artifact: input.artifact } : {}),
  }
}

export function hasActiveConnectorUpdateJob(jobs: ConnectorUpdateJobRecord[], connectorId: string): boolean {
  return jobs.some((job) => job.connectorId === connectorId && job.status !== 'healthy' && job.status !== 'failed')
}

export function toPublicConnectorUpdateJob(job: ConnectorUpdateJobRecord): ConnectorUpdateJobRecord {
  return { ...job }
}
