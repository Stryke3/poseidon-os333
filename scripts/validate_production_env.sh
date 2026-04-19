#!/usr/bin/env bash

# =============================================================================
# validate_production_env.sh
# Strict production env gate. Run before any compose build/up in production.
#
# Philosophy:
#   - Fail loudly, never silently.
#   - Cover every secret, every URL, every safety flag that a live production
#     deployment actually depends on.
#   - Do not print secret values on failure; only names.
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

PLACEHOLDER_PATTERN='CHANGE_ME|replace_with_|your_key_here|PASTE_YOUR|key_your_stedi_api_key_here'

# Core required secrets
REQUIRED_VARS=(
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_DB
  REDIS_PASSWORD
  REDIS_URL
  JWT_SECRET
  SECRET_KEY
  POSEIDON_API_KEY
  INTERNAL_API_KEY
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  MINIO_BUCKET
  NEXTAUTH_SECRET
  NEXTAUTH_URL
  CORE_API_EMAIL
  CORE_API_PASSWORD
  CORS_ALLOW_ORIGINS
  TRUSTED_HOSTS
  DOMAIN
  ENVIRONMENT
)

# Optional but if present must not contain placeholder text
OPTIONAL_SECRET_VARS=(
  AVAILITY_CLIENT_ID
  AVAILITY_CLIENT_SECRET
  AVAILITY_SFTP_USER
  AVAILITY_SFTP_PASS
  DROPBOX_SIGN_API_KEY
  DROPBOX_SIGN_WEBHOOK_SECRET
  GMAIL_OAUTH_CLIENT_ID
  GMAIL_OAUTH_CLIENT_SECRET
  GMAIL_OAUTH_REFRESH_TOKEN
  STEDI_API_KEY
  SINCH_PROJECT_ID
  SINCH_KEY_ID
  SINCH_KEY_SECRET
  SINCH_WEBHOOK_SECRET
  ANTHROPIC_API_KEY
  OPENAI_API_KEY
  POSEIDON_DATABASE_URL
  DATABASE_URL
  SENTRY_DSN
)

# Min-length requirements for crypto-grade secrets.
MIN_LEN_VARS=(
  JWT_SECRET
  SECRET_KEY
  POSEIDON_API_KEY
  INTERNAL_API_KEY
  NEXTAUTH_SECRET
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  POSTGRES_PASSWORD
  REDIS_PASSWORD
  CORE_API_PASSWORD
)

fail() {
  printf '[env] FAIL: %s\n' "$1" >&2
  exit 1
}

log() {
  printf '[env] %s\n' "$1"
}

[[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}"

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

get_var() {
  local key="$1"
  printenv "$key" || true
}

has_placeholder() {
  local value="$1"
  [[ "${value}" =~ ${PLACEHOLDER_PATTERN} ]]
}

# ---------------------------------------------------------------------------
# Required presence + placeholder check
# ---------------------------------------------------------------------------
for key in "${REQUIRED_VARS[@]}"; do
  value="$(get_var "$key")"
  [[ -n "${value}" ]] || fail "${key} must be set"
  if has_placeholder "${value}"; then
    fail "${key} still contains a placeholder value"
  fi
done

# ---------------------------------------------------------------------------
# Min-length for crypto-grade secrets
# ---------------------------------------------------------------------------
for key in "${MIN_LEN_VARS[@]}"; do
  value="$(get_var "$key")"
  if [[ "${#value}" -lt 32 ]]; then
    fail "${key} must be at least 32 characters"
  fi
done

# ---------------------------------------------------------------------------
# ENVIRONMENT + HTTPS constraints
# ---------------------------------------------------------------------------
[[ "${ENVIRONMENT:-production}" == "production" ]] || fail "ENVIRONMENT must be production for production validation"
[[ "${PHI_IN_LOGS:-false}" == "false" ]] || fail "PHI_IN_LOGS must remain false in production"
[[ "${CORS_ALLOW_ORIGINS}" != *"http://localhost"* ]] || fail "CORS_ALLOW_ORIGINS must not include localhost in production"
[[ "${CORS_ALLOW_ORIGINS}" != *"http://127.0.0.1"* ]] || fail "CORS_ALLOW_ORIGINS must not include 127.0.0.1 in production"

for url_var in NEXTAUTH_URL; do
  value="$(get_var "$url_var")"
  [[ "${value}" == https://* ]] || fail "${url_var} must use https in production"
done

# ---------------------------------------------------------------------------
# Optional secrets: if present, must not be placeholders
# ---------------------------------------------------------------------------
for key in "${OPTIONAL_SECRET_VARS[@]}"; do
  value="$(get_var "$key")"
  if [[ -n "${value}" ]] && has_placeholder "${value}"; then
    fail "${key} contains a placeholder value"
  fi
done

# ---------------------------------------------------------------------------
# Database URL shape
# ---------------------------------------------------------------------------
db_url_value="$(get_var "POSEIDON_DATABASE_URL")"
[[ -n "${db_url_value}" ]] || db_url_value="$(get_var "DATABASE_URL")"
if [[ -n "${db_url_value}" ]]; then
  case "${db_url_value}" in
    postgresql://*|postgres://*)
      :
      ;;
    *)
      fail "DATABASE_URL / POSEIDON_DATABASE_URL must start with postgresql:// or postgres://"
      ;;
  esac
fi

# ---------------------------------------------------------------------------
# Trident learning flags
# ---------------------------------------------------------------------------
trident_mode="$(get_var "TRIDENT_LEARNING_MODE")"
case "${trident_mode:-continuous}" in
  off|manual|continuous|full)
    :
    ;;
  *)
    fail "TRIDENT_LEARNING_MODE must be one of: off, manual, continuous, full"
    ;;
