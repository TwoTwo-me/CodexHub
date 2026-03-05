import type { RpcEnvelope, RpcMethodCatalog } from '../types/codex'
import {
  RELAY_CHANNEL_ID_HEADER,
  RELAY_HUB_CHANNEL,
  RELAY_SERVER_ID_HEADER,
  normalizeRelayChannelId,
} from '../types/relayProtocol'
import { RELAY_E2EE_RPC_METHOD, normalizeRelayE2eeEnvelope, type RelayE2eeEnvelope } from '../types/relayE2ee'
import { decryptRelayE2eePayload, encryptRelayE2eePayload } from '../utils/relayE2eeCrypto'
import { CodexApiError, extractErrorMessage } from './codexErrors'

type RpcRequestBody = {
  method?: string
  params?: unknown
  e2ee?: RelayE2eeEnvelope
}

type ScopedRelayE2eeConfig = {
  keyId: string
  passphrase: string
}

type ScopedRequestOptions = {
  serverId?: string
  channelId?: string
  relayE2ee?: ScopedRelayE2eeConfig
}

export type RpcNotification = {
  method: string
  params: unknown
  atIso: string
  serverId: string
  channelId: string
}

type ServerRequestReplyBody = {
  id: number
  result?: unknown
  error?: {
    code?: number
    message: string
  }
}

const MAX_NOTIFICATION_QUEUE_DEPTH = 200

function normalizeServerId(serverId?: string): string {
  return typeof serverId === 'string' ? serverId.trim() : ''
}

function normalizeChannelId(channelId?: string): string {
  if (typeof channelId !== 'string') return RELAY_HUB_CHANNEL
  return normalizeRelayChannelId(channelId)
}

function buildServerScopedEventUrl(path: string, serverId?: string, channelId?: string): string {
  const normalized = normalizeServerId(serverId)
  const normalizedChannelId = normalizeChannelId(channelId)
  if (!normalized && normalizedChannelId === RELAY_HUB_CHANNEL) return path

  const url = new URL(path, 'http://localhost')
  if (normalized) {
    url.searchParams.set('serverId', normalized)
  }
  if (normalizedChannelId !== RELAY_HUB_CHANNEL) {
    url.searchParams.set('channelId', normalizedChannelId)
  }
  return `${url.pathname}${url.search}`
}

