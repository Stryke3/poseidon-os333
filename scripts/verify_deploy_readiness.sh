#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
STRICT_ENV=0

for arg in "$@"; do
  case "$arg" in
    --strict-env)
      STRICT_ENV=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

log() {
  printf '[verify] %s\n' "$1"
}

fail() {
  printf '[verify] FAIL: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

frontend_has_build_toolchain() {
  [[ -x "${FRONTEND_DIR}/node_modules/.bin/next" ]]
}

clear_frontend_build_artifacts() {
  local build_dir="${FRONTEND_DIR}/.next"
  local quarantine_dir="/tmp/poseidon-next-$RANDOM-$$"

  [[ -e "$build_dir" ]] || return 0

  if rm -rf "$build_dir" 2>/dev/null; then
    return 0
  fi

  log "Falling back to quarantining stale frontend build artifacts"
  mv "$build_dir" "$quarantine_dir"
  rm -rf "$quarantine_dir"
}

check_env_file() {
  local env_file="${ROOT_DIR}/.env"
  if [[ ! -f "$env_file" ]]; then
    if [[ "$STRICT_ENV" -eq 1 ]]; then
      fail "Missing .env while running in strict mode"
    fi
    log ".env not present; skipping runtime secret validation"
    return
  fi

  local placeholders
  if command -v rg >/dev/null 2>&1; then
    placeholders="$(rg -n 'CHANGE_ME|replace_with_|your_key_here' "$env_file" || true)"
  else
    placeholders="$(grep -nE 'CHANGE_ME|replace_with_|your_key_here' "$env_file" || true)"
  fi
  if [[ -n "$placeholders" ]]; then
    if [[ "$STRICT_ENV" -eq 1 ]]; then
      printf '%s\n' "$placeholders" >&2
      fail ".env contains placeholder values"
    fi
    log ".env contains placeholder values; strict validation not enabled"
  else
    log ".env secrets do not contain placeholder markers"
  fi
}

validate_strict_env() {
  if [[ "$STRICT_ENV" -eq 1 ]]; then
    log "Running strict production env validation"
    (
      cd "$ROOT_DIR"
      bash scripts/validate_production_env.sh
    )
  fi
}

log "Checking required tools"
require_cmd python3
require_cmd npm
require_cmd bash

check_env_file
validate_strict_env

log "Auditing container image pinning"
(
  cd "$ROOT_DIR"
  bash scripts/check_container_pins.sh >/tmp/poseidon-container-pins.out
)

if [[ -f "${ROOT_DIR}/docker-compose.yml" ]]; then
  log "Docker Compose definition detected (canonical full-stack runtime)"
else
  fail "Missing docker-compose.yml"
fi

log "Validating Compose file"
(
  cd "$ROOT_DIR"
  docker compose config -q
)

log "Compiling Python services for syntax validation"
(
  cd "$ROOT_DIR"
  PYTHONPYCACHEPREFIX=/tmp/poseidon-pycache python3 -m compileall \
    services/shared/base.py \
    services/core \
    services/trident \
    services/intake \
    services/ml >/tmp/poseidon-compileall.out
)

if [[ ! -d "${FRONTEND_DIR}/node_modules" || "${FRONTEND_DIR}/package-lock.json" -nt "${FRONTEND_DIR}/node_modules" || ! frontend_has_build_toolchain ]]; then
  log "Installing frontend dependencies deterministically"
  (
    cd "$FRONTEND_DIR"
    npm ci
  )
else
  log "Reusing existing frontend node_modules"
fi

frontend_has_build_toolchain || fail "frontend dependencies are incomplete; npm ci did not produce a usable Next.js toolchain"

log "Clearing frontend build artifacts"
clear_frontend_build_artifacts

log "Running frontend production build"
(
  cd "$FRONTEND_DIR"
  npm run build
)

log "Deploy readiness verification passed"
