export const SERVER_ID_HEADER = 'x-codex-server-id'

function normalizeServerId(serverId) {
  if (typeof serverId !== 'string') {
    return ''
  }

  return serverId.trim()
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

export function buildServerRoutingHeaders(serverId, headers) {
  const nextHeaders = toHeaderRecord(headers)
  const normalizedServerId = normalizeServerId(serverId)

  if (!normalizedServerId) {
    delete nextHeaders[SERVER_ID_HEADER]
    return nextHeaders
  }

  nextHeaders[SERVER_ID_HEADER] = normalizedServerId
  return nextHeaders
}

export function buildServerScopedRequestInit(init = {}) {
  const { serverId, headers, ...rest } = init

  return {
    ...rest,
    headers: buildServerRoutingHeaders(serverId, headers),
  }
}

export function buildServerScopedEventUrl(pathOrUrl, serverId) {
  const normalizedServerId = normalizeServerId(serverId)
  if (!normalizedServerId) {
    return pathOrUrl
  }

  const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//u.test(pathOrUrl)
  const parsed = new URL(pathOrUrl, 'http://codexui.local')

  parsed.searchParams.set('serverId', normalizedServerId)

  if (isAbsoluteUrl) {
    return parsed.toString()
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
