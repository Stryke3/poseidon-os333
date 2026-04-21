#!/usr/bin/env bash
# End-to-end smoke test: Poseidon Lite API (patient CRUD, upload, generate, list).
# Requires: lite service reachable (default http://127.0.0.1:8010) and INTERNAL_API_KEY.
#
# Usage:
#   ./scripts/e2e_lite.sh
#   LITE_URL=http://lite:8010 INTERNAL_API_KEY=... ./scripts/e2e_lite.sh
#
set -euo pipefail

LITE_URL="${LITE_URL:-http://127.0.0.1:8010}"
LITE_URL="${LITE_URL%/}"

# Prefer explicit env; else try the local Compose container (matches .env when not the compose default).
if [[ -n "${INTERNAL_API_KEY:-}" ]]; then
  KEY="${INTERNAL_API_KEY}"
elif command -v docker >/dev/null 2>&1 && docker exec poseidon_lite printenv INTERNAL_API_KEY >/dev/null 2>&1; then
  KEY="$(docker exec poseidon_lite printenv INTERNAL_API_KEY)"
else
  KEY="poseidon-local-internal-key"
fi

hdr=(-H "X-Internal-API-Key: ${KEY}" -H "Content-Type: application/json")

die() { echo "E2E FAIL: $*" >&2; exit 1; }

echo "=== Poseidon Lite E2E (${LITE_URL}) ==="

curl -fsS "${LITE_URL}/health" >/dev/null || die "lite /health"

echo "--- create patient ---"
CREATE_JSON='{"first_name":"E2E","last_name":"Patient","dob":"1990-01-15","phone":"5551234567","email":"e2e@example.com","payer_name":"TestPayer","member_id":"MBR-E2E-1","ordering_provider":"Dr. Test","diagnosis_codes":["M54.5"],"hcpcs_codes":["E0163"],"notes":"e2e run"}'
RESP=$(curl -fsS "${hdr[@]}" -X POST "${LITE_URL}/patients" -d "${CREATE_JSON}") || die "POST /patients"
PID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "${RESP}") || die "parse patient id"
echo "patient_id=${PID}"

echo "--- list patients (search) ---"
curl -fsS "${hdr[@]}" "${LITE_URL}/patients?q=E2E" | python3 -c "import json,sys; d=json.load(sys.stdin); assert any(x.get('last_name')=='Patient' for x in d), d" || die "GET /patients?q="

echo "--- update patient ---"
curl -fsS "${hdr[@]}" -X PUT "${LITE_URL}/patients/${PID}" \
  -d '{"notes":"updated by e2e"}' >/dev/null || die "PUT /patients/{id}"

TMP=$(mktemp)
printf 'E2E intake attachment\n' > "${TMP}"
echo "--- upload document ---"
curl -fsS -H "X-Internal-API-Key: ${KEY}" \
  -F "category=intake" \
  -F "file=@${TMP};type=text/plain;filename=e2e-intake.txt" \
  "${LITE_URL}/patients/${PID}/documents" >/dev/null || die "POST documents"
rm -f "${TMP}"

echo "--- generate documents (sync) ---"
for kind in swo transmittal checklist billing-summary; do
  curl -fsS "${hdr[@]}" -X POST "${LITE_URL}/patients/${PID}/generate/${kind}" >/dev/null || die "POST generate/${kind}"
  echo "  ok ${kind}"
done

echo "--- verify generated + uploads ---"
UP=$(curl -fsS "${hdr[@]}" "${LITE_URL}/patients/${PID}/documents") || die "GET documents"
GEN=$(curl -fsS "${hdr[@]}" "${LITE_URL}/patients/${PID}/generated") || die "GET generated"
export UP GEN
python3 <<'PY' || die "verify counts"
import json, os
up = json.loads(os.environ["UP"])
gen = json.loads(os.environ["GEN"])
assert len(up) >= 1, ("uploads", up)
types = {g.get("document_type") for g in gen}
for t in ("swo", "transmittal", "checklist", "billing-summary"):
    assert t in types, ("missing type", t, types)
print("uploads:", len(up), "generated:", len(gen), "types OK")
PY

echo "--- download generated file (first) ---"
GID=$(echo "${GEN}" | python3 -c "import json,sys; g=json.load(sys.stdin); print(g[0]['id'])")
curl -fsS -H "X-Internal-API-Key: ${KEY}" "${LITE_URL}/patients/${PID}/generated/${GID}/file" | head -c 80 >/dev/null || die "GET generated file"

echo "=== Poseidon Lite E2E passed ==="
