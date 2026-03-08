#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/multi-server/docker-compose.yml"
AUTH_FILE="${CODEX_MULTI_SERVER_AUTH_FILE:-${TMPDIR:-/tmp}/codexui-multi-server-auth/auth.json}"
export CODEX_MULTI_SERVER_AUTH_FILE="$AUTH_FILE"

bash "$ROOT_DIR/scripts/docker/prepare-codex-auth.sh"

docker compose -f "$COMPOSE_FILE" up --build -d

docker compose -f "$COMPOSE_FILE" ps

for service in codex-cli-a codex-cli-b codex-cli-c codex-cli-d codex-cli-e; do
  docker compose -f "$COMPOSE_FILE" exec -T "$service" sh -lc 'mkdir -p "$CODEX_HOME" && test -s "$CODEX_HOME/auth.json"'
done

echo "[multi-server-up] Codex multi-server containers are running on ws://127.0.0.1:19101..19105"
