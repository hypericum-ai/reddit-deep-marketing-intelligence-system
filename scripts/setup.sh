#!/usr/bin/env bash
# Fresh-clone setup for hypericum-rsr (Devvit app).
# Usage: bash scripts/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/hypericum-rsr"

bash "$ROOT/scripts/install-requirements.sh"

echo "==> Running tests"
cd "$APP_DIR"
npm run test

cat <<EOF

Setup complete.

Next steps (from hypericum-rsr/):
  1. npm run login     # Reddit Devvit auth (one-time; follow URL if headless SSH)
  2. npm run dev       # playtest on r/hypericum_rsr_dev
  3. In Reddit mod settings for the dev sub, set Gemini API key (aistudio.google.com)

Optional:
  npm run preview-test-post   # score eval post locally
  npm run build               # production bundle

No .env file is required for the Devvit app. Gemini key lives in subreddit mod settings.

EOF
