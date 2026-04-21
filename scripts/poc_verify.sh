#!/usr/bin/env bash
# Operator smoke checks for DigitalOcean + docker compose + nginx.
# Uses the public nginx entrypoint (port 80) so Trident/Intake/ML need not be published on host.
#
# Usage:
#   ./scripts/poc_verify.sh                    # http://127.0.0.1
#   ./scripts/poc_verify.sh http://YOUR_DROPLET_IP
#
set -euo pipefail

BASE="${1:-http://127.0.0.1}"
BASE="${BASE%/}"

echo "=== POSEIDON POC health (via nginx: ${BASE}) ==="
curl -fsS "${BASE}/healthz" && echo "  nginx /healthz OK" || { echo "FAIL: nginx /healthz"; exit 1; }
curl -fsS "${BASE}/api/health" | head -c 200 && echo " ... dashboard /api/health OK" || { echo "FAIL: dashboard /api/health"; exit 1; }

echo "--- Backend services (path prefixes on default server) ---"
curl -fsS "${BASE}/trident-api/ready" && echo "  trident /ready OK" || { echo "FAIL: trident"; exit 1; }
curl -fsS "${BASE}/intake-api/ready" && echo "  intake /ready OK" || { echo "FAIL: intake"; exit 1; }
curl -fsS "${BASE}/ml-api/ready" && echo "  ml /ready OK" || { echo "FAIL: ml"; exit 1; }
curl -fsS "${BASE}/edi-api/health" && echo "  edi /health OK" || { echo "FAIL: edi"; exit 1; }
curl -fsS "${BASE}/availity-api/live" && echo "  availity /live OK" || { echo "FAIL: availity"; exit 1; }

echo "--- Core (via nginx vhost api.strykefox.com → core:8001) ---"
curl -fsS -H "Host: api.strykefox.com" "${BASE}/ready" && echo "  core /ready OK" || { echo "FAIL: core"; exit 1; }

echo "=== All POC checks passed ==="
