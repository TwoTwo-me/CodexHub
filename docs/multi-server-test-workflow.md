# Multi-server Docker test workflow

This document describes the **test/lab** Docker stack under `docker/multi-server/`.

It is **not** the main Hub deployment stack.

- Use the root `docker-compose.yml` for the real Hub deployment.
- Use `docker/multi-server/` only when you want disposable Codex CLI containers for contract, integration, or Playwright-assisted testing.

## Hub deployment smoke path

Before using the real Hub stack, prepare the host mounts once:

```bash
mkdir -p .data/hub docker/local-codex workspace
cp ~/.codex/auth.json docker/local-codex/auth.json
chmod 600 docker/local-codex/auth.json
npm run docker:hub:up
npm run docker:hub:smoke
```

## What the lab stack does

It starts multiple Codex CLI containers that expose `codex app-server` over websocket endpoints so the Hub can exercise multi-server registration and remote-runtime behavior during testing.

## Files

- `docker/multi-server/Dockerfile.codex-cli`
- `docker/multi-server/docker-compose.yml`
- `scripts/docker/prepare-codex-auth.sh`
- `scripts/docker/multi-server-up.sh`
- `scripts/docker/multi-server-smoke.sh`
- `scripts/docker/multi-server-down.sh`

## Auth file handling

The lab stack expects a Codex auth file and uses an ephemeral copy by default:

```text
/tmp/codexui-multi-server-auth/auth.json
```

Prepare it with:

```bash
npm run docker:multi-server:prepare-auth
```

To override the source path:

```bash
CODEX_AUTH_FILE=/path/to/auth.json npm run docker:multi-server:prepare-auth
```

To override the copied target path:

```bash
CODEX_MULTI_SERVER_AUTH_FILE=/secure/tmp/auth.json npm run docker:multi-server:prepare-auth
```

## Start / smoke / stop

```bash
npm run docker:multi-server:up
npm run docker:multi-server:smoke
npm run docker:multi-server:down
```

## Endpoints

The disposable lab compose file exposes websocket listeners on:

- `ws://127.0.0.1:19101`
- `ws://127.0.0.1:19102`

These are intended for automated tests and local experimentation, not for the public Hub deployment.

## UI verification examples

After the Hub itself is running, you can still use Playwright against the UI:

```bash
PLAYWRIGHT_PASSWORD='<admin-password>' npm run test:playwright:admin
npx playwright test tests/playwright/settings-connectors.spec.ts --reporter=line
```
