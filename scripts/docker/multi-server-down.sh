#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/multi-server/docker-compose.yml"

docker compose -f "$COMPOSE_FILE" down --remove-orphans

echo "[multi-server-down] Codex multi-server containers stopped and removed"
