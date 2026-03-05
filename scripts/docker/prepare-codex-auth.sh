#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_AUTH_FILE="${CODEX_AUTH_FILE:-$HOME/.codex/auth.json}"
TARGET_DIR="$ROOT_DIR/docker/multi-server/auth"
TARGET_AUTH_FILE="$TARGET_DIR/auth.json"

if [[ ! -s "$SOURCE_AUTH_FILE" ]]; then
  echo "[prepare-codex-auth] Missing or empty auth file: $SOURCE_AUTH_FILE" >&2
  echo "Set CODEX_AUTH_FILE to override source path." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
cp "$SOURCE_AUTH_FILE" "$TARGET_AUTH_FILE"
chmod 600 "$TARGET_AUTH_FILE"

echo "[prepare-codex-auth] Copied auth file to $TARGET_AUTH_FILE"
