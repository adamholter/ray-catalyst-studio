#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export CATALYST_PROVIDER_MODE="${CATALYST_PROVIDER_MODE:-live}"
export CATALYST_WEB_PORT="${CATALYST_WEB_PORT:-5190}"
export CATALYST_API_PORT="${CATALYST_API_PORT:-5191}"
export CATALYST_DATA_DIR="${CATALYST_DATA_DIR:-apps/api/.data/live}"

cd "$ROOT_DIR"

if [[ -z "${FAL_KEY:-}" ]] && command -v security >/dev/null 2>&1; then
  FAL_KEY="$(security find-generic-password -s ironwood_fal_api_key -w 2>/dev/null || true)"
  export FAL_KEY
fi

npm run build
exec npx concurrently -k -n api,web "npx tsx apps/api/src/server.ts" "npm run preview -w apps/web"
