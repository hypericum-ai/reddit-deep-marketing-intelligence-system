g#!/usr/bin/env bash
# Install all Node dependencies after a fresh clone.
# Usage: bash scripts/install-requirements.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/hypericum-rsr"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    echo "See requirements.txt for system prerequisites." >&2
    exit 1
  fi
}

check_node() {
  local version major minor
  version="$(node -v | sed 's/^v//')"
  major="${version%%.*}"
  minor="$(echo "$version" | cut -d. -f2)"
  if [[ "$major" -lt 22 ]] || { [[ "$major" -eq 22 ]] && [[ "$minor" -lt 2 ]]; }; then
    echo "Node.js >= 22.2.0 required (found v$version)." >&2
    echo "Install via nvm: cd hypericum-rsr && nvm install && nvm use" >&2
    exit 1
  fi
}

echo "==> Checking system requirements (see requirements.txt)"
require_cmd git
require_cmd node
require_cmd npm
check_node

echo "==> Installing npm packages from hypericum-rsr/package-lock.json"
cd "$APP_DIR"
npm ci

echo "==> Syncing prompts into src/generated/llmPrompts.ts"
npm run sync-prompts

echo ""
echo "All packages installed."
echo "Next: cd hypericum-rsr && npm run login && npm run dev"
