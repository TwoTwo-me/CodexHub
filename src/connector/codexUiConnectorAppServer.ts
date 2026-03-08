import type { RelayConnectorAppServer, RelayConnectorNotification } from './core.js'
import { executeServerFsBridgeMethod, isServerFsBridgeMethod } from '../shared/serverFsBridge.js'
import {
  SERVER_REQUESTS_PENDING_METHOD,
  SERVER_REQUESTS_RESPOND_METHOD,
} from '../shared/serverRequestBridge.js'

export class CodexUiConnectorAppServer implements RelayConnectorAppServer {
  private readonly delegate: RelayConnectorAppServer

  constructor(delegate: RelayConnectorAppServer) {
    this.delegate = delegate
  }

  async rpc(method: string, params: unknown): Promise<unknown> {
    if (isServerFsBridgeMethod(method)) {
      return await executeServerFsBridgeMethod(method, params)
    }
    if (method === SERVER_REQUESTS_PENDING_METHOD) {
      const listPendingServerRequests = (
        this.delegate as RelayConnectorAppServer & {
          listPendingServerRequests?: () => unknown[]
        }
      ).listPendingServerRequests
      if (typeof listPendingServerRequests === 'function') {
        return listPendingServerRequests.call(this.delegate)
      }
    }
    if (method === SERVER_REQUESTS_RESPOND_METHOD) {
      const respondToServerRequest = (
        this.delegate as RelayConnectorAppServer & {
          respondToServerRequest?: (payload: unknown) => Promise<unknown>
        }
      ).respondToServerRequest
      if (typeof respondToServerRequest === 'function') {
        return await respondToServerRequest.call(this.delegate, params)
      }
    }
    return await this.delegate.rpc(method, params)
  }

  onNotification(listener: (notification: RelayConnectorNotification) => void): () => void {
    return this.delegate.onNotification(listener)
  }

  dispose(): void {
    this.delegate.dispose?.()
  }
}
