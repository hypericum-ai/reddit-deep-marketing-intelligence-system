#!/usr/bin/env bash
# Run a command with the Node version from .nvmrc (requires nvm).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# npm sets npm_config_prefix; nvm refuses to run until it is cleared.
unset npm_config_prefix

if [[ -z "${NVM_DIR:-}" ]]; then
  export NVM_DIR="$HOME/.nvm"
fi

if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
  echo "Node.js >= 22.2.0 required (found $(node -v 2>/dev/null || echo 'none'))." >&2
  echo "Install nvm, then run: cd hypericum-rsr && nvm install && nvm use" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "${NVM_DIR}/nvm.sh"
cd "$APP_DIR"
nvm install >/dev/null
nvm use >/dev/null

exec "$@"
