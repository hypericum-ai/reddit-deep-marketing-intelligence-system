#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

bash scripts/free-devvit-auth-port.sh

echo "Building client + server…"
npm run build

if ! devvit whoami >/dev/null 2>&1; then
  echo ""
  echo "Devvit is not logged in on this machine."
  echo ""
  echo "SSH playtest needs OAuth on port 65010. From your laptop, connect with:"
  echo "  ssh -L 65010:localhost:65010 tigisty@<this-host>"
  echo ""
  echo "Then in that SSH session run:"
  echo "  cd ~/reddit-deep-marketing-intelligence-system/hypericum-rsr"
  echo "  npm run login"
  echo "  (open the Reddit URL in your laptop browser; callback hits localhost:65010)"
  echo ""
  echo "After login succeeds, run: npm run dev"
  exit 1
fi

echo "Starting playtest…"
exec devvit playtest "$@"
