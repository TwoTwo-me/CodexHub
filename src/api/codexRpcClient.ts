import type { RpcEnvelope, RpcMethodCatalog } from '../types/codex'
import { CodexApiError, extractErrorMessage } from './codexErrors'

type RpcRequestBody = {
  method: string
  params?: unknown
  serverId?: string
}

type ScopedRequestOptions = {
  serverId?: string
}

export type RpcNotification = {
  method: string
  params: unknown
  atIso: string
  serverId: string
}

type ServerRequestReplyBody = {
  id: number
  result?: unknown
  error?: {
    code?: number
    message: string
  }
}

function normalizeServerId(serverId?: string): string {
  return typeof serverId === 'string' ? serverId.trim() : ''
}

function withServerScope(path: string, serverId?: string): string {
  const normalized = normalizeServerId(serverId)
  if (!normalized) return path

  const url = new URL(path, 'http://localhost')
  url.searchParams.set('serverId', normalized)
  return `${url.pathname}${url.search}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export async function rpcCall<T>(method: string, params?: unknown, options: ScopedRequestOptions = {}): Promise<T> {
  const scopedServerId = normalizeServerId(options.serverId)
  const body: RpcRequestBody = {
    method,
    params: params ?? null,
    ...(scopedServerId ? { serverId: scopedServerId } : {}),
  }

  let response: Response
  try {
    response = await fetch(withServerScope('/codex-api/rpc', scopedServerId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
  const response = await fetch(withServerScope('/codex-api/meta/methods', scopedServerId))

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
  const response = await fetch(withServerScope('/codex-api/meta/notifications', scopedServerId))

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

function toNotification(value: unknown, fallbackServerId = ''): RpcNotification | null {
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
  const source = new EventSource(withServerScope('/codex-api/events', scopedServerId))

  source.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as unknown
      const notification = toNotification(parsed, scopedServerId)
      if (notification) {
        onNotification(notification)
      }
    } catch {
      // Ignore malformed event payloads and keep stream alive.
    }
  }

  return () => {
    source.close()
  }
}

export async function respondServerRequest(body: ServerRequestReplyBody, options: ScopedRequestOptions = {}): Promise<void> {
  const scopedServerId = normalizeServerId(options.serverId)
  const requestBody = scopedServerId ? { ...body, serverId: scopedServerId } : body

  let response: Response
  try {
    response = await fetch(withServerScope('/codex-api/server-requests/respond', scopedServerId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
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
  const response = await fetch(withServerScope('/codex-api/server-requests/pending', scopedServerId))

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
