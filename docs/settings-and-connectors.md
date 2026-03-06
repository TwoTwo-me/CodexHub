# Settings + Connectors

This phase introduces a dedicated **Settings** screen for connector lifecycle management, including bootstrap install state and reinstall flows.

## Scope

The hub now treats every remote runtime as an explicitly registered **Connector** that creates a matching relay-backed **Server** entry for the current user.

```text
Hub
└─ Server
   └─ Connector
      └─ Codex app-server
         └─ Project
            └─ Thread
```

## What changed

### 1. Explicit registration only
- Fresh users no longer receive an implicit local/default server.
- Local folders stay unavailable until a server or connector is registered.
- Connector creation automatically creates the bound relay server entry for the same user scope.

### 2. `/settings` route
- Added a dedicated Settings page in the left navigation.
- The page loads connector data from `GET /codex-api/connectors?includeStats=1`.
- The content area keeps the existing session controls while the Settings panel handles connector CRUD and bootstrap lifecycle state.

### 3. Connector lifecycle UI
The Settings page supports:
- Create connector
- Inspect connector metadata
- Rename connector
- **Reissue install token** (reinstall flow)
- Delete connector
- View install state:
  - `Pending install`
  - `Connected`
  - `Offline`
  - `Expired bootstrap`
  - `Reinstall required`
- View counts (`projects`, `threads`)
- View last-seen timestamp
- View bootstrap metadata (`issued`, `expires`, `consumed`, `credential issued`)

### 4. Server binding model
Each connector now owns a relay-backed server record:
- `connector.id` → user-visible connector identifier
- `connector.serverId` → server registry binding
- `connector.relayAgentId` → relay transport identity

Deleting a connector removes the bound server and disposes the runtime entry for that user scope.

## API surface

### Connector APIs
- `GET /codex-api/connectors?includeStats=1`
- `POST /codex-api/connectors`
- `PATCH /codex-api/connectors/:id`
- `POST /codex-api/connectors/:id/rotate-token`
- `DELETE /codex-api/connectors/:id`
- `POST /codex-api/connectors/:id/bootstrap-exchange`

### Returned fields
Connector payloads now expose:
- `id`
- `serverId`
- `name`
- `hubAddress`
- `relayAgentId`
- `installState`
- `bootstrapIssuedAtIso`
- `bootstrapExpiresAtIso`
- `bootstrapConsumedAtIso`
- `credentialIssuedAtIso`
- `connected`
- `lastSeenAtIso`
- `projectCount`
- `threadCount`
- `lastStatsAtIso`
- `statsStale`
- optional `relayE2eeKeyId`

## Bootstrap security model

### Create / reissue
- `POST /codex-api/connectors` returns a **bootstrap token**.
- `POST /codex-api/connectors/:id/rotate-token` invalidates the current durable credential and issues a fresh bootstrap token.

### Exchange
- `POST /codex-api/connectors/:id/bootstrap-exchange` is the one-time enrollment step.
- The connector presents the bootstrap token as a bearer token.
- The hub returns a **durable relay credential**.
- Replaying the same bootstrap token is rejected.
- Expired bootstrap tokens are rejected.

### Runtime
- Only the durable relay credential is accepted by:
  - `POST /codex-api/relay/agent/connect`
  - `GET /codex-api/relay/agent/pull`
  - `POST /codex-api/relay/agent/push`

## Status and count behavior

- When a connector is online, the hub requests `thread/list` through the relay transport and derives:
  - unique project count
  - thread count
- The hub stores the latest successful snapshot in the connector registry.
- If the connector is offline, the last snapshot is exposed with `statsStale: true`.

## Recommended operator flow

1. Open **Settings**
2. Create a connector
3. Reveal the bootstrap token once and save it to a secure file on the remote host
4. Run the suggested `codexui-connector install --token-file ...` command
5. Start the connector with `codexui-connector connect --token-file ...` (or use `install --run`)
6. Return to Settings to confirm:
   - install state
   - online state
   - project count
   - thread count
7. Use **Reissue install token** when reinstalling or revoking a connector

## Security guardrails

- Non-local hub addresses must use **HTTPS**.
- Bootstrap tokens are masked until the operator explicitly reveals them.
- Suggested install commands use `--token-file` so secrets do not need to appear in shell history.
- Bootstrap tokens are one-time and short-lived; the durable credential is issued only after successful exchange.

## Related docs
- [`docs/connector-package.md`](./connector-package.md)
- [`docs/implementation-report.md`](./implementation-report.md)
- [`docs/multi-server-test-workflow.md`](./multi-server-test-workflow.md)
