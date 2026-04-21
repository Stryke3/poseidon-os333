#!/usr/bin/env bash
# Same-day revenue path: bootstrap one billable order + submit claim via Core → EDI (dry-run OK).
#
# If Core is down: with POSEIDON_AUTO_START_STACK=1 (default), runs
#   docker compose up -d postgres redis minio core edi
# from the repo root, then waits for /ready (first pull can take several minutes).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CORE_API_URL="${CORE_API_URL:-http://127.0.0.1:8001}"
INTERNAL_API_KEY="${INTERNAL_API_KEY:-poseidon-local-internal-key}"
ORG_ID="${POSEIDON_ORG_ID:-00000000-0000-0000-0000-000000000001}"
POSEIDON_AUTO_START_STACK="${POSEIDON_AUTO_START_STACK:-1}"
READY_WAIT_SECS="${READY_WAIT_SECS:-300}"

core_ready() {
  curl -fsS -m 5 -H "Host: api.strykefox.com" "${CORE_API_URL%/}/ready" >/dev/null 2>&1
}

wait_for_core() {
  local i=0
  echo "Waiting for Core at ${CORE_API_URL} (up to ${READY_WAIT_SECS}s)..."
  while [ "$i" -lt "$READY_WAIT_SECS" ]; do
    if core_ready; then
      echo "Core is ready."
      return 0
    fi
    sleep 3
    i=$((i + 3))
  done
  echo "ERROR: Core did not become ready in time. Try: cd ${REPO_ROOT} && docker compose logs core edi --tail 100" >&2
  return 1
}

if ! core_ready; then
  if [ "${POSEIDON_AUTO_START_STACK}" = "1" ] && [ -f "${REPO_ROOT}/docker-compose.yml" ] && command -v docker >/dev/null 2>&1; then
    echo "Core not reachable — starting stack (postgres, redis, minio, core, edi)..."
    (cd "${REPO_ROOT}" && docker compose up -d postgres redis minio core edi)
    wait_for_core || exit 1
  else
    echo "ERROR: Cannot reach ${CORE_API_URL} (set CORE_API_URL or start stack manually)." >&2
    echo "  ${REPO_ROOT}: docker compose up -d postgres redis minio core edi" >&2
    exit 1
  fi
fi

BOOT_JSON=$(curl -fsS -X POST "${CORE_API_URL%/}/internal/revenue/bootstrap-order" \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Key: ${INTERNAL_API_KEY}" \
  -d "{
    \"org_id\": \"${ORG_ID}\",
    \"patient\": {\"first_name\": \"John\", \"last_name\": \"Doe\", \"date_of_birth\": \"1960-01-01\"},
    \"insurance\": {\"payer_name\": \"MEDICARE\", \"member_id\": \"123456789A\"},
    \"order\": {
      \"diagnoses\": [\"M17.11\"],
      \"line_items\": [{\"hcpcs_code\": \"L1833\", \"quantity\": 1}],
      \"referring_npi\": \"1234567890\"
    }
  }")

echo "bootstrap_order: ${BOOT_JSON}"
ORDER_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["order_id"])' "${BOOT_JSON}")

CLAIM_JSON=$(curl -fsS -X POST "${CORE_API_URL%/}/internal/billing/submit-claim-from-order" \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Key: ${INTERNAL_API_KEY}" \
  -d "{\"order_id\": \"${ORDER_ID}\"}")

echo "submit_claim: ${CLAIM_JSON}"
