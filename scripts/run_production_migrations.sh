#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd psql

: "${POSTGRES_USER:?POSTGRES_USER must be set in .env}"
: "${POSTGRES_DB:?POSTGRES_DB must be set in .env}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}"

DB_URL="${DATABASE_URL:-}"
if [[ -z "${DB_URL}" ]]; then
  DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-localhost}:${POSTGRES_PORT:-5432}/${POSTGRES_DB}"
fi

for migration in \
  "${ROOT_DIR}/scripts/migrations/001_add_pod_document_id.sql" \
  "${ROOT_DIR}/scripts/migrations/002_email_workflow_assignment.sql" \
  "${ROOT_DIR}/scripts/migrations/003_workflow_automation.sql" \
  "${ROOT_DIR}/scripts/migrations/004_fulfillment_billing_workflow.sql" \
  "${ROOT_DIR}/scripts/migrations/005_communications_feed.sql" \
  "${ROOT_DIR}/scripts/migrations/006_cleanup_import_dedup.sql" \
  "${ROOT_DIR}/scripts/migrations/007_patient_contact_dl_nok.sql" \
  "${ROOT_DIR}/scripts/migrations/008_dedup_orders_sorted_hcpcs.sql" \
  "${ROOT_DIR}/scripts/migrations/009_dedup_payment_outcomes.sql"
do
  echo "Applying $(basename "${migration}")"
  PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    "${DB_URL}" \
    -v ON_ERROR_STOP=1 \
    -f "${migration}"
done

echo "All Poseidon production migrations applied."
