#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${ROOT_DIR}/backups/stateful"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

fail() {
  printf '[state-backup] FAIL: %s\n' "$1" >&2
  exit 1
}

log() {
  printf '[state-backup] %s\n' "$1"
}

mkdir -p "${OUTPUT_DIR}"

backup_from_service() {
  local service="$1"
  local source_path="$2"
  local archive_name="$3"

  docker compose ps "${service}" >/dev/null 2>&1 || fail "${service} service is not running"

  log "Backing up ${service}:${source_path}"
  docker compose exec -T "${service}" tar -czf - -C "${source_path}" . > "${OUTPUT_DIR}/${archive_name}"
  [[ -s "${OUTPUT_DIR}/${archive_name}" ]] || fail "${archive_name} is empty"
  shasum -a 256 "${OUTPUT_DIR}/${archive_name}" > "${OUTPUT_DIR}/${archive_name}.sha256"
}

backup_from_service minio /data minio-data.tar.gz
backup_from_service redis /data redis-data.tar.gz
backup_from_service trident /app/models training-models.tar.gz

log "Stateful storage backup complete: ${OUTPUT_DIR}"