esac

trident_interval="$(get_var "TRIDENT_LEARNING_INTERVAL_MINUTES")"
if [[ -n "${trident_interval}" ]]; then
  if ! [[ "${trident_interval}" =~ ^[0-9]+$ ]] || (( trident_interval < 5 )); then
    fail "TRIDENT_LEARNING_INTERVAL_MINUTES must be an integer >= 5"
  fi
fi

# ---------------------------------------------------------------------------
# Intake OCR threshold (must be 0..1)
# ---------------------------------------------------------------------------
ocr_threshold="$(get_var "INTAKE_OCR_CONFIDENCE_THRESHOLD")"
if [[ -n "${ocr_threshold}" ]]; then
  if ! awk "BEGIN { exit !(${ocr_threshold} >= 0 && ${ocr_threshold} <= 1) }" 2>/dev/null; then
    fail "INTAKE_OCR_CONFIDENCE_THRESHOLD must be a decimal in [0,1]"
  fi
fi

# ---------------------------------------------------------------------------
# EDI safety invariants
#   - ISA_TEST_INDICATOR must be T or P
#   - If EDI_DRY_RUN=false and SUBMISSION_METHOD=stedi_api, STEDI_API_KEY must be set and not placeholder
#   - If SUBMISSION_METHOD=availity_sftp, AVAILITY_SFTP_* must be set
#   - If ISA_TEST_INDICATOR=P and EDI_DRY_RUN=false, billing provider identity must be populated
# ---------------------------------------------------------------------------
isa_test="$(get_var "ISA_TEST_INDICATOR")"
case "${isa_test:-T}" in
  T|P) : ;;
  *) fail "ISA_TEST_INDICATOR must be T (test) or P (production)" ;;
esac

edi_dry="$(get_var "EDI_DRY_RUN")"
edi_method="$(get_var "SUBMISSION_METHOD")"
edi_dry_effective="${edi_dry:-true}"

if [[ "${edi_dry_effective}" == "false" ]]; then
  case "${edi_method:-stedi_api}" in
    stedi_api)
      stedi_key="$(get_var "STEDI_API_KEY")"
      [[ -n "${stedi_key}" ]] || fail "STEDI_API_KEY must be set when EDI_DRY_RUN=false and SUBMISSION_METHOD=stedi_api"
      has_placeholder "${stedi_key}" && fail "STEDI_API_KEY contains a placeholder"
      ;;
    availity_sftp)
      for key in AVAILITY_SFTP_HOST AVAILITY_SFTP_USER AVAILITY_SFTP_PASS AVAILITY_CUSTOMER_ID; do
        value="$(get_var "$key")"
        [[ -n "${value}" ]] || fail "${key} must be set when SUBMISSION_METHOD=availity_sftp and EDI_DRY_RUN=false"
      done
      ;;
    *)
      fail "SUBMISSION_METHOD must be stedi_api or availity_sftp"
      ;;
  esac

  if [[ "${isa_test}" == "P" ]]; then
    for key in BILLING_NPI BILLING_TAX_ID BILLING_ORG_NAME; do
      value="$(get_var "$key")"
      [[ -n "${value}" ]] || fail "${key} must be populated when ISA_TEST_INDICATOR=P and EDI_DRY_RUN=false"
    done
  fi
fi

# ---------------------------------------------------------------------------
# Billing-authority safety flags
# ---------------------------------------------------------------------------
require_billing_ready="$(get_var "BILLING_CLAIM_REQUIRE_BILLING_READY")"
block_dup="$(get_var "BILLING_CLAIM_BLOCK_DUPLICATE_SUBMISSION")"
for pair in \
  "BILLING_CLAIM_REQUIRE_BILLING_READY|${require_billing_ready:-true}" \
  "BILLING_CLAIM_BLOCK_DUPLICATE_SUBMISSION|${block_dup:-true}"
do
  name="${pair%%|*}"
  value="${pair##*|}"
  case "${value}" in
    true|false) : ;;
    *) fail "${name} must be 'true' or 'false'" ;;
  esac
done
if [[ "${require_billing_ready:-true}" == "false" ]]; then
  fail "BILLING_CLAIM_REQUIRE_BILLING_READY must be true in production"
fi

# ---------------------------------------------------------------------------
# Redis URL must match password
# ---------------------------------------------------------------------------
redis_url="$(get_var "REDIS_URL")"
redis_pw="$(get_var "REDIS_PASSWORD")"
if [[ -n "${redis_url}" && -n "${redis_pw}" && "${redis_url}" != *"${redis_pw}"* ]]; then
  fail "REDIS_URL does not appear to embed REDIS_PASSWORD"
fi

log "Production environment validation passed"
