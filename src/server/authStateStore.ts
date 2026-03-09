import { createHash, randomBytes } from 'node:crypto'
import { getHubDatabase } from './sqliteStore.js'

export type AuthSessionRecord = {
  userId: string
  createdAtIso: string
  expiresAtIso: string
  revokedAtIso?: string
  lastSeenAtIso?: string
}

export type RateLimitPolicy = {
  maxAttempts: number
  windowMs: number
  blockMs: number
}

export type RateLimitDecision = {
  limited: boolean
  retryAfterSeconds: number
}

export type AuthRecoveryAuditEventInput = {
  actorUserId?: string
  actorUsername?: string
  actorType: 'admin_api' | 'local_cli'
  targetUserId?: string
  targetUsername: string
  eventType: 'admin_password_reset' | 'last_admin_cli_recovery'
  reason: string
  metadata?: Record<string, unknown>
}

export type AuthRecoveryAuditEventRecord = AuthRecoveryAuditEventInput & {
  id: string
  createdAtIso: string
}

export type AuthStateStore = {
  createSession(userId: string, input?: { expiresAtMs?: number }): string
  resolveSession(token: string, input?: { nowMs?: number }): AuthSessionRecord | null
  revokeSession(token: string, input?: { revokedAtIso?: string }): boolean
  revokeSessionsForUser(userId: string, input?: { revokedAtIso?: string }): number
  evaluateRateLimit(scope: string, key: string, policy: RateLimitPolicy, nowMs?: number): RateLimitDecision
  incrementRateLimitAttempt(scope: string, key: string, policy: Pick<RateLimitPolicy, 'windowMs'>, nowMs?: number): void
  clearRateLimit(scope: string, key: string): void
  recordRecoveryAuditEvent(input: AuthRecoveryAuditEventInput): AuthRecoveryAuditEventRecord
}

function toIsoFromMs(value: number): string {
  return new Date(value).toISOString()
}

