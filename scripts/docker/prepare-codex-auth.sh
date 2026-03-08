#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_AUTH_FILE="${CODEX_AUTH_FILE:-$HOME/.codex/auth.json}"
TARGET_AUTH_FILE="${CODEX_MULTI_SERVER_AUTH_FILE:-${TMPDIR:-/tmp}/codexui-multi-server-auth/auth.json}"
TARGET_DIR="$(dirname "$TARGET_AUTH_FILE")"

if [[ ! -s "$SOURCE_AUTH_FILE" ]]; then
  echo "[prepare-codex-auth] Missing or empty auth file: $SOURCE_AUTH_FILE" >&2
  echo "Set CODEX_AUTH_FILE to override source path." >&2
  exit 1
fi

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
install -m 600 "$SOURCE_AUTH_FILE" "$TARGET_AUTH_FILE"

extra_entries="$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 ! -name "$(basename "$TARGET_AUTH_FILE")" -print -quit || true)"
if [[ -n "$extra_entries" ]]; then
  echo "[prepare-codex-auth] Refusing to keep unexpected files in $TARGET_DIR" >&2
  exit 1
fi

echo "[prepare-codex-auth] Copied auth file to $TARGET_AUTH_FILE"
echo "[prepare-codex-auth] Only allowlisted auth.json was materialized."
