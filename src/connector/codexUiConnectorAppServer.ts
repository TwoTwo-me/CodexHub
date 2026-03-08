import type { RelayConnectorAppServer, RelayConnectorNotification } from './core.js'
import { executeServerFsBridgeMethod, isServerFsBridgeMethod } from '../shared/serverFsBridge.js'
import {
  SERVER_REQUESTS_PENDING_METHOD,
  SERVER_REQUESTS_RESPOND_METHOD,
} from '../shared/serverRequestBridge.js'
import {
  SERVER_SKILLS_INSTALL_METHOD,
  SERVER_SKILLS_UNINSTALL_METHOD,
} from '../shared/serverSkillsBridge.js'

export class CodexUiConnectorAppServer implements RelayConnectorAppServer {
  private readonly delegate: RelayConnectorAppServer

  constructor(delegate: RelayConnectorAppServer) {
    this.delegate = delegate
  }

  async rpc(method: string, params: unknown): Promise<unknown> {
    if (method === 'codexui/relay/bootstrap') {
      return { ok: true }
    }
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
    if (method === SERVER_SKILLS_INSTALL_METHOD) {
      const installSkillFromHub = (
        this.delegate as RelayConnectorAppServer & {
          installSkillFromHub?: (payload: unknown) => Promise<unknown>
        }
      ).installSkillFromHub
      if (typeof installSkillFromHub === 'function') {
        return await installSkillFromHub.call(this.delegate, params)
      }
    }
    if (method === SERVER_SKILLS_UNINSTALL_METHOD) {
      const uninstallSkillFromHub = (
        this.delegate as RelayConnectorAppServer & {
          uninstallSkillFromHub?: (payload: unknown) => Promise<unknown>
        }
      ).uninstallSkillFromHub
      if (typeof uninstallSkillFromHub === 'function') {
        return await uninstallSkillFromHub.call(this.delegate, params)
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
