#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  printf '[state-restore] FAIL: %s\n' "$1" >&2
  exit 1
}

log() {
  printf '[state-restore] %s\n' "$1"
}

[[ $# -eq 1 ]] || fail "Usage: bash scripts/restore_stateful_storage.sh <backup-directory>"

BACKUP_DIR="$1"
[[ -d "${BACKUP_DIR}" ]] || fail "Backup directory not found: ${BACKUP_DIR}"

verify_checksum() {
  local file_name="$1"
  if [[ -f "${BACKUP_DIR}/${file_name}.sha256" ]]; then
    (cd "${BACKUP_DIR}" && shasum -a 256 -c "${file_name}.sha256")
  else
    log "Checksum file missing for ${file_name}; continuing without verification"
  fi
}

restore_to_service() {
  local service="$1"
  local target_path="$2"
  local archive_name="$3"

  [[ -f "${BACKUP_DIR}/${archive_name}" ]] || fail "Missing archive ${archive_name}"
  docker compose ps "${service}" >/dev/null 2>&1 || fail "${service} service is not running"

  verify_checksum "${archive_name}"

  log "Restoring ${archive_name} into ${service}:${target_path}"
  cat "${BACKUP_DIR}/${archive_name}" | docker compose exec -T "${service}" sh -lc \
    "rm -rf ${target_path:?}/* && mkdir -p ${target_path} && tar -xzf - -C ${target_path}"
}

restore_to_service minio /data minio-data.tar.gz
restore_to_service redis /data redis-data.tar.gz
restore_to_service trident /app/models training-models.tar.gz

log "Stateful storage restore complete"
