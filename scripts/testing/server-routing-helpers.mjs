export const SERVER_ID_HEADER = 'x-codex-server-id'
export const CHANNEL_ID_HEADER = 'x-codex-channel-id'
export const DEFAULT_CHANNEL_ID = 'hub'

function normalizeServerId(serverId) {
  if (typeof serverId !== 'string') {
    return ''
  }

  return serverId.trim()
}

function normalizeChannelId(channelId) {
  if (typeof channelId !== 'string') {
    return DEFAULT_CHANNEL_ID
  }

  const normalized = channelId.trim()
  if (!normalized) {
    return DEFAULT_CHANNEL_ID
  }

  if (normalized === DEFAULT_CHANNEL_ID) {
    return DEFAULT_CHANNEL_ID
  }

  if (/^agent:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(normalized)) {
    return normalized
  }

  return DEFAULT_CHANNEL_ID
}

function toHeaderRecord(headers) {
  if (!headers) {
    return {}
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }

  return { ...headers }
}

export function buildServerRoutingHeaders(serverId, channelId, headers) {
  const nextHeaders = toHeaderRecord(headers)
  const normalizedServerId = normalizeServerId(serverId)
  const normalizedChannelId = normalizeChannelId(channelId)

  if (!normalizedServerId) {
    delete nextHeaders[SERVER_ID_HEADER]
  } else {
    nextHeaders[SERVER_ID_HEADER] = normalizedServerId
  }

  if (normalizedChannelId === DEFAULT_CHANNEL_ID) {
    delete nextHeaders[CHANNEL_ID_HEADER]
    return nextHeaders
  }

  nextHeaders[CHANNEL_ID_HEADER] = normalizedChannelId
  return nextHeaders
}

export function buildServerScopedRequestInit(init = {}) {
  const { serverId, channelId, headers, ...rest } = init

  return {
    ...rest,
    headers: buildServerRoutingHeaders(serverId, channelId, headers),
  }
}

export function buildServerScopedEventUrl(pathOrUrl, serverId, channelId) {
  const normalizedServerId = normalizeServerId(serverId)
  const normalizedChannelId = normalizeChannelId(channelId)
  if (!normalizedServerId && normalizedChannelId === DEFAULT_CHANNEL_ID) {
    return pathOrUrl
  }

  const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//u.test(pathOrUrl)
  const parsed = new URL(pathOrUrl, 'http://codexui.local')

  if (normalizedServerId) {
    parsed.searchParams.set('serverId', normalizedServerId)
  }
  if (normalizedChannelId !== DEFAULT_CHANNEL_ID) {
    parsed.searchParams.set('channelId', normalizedChannelId)
  }

  if (isAbsoluteUrl) {
    return parsed.toString()
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
