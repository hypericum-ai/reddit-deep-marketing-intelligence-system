#!/usr/bin/env bash
# Devvit login opens a local OAuth callback server on port 65010.
# A stale node process from a failed login can block the next attempt.
set -euo pipefail

PORT=65010

if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -ti :"${PORT}" 2>/dev/null || true)"
  if [[ -n "${PIDS}" ]]; then
    echo "Freeing Devvit auth port ${PORT} (stale PID: ${PIDS})…"
    # shellcheck disable=SC2086
    kill ${PIDS} 2>/dev/null || true
    sleep 0.5
  fi
fi

if command -v ss >/dev/null 2>&1 && ss -tln | grep -q ":${PORT} "; then
  echo "Warning: port ${PORT} is still in use. Stop the process manually, then retry." >&2
  exit 1
fi
