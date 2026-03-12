# Hub Docker Deployment

This repository now supports two Docker deployment paths:

1. **GHCR quick deploy** for operators who do not want to `git clone`
2. **Repo / local-build deploy** for development and source-based testing

Run the Hub as a Docker service, then attach remote Codex machines through `codexui-connector`.

## Files involved

- `docker-compose.ghcr.yml` — GHCR image deploy path with no local build
- `.env` — shared settings for both Docker paths
- `docker-compose.yml` — repo / local-build stack
- `Dockerfile` — source-build image definition for repo / local-build workflows
- `docker/hub/entrypoint.sh`
- `scripts/docker/hub-up.sh`
- `scripts/docker/hub-down.sh`
- `scripts/docker/hub-logs.sh`
- `scripts/docker/hub-smoke.sh`

## What the Hub container includes

The Hub image now bundles:

- the web UI + API server
- auth/session handling
- the multi-user server + connector registries
- relay hub support
- Codex CLI inside the container (so optional local-on-Hub runtime registration is still possible)

## `.env` defaults

```dotenv
COMPOSE_PROJECT_NAME=codexui-hub
CODEXUI_IMAGE=codexui-hub:local
CODEXUI_GHCR_IMAGE=ghcr.io/twotwo-me/codexhub:main
CODEXUI_CONTAINER_NAME=codexui-hub
CODEXUI_EXPOSE_HOST=0.0.0.0
CODEXUI_HOST_PORT=4300
CODEXUI_PORT=4300
CODEXUI_BIND_HOST=0.0.0.0
CODEXUI_ADMIN_USERNAME=admin
CODEXUI_ADMIN_PASSWORD_HASH=
CODEXUI_ADMIN_PASSWORD_HASH_FILE=
CODEXUI_ADMIN_LOGIN_PASSWORD=
CODEXUI_ADMIN_PASSWORD=
CODEXUI_ADMIN_PASSWORD_FILE=
CODEXUI_DATA_DIR=./.data/hub
CODEXUI_WORKSPACE_DIR=./workspace
CODEXUI_CODEX_HOME_DIR=./docker/local-codex
CODEXUI_SKIP_CODEX_LOGIN=true
CODEXUI_OPEN_BROWSER=false
CODEXUI_PUBLIC_URL=http://localhost:4300
CODEXUI_CODEX_CLI_VERSION=0.110.0
```

### Change these before real deployment

At minimum:

- `CODEXUI_ADMIN_PASSWORD_HASH` (recommended)
- `CODEXUI_PUBLIC_URL`

Commonly adjusted:

- `CODEXUI_HOST_PORT`
- `CODEXUI_EXPOSE_HOST`
- `CODEXUI_ADMIN_USERNAME`
- `CODEXUI_DATA_DIR`
- `CODEXUI_WORKSPACE_DIR`
- `CODEXUI_CODEX_HOME_DIR`
- `CODEXUI_GHCR_IMAGE` (for GHCR quick deploys; pin it to the same release tag as the downloaded files)

## Recommended bootstrap admin workflow

Use a hash in `.env`, not the plaintext password.

### GHCR quick deploy (no clone)

Choose a release tag and download only:

- `docker-compose.ghcr.yml`
- `.env`

For example:

```bash
export CODEXHUB_TAG=v0.1.4
mkdir -p codexhub && cd codexhub
curl -fsSLO "https://raw.githubusercontent.com/TwoTwo-me/CodexHub/${CODEXHUB_TAG}/docker-compose.ghcr.yml"
curl -fsSLO "https://raw.githubusercontent.com/TwoTwo-me/CodexHub/${CODEXHUB_TAG}/.env"
```

If the GHCR package is private, run `docker login ghcr.io` before the next step.

Then set:

```dotenv
CODEXUI_GHCR_IMAGE=ghcr.io/twotwo-me/codexhub:v0.1.4
CODEXUI_PUBLIC_URL=http://localhost:4300
```

Generate the bootstrap hash with the published image:

```bash
read -sr -p "Bootstrap admin password: " PW; printf '\n'
printf '%s' "$PW" | docker run --rm -i --entrypoint node \
  ghcr.io/twotwo-me/codexhub:v0.1.4 \
  dist-cli/index.js hash-password --password-stdin --env
unset PW
```

Then start:

```bash
docker compose -f docker-compose.ghcr.yml up -d hub
```

### Repo / local-build deploy

Generate the hash interactively:

```bash
npm run admin:hash-password
```

The helper prints:

```dotenv
CODEXUI_ADMIN_PASSWORD_HASH=scrypt$$...
```

Paste that into `.env`.

The helper already escapes `$` as `$$`, so the output is safe to paste directly into `docker compose`-managed `.env` files.

### Credential sources

The Hub entrypoint resolves bootstrap credentials in this order:

1. `CODEXUI_ADMIN_PASSWORD_HASH_FILE`
2. `CODEXUI_ADMIN_PASSWORD_HASH`
3. no bootstrap credential

Plaintext bootstrap env/file inputs are rejected.

### First-login setup wizard

On the first successful bootstrap admin login:

