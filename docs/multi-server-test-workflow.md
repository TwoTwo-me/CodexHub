# Multi-server test + Docker workflow

This document covers worker-3 assets for serverId routing contract tests and Codex CLI multi-server Docker verification.

## 1) Run serverId routing/header tests

```bash
npm run test:multi-server
```

The test suite validates helper/API contract behavior for server routing:
- request header injection: `x-codex-server-id`
- SSE routing URL query: `?serverId=<id>`
- end-to-end header transmission to an HTTP test server

## 2) Prepare host auth file for Docker

The Docker stack uses an **ephemeral auth file** (default: `/tmp/codexui-multi-server-auth/auth.json`).

```bash
npm run docker:multi-server:prepare-auth
```

By default this copies from `~/.codex/auth.json`. To override:

```bash
CODEX_AUTH_FILE=/path/to/auth.json npm run docker:multi-server:prepare-auth
```

To override the target location:

```bash
CODEX_MULTI_SERVER_AUTH_FILE=/secure/tmp/auth.json npm run docker:multi-server:prepare-auth
```

## 3) Start Codex CLI multi-server containers

```bash
npm run docker:multi-server:up
```

This builds and starts two Codex app-server containers:
- `ws://127.0.0.1:19101`
- `ws://127.0.0.1:19102`

## 4) Run Docker smoke verification

```bash
npm run docker:multi-server:smoke
```

Smoke checks verify:
- auth file exists inside each container
- `codex --version` works in each container
- both websocket ports are reachable

## 5) Stop containers

```bash
npm run docker:multi-server:down
```

`docker:multi-server:down` also removes the ephemeral auth copy.

## Notes

- Never store real auth tokens inside the repository tree.
- Re-run `docker:multi-server:prepare-auth` whenever host auth tokens rotate.
