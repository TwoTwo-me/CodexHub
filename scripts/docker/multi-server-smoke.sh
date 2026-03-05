#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/multi-server/docker-compose.yml"

services=(codex-cli-a codex-cli-b)
ports=(19101 19102)

check_port() {
  local port="$1"
  node -e "
const net = require('node:net')
const port = Number(process.argv[1])
const socket = net.connect({ host: '127.0.0.1', port })
const timer = setTimeout(() => {
  socket.destroy()
  process.exit(1)
}, 2500)
socket.once('connect', () => {
  clearTimeout(timer)
  socket.end()
  process.exit(0)
})
socket.once('error', () => {
  clearTimeout(timer)
  process.exit(1)
})
" "$port"
}

for service in "${services[@]}"; do
  docker compose -f "$COMPOSE_FILE" exec -T "$service" sh -lc 'test -s /root/.codex/auth.json'
  docker compose -f "$COMPOSE_FILE" exec -T "$service" codex --version >/dev/null
  echo "[multi-server-smoke] $service has codex CLI + auth.json"
done

for port in "${ports[@]}"; do
  if check_port "$port"; then
    echo "[multi-server-smoke] ws://127.0.0.1:$port is reachable"
  else
    echo "[multi-server-smoke] Failed to reach ws://127.0.0.1:$port" >&2
    exit 1
  fi
done

echo "[multi-server-smoke] All multi-server checks passed"
