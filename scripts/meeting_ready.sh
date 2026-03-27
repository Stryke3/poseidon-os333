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
require_cmd docker
require_cmd bash
require_cmd curl
check_env_file

if [[ "$STRICT_ENV" -eq 1 ]]; then
  log "Validating production environment (strict mode)"
  bash scripts/validate_production_env.sh
  ok "Production env validation passed"
else
  warn "Strict env validation skipped (pass --strict-env to enforce production gates)"
fi

log "Validating compose configuration"
docker compose config >/tmp/poseidon-compose-config.out
ok "Compose config renders cleanly"

log "Building and starting the full stack"
docker compose up -d --build
ok "Compose stack started"

log "Waiting for service warmup"
sleep 12

ALL_OK=true

check_http() {
  local label="$1"
  local url="$2"
  local host_header="${3:-}"

  if [[ -n "$host_header" ]]; then
    if curl -sf -H "Host: ${host_header}" "$url" >/dev/null; then
      ok "$label"
      return 0
    fi
  else
    if curl -sf "$url" >/dev/null; then
      ok "$label"
      return 0
    fi
  fi

  warn "$label"
  ALL_OK=false
  return 1
}

log "Health checks"
check_http "nginx /healthz" "http://localhost/healthz"
check_http "core /ready (through nginx)" "http://localhost/ready" "api.strykefox.com"
check_http "dashboard /api/health" "http://localhost/api/health"

for pair in \
  "core:8001:/ready" \
  "trident:8002:/ready" \
  "intake:8003:/ready" \
  "ml:8004:/ready" \
  "availity:8005:/live" \
  "edi:8006:/health" \
  "dashboard:3000:/api/health"
do
  IFS=: read -r svc port path <<<"$pair"
  if docker compose exec -T "$svc" curl -sf "http://127.0.0.1:${port}${path}" >/dev/null 2>&1; then
    ok "${svc} ${path}"
  else
    warn "${svc} ${path}"
    ALL_OK=false
  fi
done

echo ""
if [[ "$ALL_OK" == true ]]; then
  printf "${GREEN}Meeting-ready: stack is up and healthy.${NC}\n"
  echo "Open: http://localhost"
  exit 0
fi

printf "${YELLOW}Stack started with warnings. Check logs:${NC}\n"
echo "  docker compose ps"
echo "  docker compose logs --tail=100 <service>"
exit 1
