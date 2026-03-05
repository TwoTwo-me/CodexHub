export const RELAY_E2EE_VERSION = 1 as const
export const RELAY_E2EE_ALGORITHM = 'aes-256-gcm' as const
export const RELAY_E2EE_RPC_METHOD = 'relay/e2ee' as const

export type RelayE2eeEnvelope = {
  version: typeof RELAY_E2EE_VERSION
  algorithm: typeof RELAY_E2EE_ALGORITHM
  keyId: string
  iv: string
  ciphertext: string
  createdAtIso: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeRelayE2eeEnvelope(value: unknown): RelayE2eeEnvelope | null {
  const record = asRecord(value)
  if (!record) return null

  const version = record.version
  if (version !== RELAY_E2EE_VERSION) return null

  const algorithm = readString(record.algorithm)
  if (algorithm !== RELAY_E2EE_ALGORITHM) return null

  const keyId = readString(record.keyId)
  const iv = readString(record.iv)
  const ciphertext = readString(record.ciphertext)
  const createdAtIso = readString(record.createdAtIso)
  if (!keyId || !iv || !ciphertext || !createdAtIso) return null

  return {
    version,
    algorithm,
    keyId,
    iv,
    ciphertext,
    createdAtIso,
  }
}