function buildServerRoutingHeaders(
  serverId: string,
  channelId: string,
  headers: Record<string, string> = {},
): Record<string, string> {
  const nextHeaders: Record<string, string> = { ...headers }
  if (serverId.length > 0) {
    nextHeaders[RELAY_SERVER_ID_HEADER] = serverId
  }
  if (channelId !== RELAY_HUB_CHANNEL) {
    nextHeaders[RELAY_CHANNEL_ID_HEADER] = channelId
  }
  return nextHeaders
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeRelayE2eeConfig(config: ScopedRelayE2eeConfig | undefined): ScopedRelayE2eeConfig | undefined {
  if (!config) return undefined
  const keyId = typeof config.keyId === 'string' ? config.keyId.trim() : ''
  const passphrase = typeof config.passphrase === 'string' ? config.passphrase : ''
  if (!keyId || !passphrase) return undefined
  return { keyId, passphrase }
}

export async function rpcCall<T>(method: string, params?: unknown, options: ScopedRequestOptions = {}): Promise<T> {
  const scopedServerId = normalizeServerId(options.serverId)
  const scopedChannelId = normalizeChannelId(options.channelId)
  const relayE2ee = normalizeRelayE2eeConfig(options.relayE2ee)
  let body: RpcRequestBody
  if (relayE2ee) {
    body = {
      e2ee: await encryptRelayE2eePayload(
        {
          method,
          params: params ?? null,
        },
        relayE2ee,
      ),
    }
  } else {
    body = {
      method,
      params: params ?? null,
    }
  }

  let response: Response
  try {
    response = await fetch('/codex-api/rpc', {
      method: 'POST',
      headers: buildServerRoutingHeaders(scopedServerId, scopedChannelId, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : `RPC ${method} failed before request was sent`,
      { code: 'network_error', method },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `RPC ${method} failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method,
        status: response.status,
      },
    )
  }

  if (relayE2ee) {
    const envelopeRecord = asRecord(payload)
    const encryptedResult = normalizeRelayE2eeEnvelope(asRecord(envelopeRecord?.result)?.e2ee)
    if (!encryptedResult) {
      throw new CodexApiError(`RPC ${method} returned malformed encrypted envelope`, {
        code: 'invalid_response',
        method,
        status: response.status,
      })
    }

    const decryptedPayload = await decryptRelayE2eePayload(encryptedResult, relayE2ee)
    const decryptedRecord = asRecord(decryptedPayload)
    const decryptedError = asRecord(decryptedRecord?.error)
    if (decryptedError) {
      const message = typeof decryptedError.message === 'string' && decryptedError.message.trim().length > 0
        ? decryptedError.message
        : `RPC ${method} failed in encrypted relay response`
      throw new CodexApiError(message, {
        code: 'rpc_error',
        method,
        status: response.status,
      })
    }
    return (decryptedRecord?.result as T) ?? (null as T)
  }

  const envelope = payload as RpcEnvelope<T> | null
  if (!envelope || typeof envelope !== 'object' || !('result' in envelope)) {
    throw new CodexApiError(`RPC ${method} returned malformed envelope`, {
      code: 'invalid_response',
      method,
      status: response.status,
    })
  }
  return envelope.result
}

export async function fetchRpcMethodCatalog(options: ScopedRequestOptions = {}): Promise<string[]> {
  const scopedServerId = normalizeServerId(options.serverId)
  const scopedChannelId = normalizeChannelId(options.channelId)
  const response = await fetch('/codex-api/meta/methods', {
    headers: buildServerRoutingHeaders(scopedServerId, scopedChannelId),
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Method catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/methods',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

export async function fetchRpcNotificationCatalog(options: ScopedRequestOptions = {}): Promise<string[]> {
  const scopedServerId = normalizeServerId(options.serverId)
  const scopedChannelId = normalizeChannelId(options.channelId)
  const response = await fetch('/codex-api/meta/notifications', {
    headers: buildServerRoutingHeaders(scopedServerId, scopedChannelId),
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Notification catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/notifications',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

function toNotification(value: unknown, fallbackServerId = '', fallbackChannelId: string = RELAY_HUB_CHANNEL): RpcNotification | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.method !== 'string' || record.method.length === 0) return null

  const atIso = typeof record.atIso === 'string' && record.atIso.length > 0
    ? record.atIso
    : new Date().toISOString()

  return {
    method: record.method,
    params: record.params ?? null,
    atIso,
    serverId:
      (typeof record.serverId === 'string' && record.serverId.length > 0
        ? record.serverId
        : typeof record.server_id === 'string' && record.server_id.length > 0
          ? record.server_id
          : fallbackServerId) || '',
    channelId:
      (typeof record.channelId === 'string' && record.channelId.length > 0
        ? record.channelId
        : typeof record.channel_id === 'string' && record.channel_id.length > 0
          ? record.channel_id
          : fallbackChannelId) || RELAY_HUB_CHANNEL,
  }
}

export function subscribeRpcNotifications(
  onNotification: (value: RpcNotification) => void,
  options: ScopedRequestOptions = {},
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {}
  }

  const scopedServerId = normalizeServerId(options.serverId)
  const scopedChannelId = normalizeChannelId(options.channelId)
  const relayE2ee = normalizeRelayE2eeConfig(options.relayE2ee)
  const source = new EventSource(buildServerScopedEventUrl('/codex-api/events', scopedServerId, scopedChannelId))
  let notificationQueue = Promise.resolve()
  let queuedNotificationCount = 0

  source.onmessage = (event) => {
    if (queuedNotificationCount >= MAX_NOTIFICATION_QUEUE_DEPTH) {
      return
    }
    queuedNotificationCount += 1
    notificationQueue = notificationQueue
      .then(async () => {
        const parsed = JSON.parse(event.data) as unknown
        const notification = toNotification(parsed, scopedServerId, scopedChannelId)
        if (!notification) return

        if (relayE2ee && notification.method === RELAY_E2EE_RPC_METHOD) {
          const encryptedEnvelope = normalizeRelayE2eeEnvelope(asRecord(notification.params)?.e2ee)
          if (!encryptedEnvelope) return

          const decrypted = await decryptRelayE2eePayload(encryptedEnvelope, relayE2ee)
          const decryptedRecord = asRecord(decrypted)
          const decryptedMethod = typeof decryptedRecord?.method === 'string' ? decryptedRecord.method.trim() : ''
          if (!decryptedMethod) return

          onNotification({
            ...notification,
            method: decryptedMethod,
            params: decryptedRecord?.params ?? null,
          })
          return
        }

        onNotification(notification)
      })
      .catch(() => {
        // Ignore malformed event payloads and keep stream alive.
      })
      .finally(() => {
        queuedNotificationCount = Math.max(0, queuedNotificationCount - 1)
      })
  }

  return () => {
    source.close()
  }
}

export async function respondServerRequest(body: ServerRequestReplyBody, options: ScopedRequestOptions = {}): Promise<void> {
  const scopedServerId = normalizeServerId(options.serverId)
  const scopedChannelId = normalizeChannelId(options.channelId)

  let response: Response
  try {
    response = await fetch('/codex-api/server-requests/respond', {
      method: 'POST',
      headers: buildServerRoutingHeaders(scopedServerId, scopedChannelId, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Failed to reply to server request',
      { code: 'network_error', method: 'server-requests/respond' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Server request reply failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'server-requests/respond',
        status: response.status,
      },
    )
  }
}

export async function fetchPendingServerRequests(options: ScopedRequestOptions = {}): Promise<unknown[]> {
  const scopedServerId = normalizeServerId(options.serverId)
  const scopedChannelId = normalizeChannelId(options.channelId)
  const response = await fetch('/codex-api/server-requests/pending', {
    headers: buildServerRoutingHeaders(scopedServerId, scopedChannelId),
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Pending server requests failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'server-requests/pending',
        status: response.status,
      },
    )
  }

  const record = asRecord(payload)
  const data = record?.data
  return Array.isArray(data) ? data : []
}

export async function fetchCodexServers(): Promise<unknown> {
  const response = await fetch('/codex-api/servers')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Server list failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'servers',
        status: response.status,
      },
    )
  }

  const record = asRecord(payload)
  return record?.data ?? payload
}
