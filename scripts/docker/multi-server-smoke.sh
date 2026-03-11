#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/multi-server/docker-compose.yml"
AUTH_FILE="${CODEX_MULTI_SERVER_AUTH_FILE:-${TMPDIR:-/tmp}/codexui-multi-server-auth/auth.json}"
export CODEX_MULTI_SERVER_AUTH_FILE="$AUTH_FILE"

services=(codex-cli-a codex-cli-b codex-cli-c codex-cli-d codex-cli-e codex-cli-f)
ports=(19101 19102 19103 19104 19105 19106)

bootstrap_omx() {
  local service="$1"
  docker compose -f "$COMPOSE_FILE" exec -T "$service" sh -lc '
    set -eu
    omx setup --scope user --force >/tmp/omx-setup.log 2>&1 || {
      cat /tmp/omx-setup.log >&2
      exit 1
    }
    omx doctor >/tmp/omx-doctor.log 2>&1 || {
      cat /tmp/omx-doctor.log >&2
      exit 1
    }
  '
}

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
  docker compose -f "$COMPOSE_FILE" exec -T "$service" omx version >/dev/null
  bootstrap_omx "$service"
  docker compose -f "$COMPOSE_FILE" exec -T "$service" sh -lc '
    test ! -e /root/.omx/state/sessions || test -z "$(find /root/.omx/state/sessions -mindepth 1 -print -quit 2>/dev/null)"
  '
  echo "[multi-server-smoke] $service has codex CLI + auth.json + oh-my-codex bootstrap"
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
