# CodexHub

Standalone Codex hub for **multi-user**, **multi-server**, and **outbound Connector** workflows.

This standalone repository is operated as a central **Hub** service with per-user servers, Connector lifecycle management, explicit registration, relay transport, and hardened bootstrap onboarding.

> Original upstream project: [friuns2/codexui](https://github.com/friuns2/codexui)
>
> UI foundation and interaction ideas were originally referenced from the upstream codexui project and have since been adapted for CodexHub-specific workflows.

Compatibility note: **CodexHub** is the outward-facing product name for this repository. Existing `codexui`-prefixed env vars, on-disk paths, and CLI binaries remain in place where runtime compatibility depends on them.

## What changed in CodexHub

- **Hub-first deployment** for a VM, cloud server, or homelab host
- **Explicit server registration** only — nothing appears automatically
- **Multi-user auth** with admin bootstrap + user/session management
- **Public signup + admin approval** before non-admin accounts can sign in
- **Settings UI** for Connector creation, rename, reinstall, delete, and status
- **SQLite-backed Hub persistence** for users and Hub state
- **Approval-gated signup flow** with admin review and per-user isolation
- **Hook inbox + alert badges** for pending app-server hooks
- **Connector-scoped Skills Hub** browse/install/uninstall flows
- **PWA browser notifications** for hook approvals with service-worker push registration
- **Outbound-only Connector model** for remote Codex hosts
- **Bootstrap hardening**: one-time install token -> durable runtime credential
- **SQLite-backed Hub persistence** for users and Hub state (`$CODEX_HOME/codexui/hub.sqlite`)
- **Docker packaging** for the Hub with `.env`, `Dockerfile`, `docker-compose.yml`, and `docker-compose.ghcr.yml`

## CodexHub architecture

```text
Browser
  │
  ▼
CodexHub
  ├─ Auth / sessions / admin
  ├─ Server registry
  ├─ Connector registry
  ├─ Relay hub
  └─ Web UI
       │
       ├─ Local servers (explicitly registered)
       └─ Remote Connector-backed servers
            │
            ▼
      codexui-connector
            │
            ▼
      Codex CLI / codex app-server
```

## Quick start paths

CodexHub now supports two Docker entry points:

1. **Quick deploy without `git clone`** via a published GHCR image
2. **Development / build from source** via the checked-out repository

### Option A (recommended for operators): quick deploy without `git clone`

This path only needs:

- `docker-compose.ghcr.yml`
- `.env`
- Docker + Docker Compose

The examples below pin the downloaded files and GHCR image to the same release tag. If the GHCR package is private, run `docker login ghcr.io` first.

#### 1. Download the deployment files

With `curl`:

```bash
export CODEXHUB_TAG=v0.1.4
mkdir -p codexhub && cd codexhub
curl -fsSLO "https://raw.githubusercontent.com/TwoTwo-me/CodexHub/${CODEXHUB_TAG}/docker-compose.ghcr.yml"
curl -fsSLO "https://raw.githubusercontent.com/TwoTwo-me/CodexHub/${CODEXHUB_TAG}/.env"
```

With `wget`:

```bash
export CODEXHUB_TAG=v0.1.4
mkdir -p codexhub && cd codexhub
wget "https://raw.githubusercontent.com/TwoTwo-me/CodexHub/${CODEXHUB_TAG}/docker-compose.ghcr.yml"
wget "https://raw.githubusercontent.com/TwoTwo-me/CodexHub/${CODEXHUB_TAG}/.env"
```

#### 2. Pin `.env` to the same image tag

Edit `.env` and set at minimum:

```dotenv
CODEXUI_GHCR_IMAGE=ghcr.io/twotwo-me/codexhub:v0.1.4
CODEXUI_PUBLIC_URL=http://localhost:4300
```

Commonly adjusted:

```dotenv
CODEXUI_HOST_PORT=4300
CODEXUI_DATA_DIR=./.data/hub
CODEXUI_WORKSPACE_DIR=./workspace
CODEXUI_CODEX_HOME_DIR=./docker/local-codex
CODEXUI_SKIP_CODEX_LOGIN=true
```

#### 3. Generate a bootstrap admin password hash with the published image

Keep a **hash** in `.env`, not the plaintext password.

```bash
read -sr -p "Bootstrap admin password: " PW; printf '\n'
printf '%s' "$PW" | docker run --rm -i --entrypoint node \
  "ghcr.io/twotwo-me/codexhub:${CODEXHUB_TAG}" \
  dist-cli/index.js hash-password --password-stdin --env
unset PW
```

Paste the printed `CODEXUI_ADMIN_PASSWORD_HASH=scrypt$$...` line into `.env`.

#### 4. Start the Hub

```bash
docker compose -f docker-compose.ghcr.yml up -d hub
```

#### 5. First login: complete the setup wizard

- Open `http://localhost:4300`
- Sign in as the bootstrap admin (`admin` by default) with the plaintext password you used to generate the hash
- You will be forced to `/setup/bootstrap-admin`
- Change the admin username and password before using the rest of the Hub

#### 6. Remove the bootstrap hash for steady-state restarts

After the setup wizard succeeds, remove the bootstrap hash from `.env`:

```dotenv
CODEXUI_ADMIN_PASSWORD_HASH=
CODEXUI_ADMIN_PASSWORD_HASH_FILE=
```

The Hub can now restart with the rotated SQLite-backed admin account and no bootstrap secret in `.env`.

### Option B: development / build from source

Use this path when you want to hack on the repository, build locally, or keep using the existing helper scripts.

#### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/TwoTwo-me/CodexHub.git
cd CodexHub
npm ci
```

#### 2. Generate a bootstrap admin password hash

Recommended: keep a **hash** in `.env`, not the plaintext password.

Interactive helper:

```bash
npm run admin:hash-password
```

or directly:

```bash
read -sr -p "Bootstrap admin password: " PW; printf '\n'
printf '%s' "$PW" | node dist-cli/index.js hash-password --password-stdin --env
unset PW
```

Paste the printed `CODEXUI_ADMIN_PASSWORD_HASH=scrypt$$...` line into `.env`.

#### 3. Edit `.env`

At minimum, set:

```dotenv
CODEXUI_ADMIN_PASSWORD_HASH=scrypt$$...
CODEXUI_PUBLIC_URL=http://localhost:4300
```

If you use the smoke test or the `docker:hub:register-local` helper, provide the current admin password **at runtime only**:

```bash
export CODEXUI_ADMIN_LOGIN_PASSWORD='your-bootstrap-password'
```

Useful variables:

```dotenv
CODEXUI_IMAGE=codexui-hub:local
CODEXUI_HOST_PORT=4300
CODEXUI_DATA_DIR=./.data/hub
CODEXUI_WORKSPACE_DIR=./workspace
CODEXUI_CODEX_HOME_DIR=./docker/local-codex
CODEXUI_SKIP_CODEX_LOGIN=true
CODEXUI_CODEX_CLI_VERSION=0.110.0
```

#### 4. Start the Hub

```bash
npm run docker:hub:up
```

or directly:

```bash
docker compose up --build -d hub
```

#### 5. Smoke test

```bash
npm run docker:hub:smoke
```

#### 6. First login and steady-state restarts

The bootstrap setup wizard and post-setup hash removal steps are identical to the GHCR flow above.

## Bootstrap admin credential sources

If a bootstrap credential is present, the Hub resolves it in this order:

1. `CODEXUI_ADMIN_PASSWORD_HASH_FILE`
2. `CODEXUI_ADMIN_PASSWORD_HASH`
3. no bootstrap credential

Rules:

- plaintext bootstrap env/file/CLI inputs are rejected
- hash-file and hash-env cannot both be set
- after first-login setup completes, you should remove the bootstrap hash and restart normally

## Docker layout

- `Dockerfile` — source-build Hub image for repo / local-build workflows
- `docker-compose.yml` — dev / local-build Docker stack
- `docker-compose.ghcr.yml` — GHCR-backed operator deployment stack
- `.env` — shared Docker runtime defaults for both compose files
- `docker/hub/entrypoint.sh` — container startup wrapper used by the source-build image
- `scripts/docker/hub-*.sh` — helper commands for the repo / local-build workflow

Persisted directories:

- `CODEXUI_DATA_DIR` -> Hub data, users, registries, cache
- `CODEXUI_WORKSPACE_DIR` -> optional workspace mount for Hub-local projects
- `CODEXUI_CODEX_HOME_DIR` -> optional local Codex auth/config for Hub-local runtimes
- `CODEXUI_SKIP_CODEX_LOGIN=true` -> lets the Hub start in remote-only mode without forcing local Codex login

Persisted files inside `CODEX_HOME`:

- `codexui/hub.sqlite` -> SQLite database for users + Hub/global state (legacy path retained for compatibility)
- legacy `codexui/users.json` / `.codex-global-state.json` are imported on first run and then superseded by SQLite

## Connector onboarding

`codexui-connector` remains the install/connect command name for compatibility with existing remote hosts and automation.

1. Sign in to the Hub
2. Open **Settings**
3. Create a Connector
4. Reveal the one-time bootstrap token
5. Save it on the remote host
6. Run the generated install command
7. Start `codexui-connector connect`
8. Confirm status, project count, and thread count in Settings

### Browser notifications for hook approvals

Settings now includes a **Browser notifications** card that:

- registers a service worker + push subscription for the current browser
- stores the subscription per Hub user
- delivers hook approval notifications back to the browser/PWA
- supports Android/desktop Chromium browsers and iPhone Home Screen web apps (when push is available)

### Remote host example

```bash
npm exec --yes --package=github:TwoTwo-me/CodexHub#main -- codexui-connector install \
  --hub https://hub.example.com \
  --connector edge-laptop \
  --token '<bootstrap-token>' \
  --token-file $HOME/.codexui-connector/edge-laptop.token

npm exec --yes --package=github:TwoTwo-me/CodexHub#main -- codexui-connector connect \
  --hub https://hub.example.com \
  --connector edge-laptop \
  --token-file $HOME/.codexui-connector/edge-laptop.token
```

The install command now embeds the one-time bootstrap token inline and writes the durable runtime credential to `--token-file`.

## Optional: Hub-local Codex runtime

If you want the **Hub container itself** to host a local Codex runtime:

1. Copy local Codex auth into the mounted Hub Codex home:

```bash
npm run docker:hub:prepare-auth
```

2. Register a local server from inside the container:

```bash
export CODEXUI_ADMIN_LOGIN_PASSWORD='your-current-admin-password'
npm run docker:hub:register-local -- --default local-hub "Hub Local"
```

This is optional. The primary deployment model is still **Hub + remote Connectors**.

## Local non-Docker run

```bash
npm ci
npm run build
node dist-cli/index.js --host 0.0.0.0 --port 4300 --password-hash 'scrypt$...'
```

After first-login setup is complete and the admin account is stored in SQLite, later restarts can omit the bootstrap hash entirely:

```bash
node dist-cli/index.js --host 0.0.0.0 --port 4300
```

Useful environment variables:

- `CODEXUI_BIND_HOST`
- `CODEXUI_PORT`
- `CODEXUI_ADMIN_USERNAME`
- `CODEXUI_ADMIN_PASSWORD_HASH`
- `CODEXUI_ADMIN_PASSWORD_HASH_FILE`
- `CODEXUI_OPEN_BROWSER=false`
- `CODEX_HOME`

## Documentation

- [`docs/hub-docker-deployment.md`](docs/hub-docker-deployment.md) — primary deployment guide
- [`docs/settings-and-connectors.md`](docs/settings-and-connectors.md) — Settings UI and Connector lifecycle
- [`docs/connector-package.md`](docs/connector-package.md) — remote Connector install/runtime guide
- [`docs/connector-service-management.md`](docs/connector-service-management.md) — systemd / PM2 운영 가이드
- [`docs/bootstrap-admin-setup-report.md`](docs/bootstrap-admin-setup-report.md) — hash-only bootstrap and forced first-login rotation report
- [`docs/explorer-hooks-sqlite-approval-report.md`](docs/explorer-hooks-sqlite-approval-report.md) — server-scoped explorer, hook inbox, SQLite auth, and approval flow report
- [`docs/skills-hub-hooks-pwa-report.md`](docs/skills-hub-hooks-pwa-report.md) — connector-scoped Skills Hub, relay hook fixes, PWA notifications, and live Docker validation
- [`docs/hub-managed-connector-updates-report.md`](docs/hub-managed-connector-updates-report.md) — package-managed connector telemetry, update jobs, stable runner scripts, and Settings update controls
- [`docs/implementation-report.md`](docs/implementation-report.md) — phase-by-phase implementation summary
- [`docs/session-persistence-recovery-report.md`](docs/session-persistence-recovery-report.md) — durable sessions, recovery flows, and restart-safe auth report
- [`docs/connector-bootstrap-hardening-report.md`](docs/connector-bootstrap-hardening-report.md) — connector bootstrap hardening details
- [`docs/multi-server-test-workflow.md`](docs/multi-server-test-workflow.md) — disposable multi-server Docker lab stack

## Operational notes

- Fresh users start with **no default server**.
- Local folders stay unavailable until a server is explicitly registered.
- Public deployments should use **HTTPS** in front of the Hub.
- Connector bootstrap tokens are single-use and short-lived.
- The durable Connector credential is distinct from the bootstrap token.
- Bootstrap admin setup is also single-use: once completed, the Hub no longer needs a bootstrap hash to restart.

## Verification

```bash
npm run build
npm run test:multi-server
npm run docker:hub:smoke
npm audit --json
```

## License

MIT
