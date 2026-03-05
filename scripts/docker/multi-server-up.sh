#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/multi-server/docker-compose.yml"

bash "$ROOT_DIR/scripts/docker/prepare-codex-auth.sh"

docker compose -f "$COMPOSE_FILE" up --build -d

docker compose -f "$COMPOSE_FILE" ps

echo "[multi-server-up] Codex multi-server containers are running on ws://127.0.0.1:19101 and ws://127.0.0.1:19102"
