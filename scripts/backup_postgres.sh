#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
BACKUP_ROOT="${ROOT_DIR}/backups/postgres"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

fail() {
  printf '[backup] FAIL: %s\n' "$1" >&2
  exit 1
}

log() {
  printf '[backup] %s\n' "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

[[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}"

set -a
source "${ENV_FILE}"
set +a

: "${POSTGRES_USER:?POSTGRES_USER must be set in .env}"
: "${POSTGRES_DB:?POSTGRES_DB must be set in .env}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}"

require_cmd pg_dump

DB_URL="${DATABASE_URL:-}"
if [[ -z "${DB_URL}" ]]; then
  DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-localhost}:${POSTGRES_PORT:-5432}/${POSTGRES_DB}"
fi

mkdir -p "${BACKUP_ROOT}"
OUTPUT_FILE="${BACKUP_ROOT}/${POSTGRES_DB}-${TIMESTAMP}.dump"

log "Writing ${OUTPUT_FILE}"
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  "${DB_URL}" > "${OUTPUT_FILE}"

[[ -s "${OUTPUT_FILE}" ]] || fail "Backup file is empty"
shasum -a 256 "${OUTPUT_FILE}" > "${OUTPUT_FILE}.sha256"

log "Backup complete"
