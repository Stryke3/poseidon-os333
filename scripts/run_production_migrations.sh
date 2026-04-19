#!/usr/bin/env bash

# =============================================================================
# run_production_migrations.sh
# Apply every numbered migration in scripts/migrations/ in lexical order.
#
# Every migration MUST be idempotent (CREATE … IF NOT EXISTS, ON CONFLICT …,
# DO $$ … IF NOT EXISTS, etc). This runner will apply them in order and fail
# loudly on the first error.
#
# Targets:
#   - DATABASE_URL if set (preferred; should point to the production DB)
#   - POSEIDON_DATABASE_URL (alternative production override)
#   - compose-local Postgres via POSTGRES_USER/PASSWORD/HOST/PORT/DB
#
# Usage:
#   bash scripts/run_production_migrations.sh
#   DRY_RUN=1 bash scripts/run_production_migrations.sh   # print plan only
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
MIGRATIONS_DIR="${ROOT_DIR}/scripts/migrations"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd psql

# Prefer explicit DB URL variables; fall back to composed URL from discrete vars.
DB_URL="${POSEIDON_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "${DB_URL}" ]]; then
  : "${POSTGRES_USER:?POSTGRES_USER must be set in .env if no DATABASE_URL}"
  : "${POSTGRES_DB:?POSTGRES_DB must be set in .env if no DATABASE_URL}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env if no DATABASE_URL}"
  DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-localhost}:${POSTGRES_PORT:-5432}/${POSTGRES_DB}"
fi

# Guard against leading/trailing whitespace.
DB_URL="${DB_URL//[[:space:]]/}"

# Collect migrations in lexical order — any *.sql under migrations/ is picked up.
# (macOS default bash 3.x does not support mapfile; use a portable while-read.)
migrations=()
while IFS= read -r line; do
  migrations+=("$line")
done < <(find "${MIGRATIONS_DIR}" -type f -name '*.sql' | LC_ALL=C sort)

if [[ "${#migrations[@]}" -eq 0 ]]; then
  echo "No migrations found in ${MIGRATIONS_DIR}" >&2
  exit 1
fi

# Detect numbering collisions: two files with the same NNN_ prefix.
# Portable across bash 3.2 (macOS) and bash 4+ (Linux).
prefix_tmp="$(mktemp -t poseidon-migrations-XXXXXX)"
trap 'rm -f "${prefix_tmp}"' EXIT
for m in "${migrations[@]}"; do
  base="$(basename "${m}")"
  prefix="${base%%_*}"
  if grep -q "^${prefix} " "${prefix_tmp}" 2>/dev/null; then
    other="$(grep "^${prefix} " "${prefix_tmp}" | awk '{print $2}')"
    echo "Migration numbering collision: ${other} vs ${base}" >&2
    exit 1
  fi
  printf '%s %s\n' "${prefix}" "${base}" >>"${prefix_tmp}"
done

echo "[migrations] plan:"
for m in "${migrations[@]}"; do
  echo "  - $(basename "${m}")"
done

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[migrations] DRY_RUN=1 — no DB changes applied."
  exit 0
fi

echo "[migrations] target: ${DB_URL%%@*}@<redacted>"

for migration in "${migrations[@]}"; do
  echo "[migrations] applying $(basename "${migration}")"
  PGPASSWORD="${POSTGRES_PASSWORD:-}" psql \
    "${DB_URL}" \
    -v ON_ERROR_STOP=1 \
    -f "${migration}"
done

echo "[migrations] all production migrations applied."
