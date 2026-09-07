#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export CATALYST_PROVIDER_MODE="${CATALYST_PROVIDER_MODE:-live}"
export CATALYST_WEB_PORT="${CATALYST_WEB_PORT:-5190}"
export CATALYST_API_PORT="${CATALYST_API_PORT:-5191}"
export CATALYST_DATA_DIR="${CATALYST_DATA_DIR:-apps/api/.data/live}"

cd "$ROOT_DIR"

npm run build
exec npx concurrently -k -n api,web "npx tsx apps/api/src/server.ts" "npm run preview -w apps/web"
