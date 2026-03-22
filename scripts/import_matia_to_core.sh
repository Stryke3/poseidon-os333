#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
PAYLOAD_FILE="/tmp/matia_import_payload.json"
CORE_BASE_URL="http://127.0.0.1:80"
CORE_HOST_HEADER="api.strykefox.com"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! -f "${PAYLOAD_FILE}" ]]; then
  echo "Missing ${PAYLOAD_FILE}" >&2
  exit 1
fi

CORE_EMAIL="$(grep '^CORE_API_EMAIL=' "${ENV_FILE}" | cut -d= -f2-)"
CORE_PASSWORD="$(grep '^CORE_API_PASSWORD=' "${ENV_FILE}" | cut -d= -f2-)"
INTERNAL_API_KEY="$(grep '^INTERNAL_API_KEY=' "${ENV_FILE}" | cut -d= -f2-)"

AUTH_BODY_FILE="$(mktemp)"
AUTH_RESPONSE_FILE="$(mktemp)"
IMPORT_RESPONSE_FILE="$(mktemp)"
trap 'rm -f "${AUTH_BODY_FILE}" "${AUTH_RESPONSE_FILE}" "${IMPORT_RESPONSE_FILE}"' EXIT

printf '{"email":"%s","password":"%s"}' "${CORE_EMAIL}" "${CORE_PASSWORD}" > "${AUTH_BODY_FILE}"

curl -sS \
  -H "Host: ${CORE_HOST_HEADER}" \
  -H 'Content-Type: application/json' \
  -X POST \
  "${CORE_BASE_URL}/auth/login" \
  --data @"${AUTH_BODY_FILE}" \
  > "${AUTH_RESPONSE_FILE}"

TOKEN="$(sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p' "${AUTH_RESPONSE_FILE}")"

if [[ -z "${TOKEN}" ]]; then
  echo "Failed to authenticate against Core API" >&2
  cat "${AUTH_RESPONSE_FILE}" >&2
  exit 1
fi

curl -sS \
  -H "Host: ${CORE_HOST_HEADER}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Internal-API-Key: ${INTERNAL_API_KEY}" \
  -H 'Content-Type: application/json' \
  -X POST \
  "${CORE_BASE_URL}/orders/import" \
  --data @"${PAYLOAD_FILE}" \
  > "${IMPORT_RESPONSE_FILE}"

cat "${IMPORT_RESPONSE_FILE}"
