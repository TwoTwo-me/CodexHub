#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/multi-server/docker-compose.yml"
AUTH_FILE="${CODEX_MULTI_SERVER_AUTH_FILE:-${TMPDIR:-/tmp}/codexui-multi-server-auth/auth.json}"

docker compose -f "$COMPOSE_FILE" down --remove-orphans

if [[ -f "$AUTH_FILE" ]]; then
  rm -f "$AUTH_FILE"
fi

echo "[multi-server-down] Codex multi-server containers stopped and removed"
