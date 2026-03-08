import { createHash, randomUUID } from 'node:crypto'
import { getHubDatabase } from './sqliteStore.js'

export type StoredPushSubscription = {
  id: string
  userId: string
  endpoint: string
  subscription: Record<string, unknown>
  deviceAlias?: string
  createdAtIso: string
  updatedAtIso: string
  lastSuccessAtIso?: string
  lastFailureAtIso?: string
  failureCount: number
  userAgent?: string
  platform?: string
}

export type PushSubscriptionInput = {
  endpoint: string
  subscription: Record<string, unknown>
  deviceAlias?: string
  userAgent?: string
  platform?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStoredRow(row: Record<string, unknown>): StoredPushSubscription | null {
  const subscriptionJson = readString(row.subscription_json)
  if (!subscriptionJson) return null

  let subscription: Record<string, unknown> | null = null
  try {
    subscription = asRecord(JSON.parse(subscriptionJson))
  } catch {
    subscription = null
  }
  if (!subscription) return null

  const id = readString(row.id)
  const userId = readString(row.user_id)
  const endpoint = readString(row.endpoint)
  const createdAtIso = readString(row.created_at_iso)
  const updatedAtIso = readString(row.updated_at_iso)
  if (!id || !userId || !endpoint || !createdAtIso || !updatedAtIso) {
    return null
  }

  const failureCountRaw = typeof row.failure_count === 'number' ? row.failure_count : Number(row.failure_count ?? 0)

  return {
    id,
    userId,
    endpoint,
    subscription,
    ...(readString(row.device_alias) ? { deviceAlias: readString(row.device_alias) } : {}),
    createdAtIso,
    updatedAtIso,
    ...(readString(row.last_success_at_iso) ? { lastSuccessAtIso: readString(row.last_success_at_iso) } : {}),
    ...(readString(row.last_failure_at_iso) ? { lastFailureAtIso: readString(row.last_failure_at_iso) } : {}),
    failureCount: Number.isFinite(failureCountRaw) ? Math.max(0, Math.trunc(failureCountRaw)) : 0,
    ...(readString(row.user_agent) ? { userAgent: readString(row.user_agent) } : {}),
    ...(readString(row.platform) ? { platform: readString(row.platform) } : {}),
  }
}

function normalizeSubscriptionPayload(value: unknown): Record<string, unknown> {
  const record = asRecord(value)
  if (!record) {
    throw new Error('Expected a push subscription object.')
  }
  const endpoint = readString(record.endpoint)
  const keys = asRecord(record.keys)
  const p256dh = readString(keys?.p256dh)
  const auth = readString(keys?.auth)
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Push subscription must include endpoint, p256dh, and auth keys.')
  }

  const normalized: Record<string, unknown> = {
    endpoint,
    keys: {
      p256dh,
      auth,
    },
  }
  if (record.expirationTime === null || typeof record.expirationTime === 'number') {
    normalized.expirationTime = record.expirationTime
  }
  return normalized
}

export function listPushSubscriptionsForUser(userId: string): StoredPushSubscription[] {
  const normalizedUserId = userId.trim()
  if (!normalizedUserId) return []
  const rows = getHubDatabase()
    .prepare(`
      SELECT
        id,
        user_id,
        endpoint,
        subscription_json,
        device_alias,
        user_agent,
        platform,
        created_at_iso,
        updated_at_iso,
        last_success_at_iso,
        last_failure_at_iso,
        failure_count
      FROM push_subscriptions
      WHERE user_id = ?
      ORDER BY updated_at_iso DESC
    `)
    .all(normalizedUserId) as Array<Record<string, unknown>>
  return rows.map(normalizeStoredRow).filter((row): row is StoredPushSubscription => row !== null)
}