function parseIsoToMs(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function normalizeRecoveryText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function pruneRateLimitScope(scope: string, staleBeforeMs: number): void {
  getHubDatabase().prepare(`
    DELETE FROM auth_rate_limits
    WHERE scope = ?
      AND blocked_until_ms <= ?
      AND window_started_at_ms < ?
  `).run(scope, staleBeforeMs, staleBeforeMs)
}

export function createSqliteAuthStateStore(): AuthStateStore {
  return {
    createSession(userId, input = {}) {
      const nowMs = Date.now()
      const expiresAtMs = input.expiresAtMs ?? nowMs
      const token = randomBytes(32).toString('hex')
      const tokenHash = hashSessionToken(token)
      const createdAtIso = toIsoFromMs(nowMs)
      const expiresAtIso = toIsoFromMs(expiresAtMs)

      getHubDatabase().prepare(`
        INSERT INTO auth_sessions (
          token_hash,
          user_id,
          created_at_iso,
          expires_at_iso,
          revoked_at_iso,
          last_seen_at_iso
        ) VALUES (?, ?, ?, ?, NULL, ?)
      `).run(tokenHash, userId, createdAtIso, expiresAtIso, createdAtIso)

      return token
    },

    resolveSession(token, input = {}) {
      const normalizedToken = token.trim()
      if (!normalizedToken) return null

      const nowMs = input.nowMs ?? Date.now()
      const nowIso = toIsoFromMs(nowMs)
      const row = getHubDatabase().prepare(`
        SELECT user_id, created_at_iso, expires_at_iso, revoked_at_iso, last_seen_at_iso
        FROM auth_sessions
        WHERE token_hash = ?
      `).get(hashSessionToken(normalizedToken)) as {
        user_id?: string
        created_at_iso?: string
        expires_at_iso?: string
        revoked_at_iso?: string | null
        last_seen_at_iso?: string | null
      } | undefined

      if (!row || typeof row.user_id !== 'string' || typeof row.created_at_iso !== 'string' || typeof row.expires_at_iso !== 'string') {
        return null
      }

      if (typeof row.revoked_at_iso === 'string' && row.revoked_at_iso.trim().length > 0) {
        return null
      }

      if (parseIsoToMs(row.expires_at_iso) <= nowMs) {
        getHubDatabase().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashSessionToken(normalizedToken))
        return null
      }

      getHubDatabase().prepare(`
        UPDATE auth_sessions
        SET last_seen_at_iso = ?
        WHERE token_hash = ?
      `).run(nowIso, hashSessionToken(normalizedToken))

      return {
        userId: row.user_id,
        createdAtIso: row.created_at_iso,
        expiresAtIso: row.expires_at_iso,
        ...(typeof row.last_seen_at_iso === 'string' && row.last_seen_at_iso.trim().length > 0 ? { lastSeenAtIso: row.last_seen_at_iso } : {}),
      }
    },

    revokeSession(token, input = {}) {
      const normalizedToken = token.trim()
      if (!normalizedToken) return false
      const revokedAtIso = input.revokedAtIso?.trim() || new Date().toISOString()
      const result = getHubDatabase().prepare(`
        UPDATE auth_sessions
        SET revoked_at_iso = COALESCE(revoked_at_iso, ?)
        WHERE token_hash = ?
      `).run(revokedAtIso, hashSessionToken(normalizedToken))
      return result.changes > 0
    },

    revokeSessionsForUser(userId, input = {}) {
      const normalizedUserId = userId.trim()
      if (!normalizedUserId) return 0
      const revokedAtIso = input.revokedAtIso?.trim() || new Date().toISOString()
      const result = getHubDatabase().prepare(`
        UPDATE auth_sessions
        SET revoked_at_iso = COALESCE(revoked_at_iso, ?)
        WHERE user_id = ?
          AND (revoked_at_iso IS NULL OR revoked_at_iso = '')
      `).run(revokedAtIso, normalizedUserId)
      return result.changes
    },

    evaluateRateLimit(scope, key, policy, nowMs = Date.now()) {
      const normalizedScope = scope.trim()
      const normalizedKey = key.trim()
      if (!normalizedScope || !normalizedKey) {
        return { limited: false, retryAfterSeconds: 0 }
      }

      const staleBeforeMs = nowMs - (policy.windowMs + policy.blockMs)
      pruneRateLimitScope(normalizedScope, staleBeforeMs)

      const row = getHubDatabase().prepare(`
        SELECT attempts, window_started_at_ms, blocked_until_ms
        FROM auth_rate_limits
        WHERE scope = ? AND key = ?
      `).get(normalizedScope, normalizedKey) as {
        attempts?: number
        window_started_at_ms?: number
        blocked_until_ms?: number
      } | undefined

      if (!row) {
        return { limited: false, retryAfterSeconds: 0 }
      }

      const blockedUntilMs = Number(row.blocked_until_ms ?? 0)
      if (blockedUntilMs > nowMs) {
        return {
          limited: true,
          retryAfterSeconds: Math.max(1, Math.ceil((blockedUntilMs - nowMs) / 1000)),
        }
      }

      const windowStartedAtMs = Number(row.window_started_at_ms ?? 0)
      if (nowMs - windowStartedAtMs > policy.windowMs) {
        getHubDatabase().prepare('DELETE FROM auth_rate_limits WHERE scope = ? AND key = ?').run(normalizedScope, normalizedKey)
        return { limited: false, retryAfterSeconds: 0 }
      }

      const attempts = Number(row.attempts ?? 0)
      if (attempts >= policy.maxAttempts) {
        const nextBlockedUntilMs = nowMs + policy.blockMs
        getHubDatabase().prepare(`
          UPDATE auth_rate_limits
          SET blocked_until_ms = ?, updated_at_iso = ?
          WHERE scope = ? AND key = ?
        `).run(nextBlockedUntilMs, toIsoFromMs(nowMs), normalizedScope, normalizedKey)
        return {
          limited: true,
          retryAfterSeconds: Math.max(1, Math.ceil((nextBlockedUntilMs - nowMs) / 1000)),
        }
      }

      return { limited: false, retryAfterSeconds: 0 }
    },

    incrementRateLimitAttempt(scope, key, policy, nowMs = Date.now()) {
      const normalizedScope = scope.trim()
      const normalizedKey = key.trim()
      if (!normalizedScope || !normalizedKey) {
        return
      }

      const staleBeforeMs = nowMs - policy.windowMs
      pruneRateLimitScope(normalizedScope, staleBeforeMs)

      const row = getHubDatabase().prepare(`
        SELECT attempts, window_started_at_ms
        FROM auth_rate_limits
        WHERE scope = ? AND key = ?
      `).get(normalizedScope, normalizedKey) as {
        attempts?: number
        window_started_at_ms?: number
      } | undefined

      if (!row || nowMs - Number(row.window_started_at_ms ?? 0) > policy.windowMs) {
        getHubDatabase().prepare(`
          INSERT INTO auth_rate_limits (
            scope,
            key,
            attempts,
            window_started_at_ms,
            blocked_until_ms,
            updated_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(scope, key) DO UPDATE SET
            attempts = excluded.attempts,
            window_started_at_ms = excluded.window_started_at_ms,
            blocked_until_ms = excluded.blocked_until_ms,
            updated_at_iso = excluded.updated_at_iso
        `).run(normalizedScope, normalizedKey, 1, nowMs, 0, toIsoFromMs(nowMs))
        return
      }

      getHubDatabase().prepare(`
        UPDATE auth_rate_limits
        SET attempts = ?, updated_at_iso = ?
        WHERE scope = ? AND key = ?
      `).run(Number(row.attempts ?? 0) + 1, toIsoFromMs(nowMs), normalizedScope, normalizedKey)
    },

    clearRateLimit(scope, key) {
      const normalizedScope = scope.trim()
      const normalizedKey = key.trim()
      if (!normalizedScope || !normalizedKey) return
      getHubDatabase().prepare('DELETE FROM auth_rate_limits WHERE scope = ? AND key = ?').run(normalizedScope, normalizedKey)
    },

    recordRecoveryAuditEvent(input) {
      const nowIso = new Date().toISOString()
      const id = randomBytes(16).toString('hex')
      const actorType = input.actorType
      const targetUsername = input.targetUsername.trim()
      const reason = input.reason.trim()
      const metadataJson = JSON.stringify(input.metadata ?? {})

      getHubDatabase().prepare(`
        INSERT INTO auth_recovery_audit (
          id,
          actor_user_id,
          actor_username,
          actor_type,
          target_user_id,
          target_username,
          event_type,
          reason,
          metadata_json,
          created_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        normalizeRecoveryText(input.actorUserId) ?? null,
        normalizeRecoveryText(input.actorUsername) ?? null,
        actorType,
        normalizeRecoveryText(input.targetUserId) ?? null,
        targetUsername,
        input.eventType,
        reason,
        metadataJson,
        nowIso,
      )

      return {
        id,
        ...(normalizeRecoveryText(input.actorUserId) ? { actorUserId: normalizeRecoveryText(input.actorUserId)! } : {}),
        ...(normalizeRecoveryText(input.actorUsername) ? { actorUsername: normalizeRecoveryText(input.actorUsername)! } : {}),
        actorType,
        ...(normalizeRecoveryText(input.targetUserId) ? { targetUserId: normalizeRecoveryText(input.targetUserId)! } : {}),
        targetUsername,
        eventType: input.eventType,
        reason,
        metadata: input.metadata ?? {},
        createdAtIso: nowIso,
      }
    },
  }
}
