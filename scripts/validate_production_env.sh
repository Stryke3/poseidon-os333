#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

PLACEHOLDER_PATTERN='CHANGE_ME|replace_with_|your_key_here'
REQUIRED_VARS=(
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_DB
  REDIS_PASSWORD
  JWT_SECRET
  SECRET_KEY
  POSEIDON_API_KEY
  INTERNAL_API_KEY
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  NEXTAUTH_SECRET
  NEXTAUTH_URL
  CORE_API_EMAIL
  CORE_API_PASSWORD
  CORS_ALLOW_ORIGINS
  TRUSTED_HOSTS
  DOMAIN
)

OPTIONAL_SECRET_VARS=(
  AVAILITY_CLIENT_ID
  AVAILITY_CLIENT_SECRET
  DROPBOX_SIGN_API_KEY
  DROPBOX_SIGN_WEBHOOK_SECRET
  GMAIL_OAUTH_CLIENT_ID
  GMAIL_OAUTH_CLIENT_SECRET
  GMAIL_OAUTH_REFRESH_TOKEN
  STEDI_API_KEY
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
source "${ENV_FILE}"
set +a

get_var() {
  local key="$1"
  printenv "$key" || true
}

for key in "${REQUIRED_VARS[@]}"; do
  value="$(get_var "$key")"
  [[ -n "${value}" ]] || fail "${key} must be set"
  if [[ "${value}" =~ ${PLACEHOLDER_PATTERN} ]]; then
    fail "${key} still contains a placeholder value"
  fi
done

for key in JWT_SECRET SECRET_KEY POSEIDON_API_KEY INTERNAL_API_KEY NEXTAUTH_SECRET MINIO_ACCESS_KEY MINIO_SECRET_KEY POSTGRES_PASSWORD REDIS_PASSWORD CORE_API_PASSWORD; do
  value="$(get_var "$key")"
  if [[ "${#value}" -lt 32 ]]; then
    fail "${key} must be at least 32 characters"
  fi
done

[[ "${ENVIRONMENT:-production}" == "production" ]] || fail "ENVIRONMENT must be production for production validation"
[[ "${PHI_IN_LOGS:-false}" == "false" ]] || fail "PHI_IN_LOGS must remain false in production"
[[ "${CORS_ALLOW_ORIGINS}" != *"http://localhost"* ]] || fail "CORS_ALLOW_ORIGINS must not include localhost in production"
[[ "${CORS_ALLOW_ORIGINS}" != *"http://127.0.0.1"* ]] || fail "CORS_ALLOW_ORIGINS must not include 127.0.0.1 in production"

for url_var in NEXTAUTH_URL; do
  value="$(get_var "$url_var")"
  [[ "${value}" == https://* ]] || fail "${url_var} must use https in production"
done

for key in "${OPTIONAL_SECRET_VARS[@]}"; do
  value="$(get_var "$key")"
  if [[ -n "${value}" && "${value}" =~ ${PLACEHOLDER_PATTERN} ]]; then
    fail "${key} contains a placeholder value"
  fi
done

log "Production environment validation passed"
