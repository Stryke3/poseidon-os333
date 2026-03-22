#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

fail() {
  printf '[restore] FAIL: %s\n' "$1" >&2
  exit 1
}

log() {
  printf '[restore] %s\n' "$1"
}

[[ $# -eq 1 ]] || fail "Usage: bash scripts/restore_postgres.sh <backup.dump>"

BACKUP_FILE="$1"
[[ -f "${BACKUP_FILE}" ]] || fail "Backup file not found: ${BACKUP_FILE}"
[[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}"

set -a
source "${ENV_FILE}"
set +a

: "${POSTGRES_USER:?POSTGRES_USER must be set in .env}"
: "${POSTGRES_DB:?POSTGRES_DB must be set in .env}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}"

docker compose ps postgres >/dev/null 2>&1 || fail "postgres service is not running"

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  log "Verifying checksum"
  shasum -a 256 -c "${BACKUP_FILE}.sha256"
else
  log "Checksum file not present; continuing without integrity verification"
fi

log "Restoring ${BACKUP_FILE} into ${POSTGRES_DB}"
cat "${BACKUP_FILE}" | docker compose exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  postgres \
  pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}"

log "Restore complete"
