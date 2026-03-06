# codexui-connector package

`codexui-connector` is the outbound relay client installed on a remote Codex host.

It connects to a central CodexUI hub, exchanges a one-time bootstrap token for a durable relay credential, pulls relay RPC requests, forwards them into the local `codex app-server`, and pushes responses / notifications back to the hub.

## Commands

### 1. Provision a connector from hub credentials

This command logs into the hub, registers a connector for the current user, and returns:
- connector metadata
- a **one-time bootstrap token**
- a generated `install --token-file ...` command

```bash
read -sr CODEXUI_HUB_PASSWORD && printf '%s' "$CODEXUI_HUB_PASSWORD" | \
  npx codexui-connector provision \
  --hub https://hub.example.com \
  --username alice \
  --password-stdin \
  --connector edge-laptop \
  --name 'Alice Edge Laptop'
```

Optional flags:
- `--json` — emit structured JSON for automation (includes the one-time bootstrap token)
- `--run` — immediately exchange the bootstrap token and start the connector on the current host
- `--key-id <id>` — attach relay E2EE policy metadata
- `--passphrase <secret>` — required together with `--run` when E2EE is enabled
- `--allow-insecure-http` — allow plaintext HTTP for non-loopback lab environments only

### 2. Install from a bootstrap token file

Save the bootstrap token to a secure file first:

```bash
install -d -m 700 $HOME/.codexui-connector
printf '%s' '<bootstrap-token>' > $HOME/.codexui-connector/edge-laptop.token
chmod 600 $HOME/.codexui-connector/edge-laptop.token
```

Then exchange it for the durable connector credential:

```bash
npx codexui-connector install \
  --hub https://hub.example.com \
  --connector edge-laptop \
  --token-file $HOME/.codexui-connector/edge-laptop.token
```

What happens during install:
1. Reads the bootstrap token
2. Calls `POST /codex-api/connectors/:id/bootstrap-exchange`
3. Receives the durable relay credential
4. Rewrites the same `--token-file` in place with the durable credential

Optional flags:
- `--run` — exchange the bootstrap token and immediately start the connector
- `--key-id <id>` + `--passphrase <secret>` — required together when `--run` is used with relay E2EE
- `--allow-insecure-http` — allow plaintext HTTP for non-loopback lab environments only

### 3. Connect with the durable credential file

After installation, use the same token file to start the daemon:

```bash
npx codexui-connector connect \
  --hub https://hub.example.com \
  --connector edge-laptop \
  --token-file $HOME/.codexui-connector/edge-laptop.token
```

Optional relay E2EE arguments:

```bash
npx codexui-connector connect \
  --hub https://hub.example.com \
  --connector edge-laptop \
  --token-file $HOME/.codexui-connector/edge-laptop.token \
  --key-id relay-key-1 \
  --passphrase '<relay-passphrase>'
```

## Requirements on the remote host

- Node.js 18+
- Codex CLI installed and available as `codex`
- Local Codex authentication (`~/.codex/auth.json`)

If `auth.json` is missing, the connector refuses to start and instructs the operator to run:

```bash
codex login
```

## What the connector does

### Install time
1. Exchanges the bootstrap token for a durable credential
2. Stores the durable credential in the local token file

### Runtime
1. Authenticates to the hub using the durable relay credential
2. Opens a relay session
3. Pulls queued relay RPC requests
4. Calls the local `codex app-server`
5. Pushes relay responses back to the hub
6. Forwards local notifications as relay events

## Suggested install flow

### From the hub UI
1. Open **Settings**
2. Create a connector
3. Reveal the bootstrap token once and save it to a secure file on the remote host
4. Run the generated `codexui-connector install --token-file ...` command
5. Start the daemon with `codexui-connector connect --token-file ...` (or use `install --run`)

### From a terminal only
1. Provision with hub credentials
2. Save the returned bootstrap token to a secure file (or use `--json` for automation)
3. Run `codexui-connector install --token-file ...`
4. Start `codexui-connector connect --token-file ...`

## Systemd example

Install the connector once, then point systemd at the durable credential file:

```ini
[Unit]
Description=CodexUI Connector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/codexui-connector
ExecStart=/usr/bin/env npx codexui-connector connect --hub https://hub.example.com --connector edge-laptop --token-file /etc/codexui/edge-laptop.token
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Docker example

If you prefer containers, build an image that already contains:
- Node.js
- Codex CLI
- `~/.codex/auth.json`

After running the bootstrap install once, mount the rewritten durable credential file into the container:

```bash
docker run --rm \
  -e CODEX_HOME=/root/.codex \
  -v /path/to/auth.json:/root/.codex/auth.json:ro \
  -v /path/to/edge-laptop.token:/run/secrets/edge-laptop.token:ro \
  my-codex-connector-image \
  npx codexui-connector connect --hub https://hub.example.com --connector edge-laptop --token-file /run/secrets/edge-laptop.token
```

## Security notes

- Bootstrap tokens are **short-lived, single-use install secrets** and should be treated like passwords.
- The durable relay credential is distinct from the bootstrap token and is the only secret accepted by `connect` / `pull` / `push`.
- Non-local hubs must use **HTTPS** unless you explicitly opt into `--allow-insecure-http` for lab use.
- Reissue install tokens from the Settings page when reinstalling or revoking a host.
- Relay E2EE passphrases are not persisted by the web UI and must be supplied again on the connector host when needed.

## Verification

- `node dist-cli/connector.js --help`
- `node --test tests/multi-server/relay-connector-provisioning.test.mjs`
- `node --test tests/multi-server/connector-provisioning-package.test.mjs`
