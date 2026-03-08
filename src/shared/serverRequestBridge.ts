export const SERVER_REQUESTS_PENDING_METHOD = 'codexui/server-requests/pending'
export const SERVER_REQUESTS_RESPOND_METHOD = 'codexui/server-requests/respond'

export type BridgePendingServerRequest = {
  id: number
  method: string
  params: unknown
  receivedAtIso: string
}

export type BridgeServerRequestReply = {
  id: number
  result?: unknown
  error?: {
    code?: number
    message: string
  }
}
