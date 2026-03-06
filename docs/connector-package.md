# codexui-connector package

`codexui-connector` is the outbound client installed on each remote Codex host.

Its job is to connect a remote host back to the central CodexUI Hub, exchange a one-time bootstrap token for a durable runtime credential, pull relay RPC requests, forward them into the local `codex app-server`, and push responses/events back to the Hub.

## Remote host requirements

- Node.js 18+
- Codex CLI installed and available as `codex`
- Local Codex authentication at `~/.codex/auth.json`

If `auth.json` is missing, the Connector refuses to start and tells the operator to run:

```bash
codex login
```

## Recommended onboarding path

### A. Hub UI path (recommended)

1. Deploy the Hub with Docker
2. Set `CODEXUI_PUBLIC_URL` to the public Hub origin
3. Sign in to the Hub
4. Open **Settings**
5. Create a Connector
6. Reveal the one-time bootstrap token
7. Save it to a secure token file on the remote host
8. Run `codexui-connector install`
9. Start `codexui-connector connect`

### B. Terminal-only path

You can also register from a terminal using Hub credentials:

```bash
read -sr CODEXUI_HUB_PASSWORD && printf '%s' "$CODEXUI_HUB_PASSWORD" | \
  npx codexui-connector provision \
  --hub https://hub.example.com \
  --username alice \
  --password-stdin \
  --connector edge-laptop \
  --name 'Alice Edge Laptop'
```

This returns:
- Connector metadata
- a one-time bootstrap token
- a suggested install command

## Install flow

### 1. Save the bootstrap token securely

```bash
install -d -m 700 $HOME/.codexui-connector
printf '%s' '<bootstrap-token>' > $HOME/.codexui-connector/edge-laptop.token
chmod 600 $HOME/.codexui-connector/edge-laptop.token
```

### 2. Exchange it for the durable credential

```bash
npx codexui-connector install \
  --hub https://hub.example.com \
  --connector edge-laptop \
  --token-file $HOME/.codexui-connector/edge-laptop.token
```

During `install` the Connector:
1. reads the bootstrap token
2. calls `POST /codex-api/connectors/:id/bootstrap-exchange`
3. receives the durable runtime credential
4. rewrites the same `--token-file` with the durable credential

### 3. Start the Connector runtime

```bash
npx codexui-connector connect \
  --hub https://hub.example.com \
  --connector edge-laptop \
  --token-file $HOME/.codexui-connector/edge-laptop.token
```

## Useful flags

### `install`
- `--run` — install and immediately start the runtime
- `--key-id <id>` + `--passphrase <secret>` — required together when relay E2EE is enabled and `--run` is used
- `--allow-insecure-http` — lab use only when the Hub is not on HTTPS

### `provision`
- `--json` — return structured output for automation
- `--run` — provision, exchange bootstrap token, and start immediately on the same host
- `--key-id <id>` — attach relay E2EE metadata
- `--passphrase <secret>` — required together with `--run` when relay E2EE is enabled

## Runtime behavior

At runtime the Connector:
1. authenticates with the durable relay credential
2. opens a relay session
3. pulls queued requests from the Hub
4. forwards them to the local `codex app-server`
5. pushes responses/events back to the Hub

## Docker note

The root `docker-compose.yml` in this repo is for the **Hub**.

The Connector normally runs on a separate remote machine, but it can also run in a container if that container includes:

- Node.js
- Codex CLI
- `~/.codex/auth.json`
- the durable Connector token file

## Security notes

- Bootstrap tokens are **single-use, short-lived install secrets**.
- The durable runtime credential is distinct from the bootstrap token.
- Public Hubs should use **HTTPS**.
- Reissue install tokens from Settings whenever reinstalling or revoking a host.
- Suggested commands use `--token-file` so secrets do not have to appear in shell history.

## Verification

```bash
node dist-cli/connector.js --help
node --test tests/multi-server/relay-connector-provisioning.test.mjs
node --test tests/multi-server/connector-provisioning-package.test.mjs
```
