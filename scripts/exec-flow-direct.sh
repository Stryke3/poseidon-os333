#!/usr/bin/env bash
# Direct Core + EDI calls (no Next.js session). Set env before running.
#
#   export CORE_URL="http://127.0.0.1:8001"
#   export EDI_URL="http://127.0.0.1:8006"
#   export INTERNAL_API_KEY="your-internal-key"
#   export POSEIDON_EMAIL="admin@example.com"
#   export POSEIDON_PASSWORD="secret"
#
# Optional: export SUBMISSION_METHOD=stedi_api on the EDI service and STEDI_API_KEY.

set -euo pipefail

CORE_URL="${CORE_URL:-http://127.0.0.1:8001}"
EDI_URL="${EDI_URL:-http://127.0.0.1:8006}"

if [[ -z "${POSEIDON_EMAIL:-}" || -z "${POSEIDON_PASSWORD:-}" ]]; then
  echo "Set POSEIDON_EMAIL and POSEIDON_PASSWORD" >&2
  exit 1
fi

echo "=== 0 · Login ==="
LOGIN_JSON="$(curl -sS -X POST "${CORE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${POSEIDON_EMAIL}\",\"password\":\"${POSEIDON_PASSWORD}\"}")"

TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' <<<"$LOGIN_JSON")"
if [[ -z "$TOKEN" ]]; then
  echo "$LOGIN_JSON"
  echo "Login failed" >&2
  exit 1
fi

AUTH=( -H "Authorization: Bearer ${TOKEN}" )

echo "=== 1 · Create patient ==="
PATIENT_JSON="$(curl -sS -X POST "${CORE_URL}/api/v1/patients" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name":"Script",
    "last_name":"Patient",
    "date_of_birth":"1980-01-15",
    "insurances":[{"payer_name":"Script Payer","member_id":"MEM999","is_primary":true}]
  }')"
PATIENT_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))' <<<"$PATIENT_JSON")"
echo "$PATIENT_JSON"
if [[ -z "$PATIENT_ID" ]]; then
  echo "Patient create failed" >&2
  exit 1
fi

DOS="$(date +%Y-%m-%d)"
echo "=== 2 · Create order (EDI) ==="
ORDER_JSON="$(curl -sS -X POST "${CORE_URL}/api/v1/orders" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{
    \"patient_id\":\"${PATIENT_ID}\",
    \"claim_strategy\":\"EDI\",
    \"status\":\"intake\",
    \"date_of_service\":\"${DOS}\",
    \"diagnoses\":[{\"icd10_code\":\"Z00.00\",\"is_primary\":true,\"sequence\":1}],
    \"line_items\":[{\"hcpcs_code\":\"E0110\",\"quantity\":1,\"billed_amount\":150.0}]
  }")"
ORDER_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))' <<<"$ORDER_JSON")"
echo "$ORDER_JSON"
if [[ -z "$ORDER_ID" ]]; then
  echo "Order create failed" >&2
  exit 1
fi

echo "=== 3 · Generate SWO PDF ==="
curl -sS -X POST "${CORE_URL}/api/v1/orders/${ORDER_ID}/generate/swo" "${AUTH[@]}" | python3 -m json.tool || true

echo "=== 4 · Upload signed SWO (placeholder bytes) ==="
echo "%PDF-1.4 signed placeholder" > /tmp/poseidon-signed-swo.pdf
curl -sS -X POST "${CORE_URL}/api/v1/orders/${ORDER_ID}/documents" "${AUTH[@]}" \
  -F "doc_type=signed_swo" \
  -F "file=@/tmp/poseidon-signed-swo.pdf;type=application/pdf" | python3 -m json.tool || true

EDI_AUTH=()
if [[ -n "${INTERNAL_API_KEY:-}" ]]; then
  EDI_AUTH=( -H "X-Internal-API-Key: ${INTERNAL_API_KEY}" )
fi

echo "=== 5 · Build claim (validate) ==="
curl -sS -X POST "${EDI_URL}/api/v1/claims/validate/${ORDER_ID}" "${AUTH[@]}" "${EDI_AUTH[@]}" \
  -H "Content-Type: application/json" | python3 -m json.tool || true

echo "=== 6 · Submit to Stedi ==="
curl -sS -X POST "${EDI_URL}/api/v1/claims/submit/${ORDER_ID}" "${AUTH[@]}" "${EDI_AUTH[@]}" \
  -H "Content-Type: application/json" | python3 -m json.tool || true

echo "Done. patient_id=${PATIENT_ID} order_id=${ORDER_ID}"