export function upsertPushSubscriptionForUser(userId: string, input: PushSubscriptionInput): StoredPushSubscription {
  const normalizedUserId = userId.trim()
  if (!normalizedUserId) {
    throw new Error('User id is required.')
  }

  const endpoint = input.endpoint.trim()
  if (!endpoint) {
    throw new Error('Subscription endpoint is required.')
  }

  const subscription = normalizeSubscriptionPayload(input.subscription)
  const normalizedDeviceAlias = readString(input.deviceAlias) || null
  const nowIso = new Date().toISOString()
  const existing = getHubDatabase()
    .prepare('SELECT id, created_at_iso FROM push_subscriptions WHERE endpoint = ? LIMIT 1')
    .get(endpoint) as { id?: string; created_at_iso?: string } | undefined

  const id = readString(existing?.id) || `push-${createHash('sha256').update(endpoint).digest('hex').slice(0, 20)}-${randomUUID().slice(0, 8)}`
  const createdAtIso = readString(existing?.created_at_iso) || nowIso

  getHubDatabase().prepare(`
    INSERT INTO push_subscriptions (
      id,
      user_id,
      endpoint,
      subscription_json,
      device_alias,
      user_agent,
      platform,
      created_at_iso,
      updated_at_iso,
      last_success_at_iso,
      last_failure_at_iso,
      failure_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      subscription_json = excluded.subscription_json,
      device_alias = COALESCE(excluded.device_alias, push_subscriptions.device_alias),
      user_agent = excluded.user_agent,
      platform = excluded.platform,
      updated_at_iso = excluded.updated_at_iso
  `).run(
    id,
    normalizedUserId,
    endpoint,
    JSON.stringify(subscription),
    normalizedDeviceAlias,
    input.userAgent?.trim() || null,
    input.platform?.trim() || null,
    createdAtIso,
    nowIso,
  )

  const stored = getHubDatabase()
    .prepare(`
      SELECT
        id,
        user_id,
        endpoint,
        subscription_json,
        device_alias,
        user_agent,
        platform,
        created_at_iso,
        updated_at_iso,
        last_success_at_iso,
        last_failure_at_iso,
        failure_count
      FROM push_subscriptions
      WHERE endpoint = ?
      LIMIT 1
    `)
    .get(endpoint) as Record<string, unknown> | undefined

  const normalized = stored ? normalizeStoredRow(stored) : null
  if (!normalized) {
    throw new Error('Failed to persist push subscription.')
  }
  return normalized
}

export function deletePushSubscriptionForUser(userId: string, endpoint: string): void {
  const normalizedUserId = userId.trim()
  const normalizedEndpoint = endpoint.trim()
  if (!normalizedUserId || !normalizedEndpoint) return
  getHubDatabase()
    .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(normalizedUserId, normalizedEndpoint)
}

export function getPushSubscriptionForUserById(userId: string, id: string): StoredPushSubscription | null {
  const normalizedUserId = userId.trim()
  const normalizedId = id.trim()
  if (!normalizedUserId || !normalizedId) return null

  const row = getHubDatabase()
    .prepare(`
      SELECT
        id,
        user_id,
        endpoint,
        subscription_json,
        device_alias,
        user_agent,
        platform,
        created_at_iso,
        updated_at_iso,
        last_success_at_iso,
        last_failure_at_iso,
        failure_count
      FROM push_subscriptions
      WHERE user_id = ? AND id = ?
      LIMIT 1
    `)
    .get(normalizedUserId, normalizedId) as Record<string, unknown> | undefined

  return row ? normalizeStoredRow(row) : null
}

export function updatePushSubscriptionAliasForUser(userId: string, id: string, deviceAlias: string): StoredPushSubscription | null {
  const normalizedUserId = userId.trim()
  const normalizedId = id.trim()
  if (!normalizedUserId || !normalizedId) return null

  const nowIso = new Date().toISOString()
  getHubDatabase().prepare(`
    UPDATE push_subscriptions
    SET
      device_alias = ?,
      updated_at_iso = ?
    WHERE user_id = ? AND id = ?
  `).run(readString(deviceAlias) || null, nowIso, normalizedUserId, normalizedId)

  return getPushSubscriptionForUserById(normalizedUserId, normalizedId)
}

export function deletePushSubscriptionForUserById(userId: string, id: string): boolean {
  const normalizedUserId = userId.trim()
  const normalizedId = id.trim()
  if (!normalizedUserId || !normalizedId) return false
  const result = getHubDatabase()
    .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND id = ?')
    .run(normalizedUserId, normalizedId)
  return result.changes > 0
}

export function deletePushSubscriptionByEndpoint(endpoint: string): void {
  const normalizedEndpoint = endpoint.trim()
  if (!normalizedEndpoint) return
  getHubDatabase()
    .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
    .run(normalizedEndpoint)
}

export function markPushSubscriptionSuccess(endpoint: string): void {
  const normalizedEndpoint = endpoint.trim()
  if (!normalizedEndpoint) return
  getHubDatabase().prepare(`
    UPDATE push_subscriptions
    SET
      last_success_at_iso = ?,
      updated_at_iso = ?,
      failure_count = 0
    WHERE endpoint = ?
  `).run(new Date().toISOString(), new Date().toISOString(), normalizedEndpoint)
}

export function markPushSubscriptionFailure(endpoint: string): void {
  const normalizedEndpoint = endpoint.trim()
  if (!normalizedEndpoint) return
  getHubDatabase().prepare(`
    UPDATE push_subscriptions
    SET
      last_failure_at_iso = ?,
      updated_at_iso = ?,
      failure_count = failure_count + 1
    WHERE endpoint = ?
  `).run(new Date().toISOString(), new Date().toISOString(), normalizedEndpoint)
}