1. the Hub issues a valid session
2. the session is marked `setupRequired`
3. the browser is forced to `/setup/bootstrap-admin`
4. the administrator must change both username and password before the rest of the app unlocks

Until that setup is complete:

- `codex-api` routes are blocked
- browser navigation is redirected back to `/setup/bootstrap-admin`
- helper scripts that need authenticated API access will fail with an instruction to complete setup first

### Runtime-only plaintext for helper scripts

When the Hub is configured from `CODEXUI_ADMIN_PASSWORD_HASH`, the smoke test and the Hub-local registration helper still need the real password to log in.

Provide it **only at runtime**:

```bash
export CODEXUI_ADMIN_LOGIN_PASSWORD='your-bootstrap-password'
npm run docker:hub:smoke
```

or:

```bash
export CODEXUI_ADMIN_LOGIN_PASSWORD='your-bootstrap-password'
npm run docker:hub:register-local -- --default local-hub "Hub Local"
```

On a fresh installation, `docker:hub:smoke` will report that bootstrap login worked even if the setup wizard is still pending. `docker:hub:register-local` is stricter: it refuses to continue until `/setup/bootstrap-admin` has been completed, because the Hub blocks `codex-api` access until then.

### Steady-state restart without bootstrap hash

After the setup wizard completes successfully:

1. remove or blank `CODEXUI_ADMIN_PASSWORD_HASH` / `CODEXUI_ADMIN_PASSWORD_HASH_FILE`
2. keep the rotated admin credentials in your password manager
3. restart the Hub normally

The Hub will continue authenticating against SQLite (`$CODEX_HOME/codexui/hub.sqlite`) and will not recreate the bootstrap admin.

## Start / stop / inspect

### Start (repo / local-build)

```bash
npm run docker:hub:up
```

or directly:

```bash
docker compose up --build -d hub
```

### Start (GHCR quick deploy)

```bash
docker compose -f docker-compose.ghcr.yml up -d hub
```

### Smoke test

```bash
npm run docker:hub:smoke
```

For a no-clone GHCR deployment, the simplest readiness probe is:

```bash
curl http://127.0.0.1:4300/auth/session
```

The smoke script verifies:

- the Hub becomes reachable
- `/auth/session` responds
- the supplied admin password can log in successfully
- a session cookie is issued

### Logs

```bash
npm run docker:hub:logs
```

GHCR quick deploy:

```bash
docker compose -f docker-compose.ghcr.yml logs -f hub
```

### Stop

```bash
npm run docker:hub:down
```

GHCR quick deploy:

```bash
docker compose -f docker-compose.ghcr.yml down
```

## Persistence model

The compose stack mounts three important paths:

- `${CODEXUI_DATA_DIR}` -> `/data`
- `${CODEXUI_WORKSPACE_DIR}` -> `/workspace`
- `${CODEXUI_CODEX_HOME_DIR}` -> `/data/codex-home`

That persists:

- users
- connector registry
- server registry
- connector stats snapshots
- bootstrap/admin account state
- authenticated browser sessions (when the same `CODEX_HOME` / `hub.sqlite` volume is reused)
- login/signup rate-limit state
- optional local Codex state for Hub-local registrations
- workspace content exposed to local-on-Hub runtimes

### Session recovery after restart/redeploy

With the same persisted `${CODEXUI_CODEX_HOME_DIR}` volume:

- browser login sessions survive normal Hub restart/redeploy
- bootstrap/setup-required gating is still derived from the user record in SQLite
- sessions are only invalidated when logout, credential recovery/reset, explicit revoke-all, or a compatibility/security event requires it
- standard account recovery is admin-assisted from the existing Admin page
- last-admin recovery is local-only and must be performed from the Hub host CLI/runbook

If the Hub starts against a different or empty `CODEX_HOME`, previously issued browser sessions are not expected to recover.

## Remote-only deployment

If you only plan to use remote Connectors, the Hub can run without a local `auth.json`.

In that model:

- deploy the Hub container
- keep `CODEXUI_SKIP_CODEX_LOGIN=true`
- create users/connectors from the UI
- connect remote hosts with `codexui-connector`

## Optional local-on-Hub runtime support

If you also want the Hub container itself to host a local Codex runtime, place a valid Codex auth file at:

```text
${CODEXUI_CODEX_HOME_DIR}/auth.json
```

By default that means:

```text
./docker/local-codex/auth.json
```

You can also map a prepared workspace into:

```text
${CODEXUI_WORKSPACE_DIR}
```

By default:

```text
./workspace
```

## Reverse proxy guidance

For public deployments, terminate TLS in front of the Hub and forward:

- `Host`
- `X-Forwarded-Proto: https`
- `X-Forwarded-For` and/or `X-Real-IP` **only from a trusted local reverse proxy**

Then make sure `CODEXUI_PUBLIC_URL` matches the public HTTPS origin users and Connectors should use.

The Hub trusts forwarded client IP headers for auth throttling only when the immediate peer is loopback/local proxy. Direct clients should not send those headers themselves.

## Notes on the root Docker stack vs test fixtures

- root `docker-compose.yml` = real Hub deployment path
- `docker/multi-server/` = disposable Codex CLI lab stack for tests/contracts
