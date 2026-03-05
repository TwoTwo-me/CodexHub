export const RELAY_PROTOCOL = 'codexui.relay.v1' as const
export const RELAY_PROTOCOL_VERSION = 1 as const

export const RELAY_SERVER_ID_HEADER = 'x-codex-server-id' as const
export const RELAY_CHANNEL_ID_HEADER = 'x-codex-channel-id' as const

export const RELAY_HUB_CHANNEL = 'hub' as const
export type RelayChannelId = typeof RELAY_HUB_CHANNEL | `agent:${string}`

export type RelayRoute = {
  scopeKey: string
  serverId: string
  channelId: RelayChannelId
}

export type RelayError = {
  code: number
  message: string
}

export type RelayRequestEnvelope = {
  protocol: typeof RELAY_PROTOCOL
  version: typeof RELAY_PROTOCOL_VERSION
  kind: 'request'
  relayId: string
  route: RelayRoute
  method: string
  params: unknown
  sentAtIso: string
}

export type RelayResponseEnvelope = {
  protocol: typeof RELAY_PROTOCOL
  version: typeof RELAY_PROTOCOL_VERSION
  kind: 'response'
  relayId: string
  route: RelayRoute
  result?: unknown
  error?: RelayError
  sentAtIso: string
}

export type RelayEventEnvelope = {
  protocol: typeof RELAY_PROTOCOL
  version: typeof RELAY_PROTOCOL_VERSION
  kind: 'event'
  event: string
  route: RelayRoute
  params: unknown
  sentAtIso: string
}

export type RelayEnvelope =
  | RelayRequestEnvelope
  | RelayResponseEnvelope
  | RelayEventEnvelope

export function isRelayChannelId(value: string): value is RelayChannelId {
  if (value === RELAY_HUB_CHANNEL) return true
  return /^agent:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value)
}

export function normalizeRelayChannelId(value: unknown): RelayChannelId {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (isRelayChannelId(raw)) return raw
  return RELAY_HUB_CHANNEL
}
