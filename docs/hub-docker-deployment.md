# Hub Docker Deployment

This is the primary production-style deployment path for this fork.

Run the Hub as a Docker service, then attach remote Codex machines through `codexui-connector`.

## Files involved

- `Dockerfile`
- `docker-compose.yml`
- `.env`
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
CODEXUI_CONTAINER_NAME=codexui-hub
CODEXUI_EXPOSE_HOST=0.0.0.0
CODEXUI_HOST_PORT=4300
CODEXUI_PORT=4300
CODEXUI_BIND_HOST=0.0.0.0
CODEXUI_ADMIN_USERNAME=admin
CODEXUI_ADMIN_PASSWORD=change-me-now
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

- `CODEXUI_ADMIN_PASSWORD`
- `CODEXUI_PUBLIC_URL`

Commonly adjusted:

- `CODEXUI_HOST_PORT`
- `CODEXUI_EXPOSE_HOST`
- `CODEXUI_ADMIN_USERNAME`
- `CODEXUI_DATA_DIR`
- `CODEXUI_WORKSPACE_DIR`
- `CODEXUI_CODEX_HOME_DIR`

## Start / stop / inspect

### Start

```bash
npm run docker:hub:up
```

or directly:

```bash
docker compose up --build -d hub
```

### Smoke test

```bash
npm run docker:hub:smoke
```

The smoke script verifies:

- the Hub becomes reachable
- `/auth/session` responds
- the bootstrap admin can log in successfully
- a session cookie is issued

### Logs

```bash
npm run docker:hub:logs
```

### Stop

```bash
npm run docker:hub:down
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
- session/bootstrap state
- optional local Codex state for Hub-local registrations
- workspace content exposed to local-on-Hub runtimes

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

Then make sure `CODEXUI_PUBLIC_URL` matches the public HTTPS origin users and Connectors should use.

## Notes on the root Docker stack vs test fixtures

- root `docker-compose.yml` = real Hub deployment path
- `docker/multi-server/` = disposable Codex CLI lab stack for tests/contracts
