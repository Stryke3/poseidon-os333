#!/usr/bin/env bash
# LIVE POC — canonical intake (Intake service) + Trident learning (docker compose).
# Run from repo root with stack up: ./scripts/docker-up.sh
#
# Required env:
#   ORG_ID  — UUID for your org (from DB seed / admin)
#
# Optional:
#   BASE    — nginx URL (default http://127.0.0.1)
#
set -euo pipefail

BASE="${BASE:-http://127.0.0.1}"
BASE="${BASE%/}"
ORG_ID="${ORG_ID:?Set ORG_ID to a valid org UUID}"

echo "=== 1) Health (nginx + services) ==="
./scripts/poc_verify.sh "${BASE}"

echo ""
echo "=== 2) Incomplete intake (no insurance) → patient + intake_review_queue row ==="
IDEM="poc-demo-$(date +%s)-${RANDOM}"
curl -sS -X POST "${BASE}/intake-api/api/v1/intake/patient" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ${IDEM}" \
  -d "{\"org_id\":\"${ORG_ID}\",\"first_name\":\"Demo\",\"last_name\":\"Incomplete\",\"date_of_birth\":\"1980-01-15\"}" \
  | tee /dev/stderr
echo ""

echo ""
echo "=== 3) Same Idempotency-Key replay → idempotent (review queue fingerprint) ==="
curl -sS -X POST "${BASE}/intake-api/api/v1/intake/patient" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ${IDEM}" \
  -d "{\"org_id\":\"${ORG_ID}\",\"first_name\":\"Demo\",\"last_name\":\"Incomplete\",\"date_of_birth\":\"1980-01-15\"}" \
  | tee /dev/stderr
echo ""

echo ""
echo "=== 4) Trident learning proof (aggregates + latest bootstrap) ==="
curl -sS "${BASE}/trident-api/api/v1/trident/learning-proof" | tee /dev/stderr
echo ""

echo ""
echo "=== 5) Trident score — check learned_adjustment, confidence, features_used ==="
curl -sS -X POST "${BASE}/trident-api/api/v1/trident/score" \
  -H "Content-Type: application/json" \
  -d '{"icd10_codes":["M17.11"],"hcpcs_codes":["L1833"],"payer_id":"MEDICARE_DMERC","patient_age":72,"dos":"2025-01-15"}' \
  | tee /dev/stderr
echo ""

echo ""
echo "=== 6) Bootstrap historical learning (host; requires Postgres on 127.0.0.1:5432 from compose) ==="
echo "POSEIDON_DATABASE_URL=postgresql://poseidon:poseidon@127.0.0.1:5432/poseidon_db python3 scripts/bootstrap_trident_from_history.py"
echo "Then repeat steps 4–5."
