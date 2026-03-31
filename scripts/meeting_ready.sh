#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
STRICT_ENV=0

for arg in "$@"; do
  case "$arg" in
    --strict-env)
      STRICT_ENV=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: bash scripts/meeting_ready.sh [--strict-env]" >&2
      exit 1
      ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { printf "${CYAN}[meeting-ready]${NC} %s\n" "$1"; }
ok() { printf "  ${GREEN}OK${NC} %s\n" "$1"; }
warn() { printf "  ${YELLOW}WARN${NC} %s\n" "$1"; }
fail() { printf "  ${RED}FAIL${NC} %s\n" "$1"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

check_env_file() {
  if [[ ! -f .env ]]; then
    fail ".env is missing (copy from .env.template and fill secrets)"
  fi

  local placeholders
  if command -v rg >/dev/null 2>&1; then
    placeholders="$(rg -n 'CHANGE_ME|replace_with_|your_key_here|REPLACE_ME|scope_one scope_two' .env || true)"
  else
    placeholders="$(grep -nE 'CHANGE_ME|replace_with_|your_key_here|REPLACE_ME|scope_one scope_two' .env || true)"
  fi
  if [[ -n "$placeholders" ]]; then
    printf '%s\n' "$placeholders"
    fail ".env still has placeholder values"
  fi
  ok ".env placeholders cleared"
}

log "Preflight checks"
require_cmd bash
check_env_file

if [[ "$STRICT_ENV" -eq 1 ]]; then
  log "Validating production environment (strict mode)"
  bash scripts/validate_production_env.sh
  ok "Production env validation passed"
else
  warn "Strict env validation skipped (pass --strict-env to enforce production gates)"
fi

log "Running Render-first repo validation"
bash scripts/verify_deploy_readiness.sh
ok "Repo validation passed"

echo ""
printf "${GREEN}Meeting-ready: repo validation passed and production ownership lives in Render.${NC}\n"
echo "Next:"
echo "  1. Push the current branch to GitHub"
echo "  2. Confirm Render service env vars and health checks"
echo "  3. Review Render deploy logs for core, dashboard, and sibling services"
