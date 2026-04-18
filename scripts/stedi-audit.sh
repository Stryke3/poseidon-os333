#!/bin/bash
###############################################################################
# POSEIDON → Stedi Integration Audit
#
# Run on the production host (e.g. poseidon-prod) to export a snapshot of what
# the platform exposes — structured for Stedi engineering review.
#
# Usage:
#   ./scripts/stedi-audit.sh
#   ./scripts/stedi-audit.sh --skip-files   # no on-disk .x12/.835/.edi search or copy (PHI-safe)
# Output: ./stedi-audit-report/ directory with all artifacts
#
# Repo alignment (docker-compose.yml):
#   Core 8001 /ready, Trident 8002 /ready, Intake 8003 /ready
#   EDI 8006 /health (FastAPI 837P/835)
#   Availity Node 8005 /live
###############################################################################

set -euo pipefail

SKIP_FILES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-files)
      SKIP_FILES=1
      shift
      ;;
    -h|--help)
      cat << 'HELP'
POSEIDON Stedi Integration Audit

Usage:
  ./scripts/stedi-audit.sh [--skip-files]

  --skip-files   Skip find(1) and copy of raw *.x12, *.837, *.835, *.edi on disk
                 (reduces PHI exposure; OpenAPI, health, DB aggregates unchanged)
HELP
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (try --help)" >&2
      exit 1
      ;;
  esac
done

REPORT_DIR="./stedi-audit-report"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EDI_API="http://localhost:8006"
AVAILITY_API="http://localhost:8005"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# Absolute path for Python (handles repo dirs with spaces).
case "$REPORT_DIR" in
  /*) STEDI_AUDIT_REPORT_DIR="$REPORT_DIR" ;;
  *) STEDI_AUDIT_REPORT_DIR="$(pwd)/${REPORT_DIR#./}" ;;
esac
export STEDI_AUDIT_REPORT_DIR
export STEDI_REPO_ROOT="$REPO_ROOT"

mkdir -p "$REPORT_DIR"/{edi-samples,api-surface,db-schema,service-health,claim-lifecycle}

cat > "$REPORT_DIR/README.md" << 'EOF'
# POSEIDON Platform — Stedi Integration Audit Report

Generated for Stedi engineering review. This package contains:

1. **service-health/** — Health check responses from running services
2. **api-surface/** — OpenAPI specs (FastAPI services) and EDI endpoint summary
3. **edi-samples/** — EDI file discovery, container env snapshot (redact secrets before sharing), claim_submissions X12 metadata
4. **db-schema/** — EDI-relevant table structures (`\d+`) and aggregate queries (no row content from PHI tables)
5. **claim-lifecycle/** — Status distributions and optional codebase grep hints
6. **platform-summary.json** — Machine-readable platform capabilities manifest

## What We're Looking For From Stedi
- Direct API integration replacing/supplementing Availity SFTP for 837P submission
- 835 ERA ingestion via Stedi webhook or pull
- Real-time 276/277 claim status queries
- 270/271 eligibility verification (currently via Availity API)
- TA1/999 acknowledgment processing

## Current EDI Stack (verify on host)
- **Outbound 837P:** In-platform X12 → Availity SFTP and/or Stedi API (see `SUBMISSION_METHOD` / `EDI_DRY_RUN` in EDI container env)
- **Inbound 835:** Parsed into `remittance_*` tables and related posting; Stedi import IDs in `stedi_835_import_ids`
- **Enrollment ISA/GS/NPI:** See `edi-samples/edi-config.txt` (from `poseidon_edi` env) — values differ by environment
- **Payers:** Canonical list in `payers` table (Availity trading partner ids where configured)
EOF

if [ "$SKIP_FILES" -eq 1 ]; then
  printf '\n## This run\n\n`--skip-files` was used: no filesystem search or copy of raw `.x12` / `.837` / `.835` / `.edi` files into this bundle.\n\n' \
    >> "$REPORT_DIR/README.md"
fi

echo "[$TIMESTAMP] POSEIDON Stedi Audit — Starting..."
if [ "$SKIP_FILES" -eq 1 ]; then
  echo "  (mode: --skip-files — skipping on-disk EDI file discovery and copy)"
fi

###############################################################################
# 1. SERVICE HEALTH
###############################################################################
echo "[1/7] Checking service health..."

for svc in \
  core:8001:/ready \
  trident:8002:/ready \
  intake:8003:/ready \
  edi:8006:/health \
  availity:8005:/live; do
  IFS=: read -r name port path <<< "$svc"
  echo "  → $name ($port$path)"
  url="http://localhost:${port}${path}"
  tmp=$(mktemp)
  # Do not use `|| echo 000` here: curl already prints http_code on stdout; duplicating breaks JSON branch.
  http=$(curl -sS -o "$tmp" -w "%{http_code}" --connect-timeout 2 --max-time 15 "$url" 2>/dev/null) || true
  [ -z "$http" ] && http="000"
  if [ "$http" = "200" ]; then
    mv "$tmp" "$REPORT_DIR/service-health/${name}.json"
  else
    rm -f "$tmp"
    printf '{"ok":false,"service":"%s","url":"%s","http_status":"%s"}\n' "$name" "$url" "$http" \
      > "$REPORT_DIR/service-health/${name}.json"
  fi
  echo "  HTTP ${http}"
done

docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
  > "$REPORT_DIR/service-health/containers.txt" 2>/dev/null || echo "docker ps unavailable" > "$REPORT_DIR/service-health/containers.txt"

###############################################################################
# 2. API SURFACE — OpenAPI Specs
###############################################################################
echo "[2/7] Pulling OpenAPI specs..."

for svc in core:8001 trident:8002 intake:8003 edi:8006; do
  IFS=: read -r name port <<< "$svc"
  echo "  → $name openapi.json"
  curl -s "http://localhost:${port}/openapi.json" \
    > "$REPORT_DIR/api-surface/${name}-openapi.json" 2>/dev/null || echo "{}" > "$REPORT_DIR/api-surface/${name}-openapi.json"
done

echo "  → availity (no OpenAPI in repo — probing)"
curl -s "${AVAILITY_API}/openapi.json" > "$REPORT_DIR/api-surface/availity-openapi.json" 2>/dev/null || echo "{}" > "$REPORT_DIR/api-surface/availity-openapi.json"

echo "[2b/7] Extracting EDI-relevant endpoints..."
python3 << 'PY' > "$REPORT_DIR/api-surface/edi-endpoints-summary.txt" 2>&1
import json
import os
import sys

base = os.environ.get("STEDI_AUDIT_REPORT_DIR", ".")
edi_keywords = [
    "claim", "edi", "837", "835", "submit", "eligibility", "remittance",
    "denial", "payment", "payer", "era", "clearinghouse", "batch",
]

print("# EDI-relevant OpenAPI paths (keyword filter)\n")
total = 0
for svc in ["core", "trident", "intake", "edi", "availity"]:
    path = os.path.join(base, "api-surface", f"{svc}-openapi.json")
    try:
        with open(path, encoding="utf-8") as f:
            spec = json.load(f)
    except Exception as e:
        print(f"### {svc.upper()} — error reading spec: {e}\n")
        continue
    paths = spec.get("paths") or {}
    if not paths:
        print(f"### {svc.upper()} — no paths (service down or empty OpenAPI)\n")
        continue
    relevant = {}
    for p, methods in paths.items():
        if any(kw in p.lower() for kw in edi_keywords):
            relevant[p] = {
                m: {"summary": d.get("summary", ""), "tags": d.get("tags", [])}
                for m, d in methods.items()
                if m in ("get", "post", "put", "patch", "delete")
            }
        else:
            for m, d in methods.items():
                if m not in ("get", "post", "put", "patch", "delete"):
                    continue
                desc = (d.get("summary", "") + " " + (d.get("description") or "")).lower()
                if any(kw in desc for kw in edi_keywords):
                    relevant.setdefault(p, {})[m] = {
                        "summary": d.get("summary", ""),
                        "tags": d.get("tags", []),
                    }
    if relevant:
        total += len(relevant)
        print(f"### {svc.upper()} — EDI-relevant endpoints ({len(relevant)})\n")
        for p, methods in sorted(relevant.items()):
            for m, info in methods.items():
                print(f"  {m.upper():6s} {p:50s}  {info['summary']}")
        print()
if total == 0:
    print(
        "No EDI-relevant paths matched. "
        "Usually means APIs are not reachable on localhost (empty OpenAPI files)."
    )
PY

###############################################################################
# 3. EDI SAMPLES — X12 / config
###############################################################################
if [ "$SKIP_FILES" -eq 1 ]; then
  echo "[3/7] EDI samples (skipping on-disk EDI files — --skip-files)..."
  echo "Skipped: no find(1) or cp of *.x12, *.837, *.835, *.edi (--skip-files)." \
    > "$REPORT_DIR/edi-samples/edi-files-found.txt"
else
  echo "[3/7] Extracting EDI samples..."
  find /home /opt /var /data /mnt -name "*.x12" -o -name "*.837" -o -name "*.835" \
    -o -name "*.edi" 2>/dev/null | head -20 > "$REPORT_DIR/edi-samples/edi-files-found.txt" || true

  while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f" ] && cp "$f" "$REPORT_DIR/edi-samples/" 2>/dev/null || true
  done < "$REPORT_DIR/edi-samples/edi-files-found.txt"
fi

echo "--- EDI container env (REDACT secrets before external share) ---" > "$REPORT_DIR/edi-samples/edi-config.txt"
docker exec poseidon_edi env 2>/dev/null | grep -iE "edi|isa|gs|sftp|avail|stedi|npi|tax|claim|submission|dry|billing" \
  >> "$REPORT_DIR/edi-samples/edi-config.txt" 2>/dev/null || \
  docker exec edi env 2>/dev/null | grep -iE "edi|isa|gs|sftp|avail|stedi|npi|tax|claim|submission|dry|billing" \
  >> "$REPORT_DIR/edi-samples/edi-config.txt" 2>/dev/null || \
  echo "Could not read EDI container env (expected name: poseidon_edi)" >> "$REPORT_DIR/edi-samples/edi-config.txt"

echo '{"note":"No unauthenticated sample-837 route; see EDI OpenAPI POST /api/v1/claims/validate/{order_id}"}' \
  > "$REPORT_DIR/edi-samples/sample-837p-output.json"

{
  find "$REPO_ROOT/services/edi" -name "*.py" 2>/dev/null
  find /opt /home -path "*/poseidon*" -path "*/services/edi/*" -name "*.py" 2>/dev/null
} | head -40 > "$REPORT_DIR/edi-samples/edi-source-files.txt" || true

###############################################################################
# 4. DATABASE SCHEMA — EDI-Relevant Tables
###############################################################################
echo "[4/7] Dumping EDI-relevant DB schema..."

DB_URL=""
DB_SOURCE=""
if d="$(docker exec poseidon_core printenv DATABASE_URL 2>/dev/null)" && [ -n "$d" ]; then
  DB_URL=$d
  DB_SOURCE="poseidon_core container"
elif d="$(docker exec core printenv DATABASE_URL 2>/dev/null)" && [ -n "$d" ]; then
  DB_URL=$d
  DB_SOURCE="core container"
fi

if [ -z "$DB_URL" ] && [ -f "$REPO_ROOT/.env" ]; then
  DB_URL=$(python3 << 'PY'
import os
p = os.path.join(os.environ["STEDI_REPO_ROOT"], ".env")
if not os.path.isfile(p):
    raise SystemExit(0)
for line in open(p, encoding="utf-8", errors="replace"):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    if line.startswith("DATABASE_URL="):
        v = line.split("=", 1)[1].strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        print(v, end="")
        break
PY
)
  [ -n "$DB_URL" ] && DB_SOURCE="$REPO_ROOT/.env"
fi

# Compose-style URLs use hostname `postgres`, which is not resolvable from the host and can hang psql.
if [ -n "$DB_URL" ]; then
  case "$DB_URL" in
    *"@postgres:"*|*"@poseidon_postgres:"*)
      echo "  ⚠ DATABASE_URL from $DB_SOURCE uses Docker-only host (postgres) — skipping DB export on this machine"
      printf '%s\n' "Point DATABASE_URL at Neon or 127.0.0.1:5432 for host-side audits, or run this script inside the stack." \
        > "$REPORT_DIR/db-schema/MANUAL-STEP.txt"
      DB_URL=""
      ;;
  esac
fi

if [ -n "$DB_URL" ]; then
  echo "  → DATABASE_URL from $DB_SOURCE"
  export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
  # Wall-clock cap for remote DB (libpq can still be slow on bad networks).
  if ! STEDI_AUDIT_DB_URL="$DB_URL" python3 << 'PY'
import os
import subprocess
import sys

url = os.environ.get("STEDI_AUDIT_DB_URL", "").strip()
if not url:
    sys.exit(1)
try:
    subprocess.run(
        ["psql", url, "-c", "SELECT 1"],
        timeout=int(os.environ.get("STEDI_PG_PING_TIMEOUT", "12")),
        check=True,
        capture_output=True,
    )
except (FileNotFoundError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
    sys.exit(1)
sys.exit(0)
PY
  then
    echo "  ⚠ Database unreachable (psql ping failed or timed out after ${STEDI_PG_PING_TIMEOUT:-12}s) — skipping DB export"
    printf '%s\n' "Could not run SELECT 1 against DATABASE_URL. Use a host-reachable URL, VPN, or increase STEDI_PG_PING_TIMEOUT." \
      > "$REPORT_DIR/db-schema/MANUAL-STEP.txt"
    DB_URL=""
  fi
fi

if [ -n "$DB_URL" ]; then
  # Tables that exist in scripts/init.sql (EDI + adjacent)
  EDI_TABLES="
    claim_submissions
    remittance_batches
    remittance_claims
    remittance_adjustments
    remittance_service_lines
    stedi_835_import_ids
    edi_audit_log
    payment_outcomes
    learned_rates
    payers
    orders
    eob_claims
    denials
    patients
    physicians
  "

  : > "$REPORT_DIR/db-schema/tables.txt"
  for tbl in $EDI_TABLES; do
    psql "$DB_URL" -c "\d+ $tbl" >> "$REPORT_DIR/db-schema/tables.txt" 2>/dev/null || true
  done

  echo "--- Table Row Counts ---" > "$REPORT_DIR/db-schema/row-counts.txt"
  for tbl in $EDI_TABLES; do
    count=$(psql "$DB_URL" -t -c "SELECT count(*) FROM $tbl" 2>/dev/null | tr -d ' \n' || true)
    [ -n "$count" ] && echo "  $tbl: $count" >> "$REPORT_DIR/db-schema/row-counts.txt"
  done

  psql "$DB_URL" -c "SELECT id, name, active FROM payers ORDER BY id LIMIT 50" \
    > "$REPORT_DIR/db-schema/payer-config.txt" 2>/dev/null || true

  psql "$DB_URL" -c "
    SELECT denial_reason, COUNT(*) AS cnt
    FROM payment_outcomes
    WHERE denial_reason IS NOT NULL AND denial_reason <> ''
    GROUP BY denial_reason
    ORDER BY cnt DESC
    LIMIT 30
  " > "$REPORT_DIR/db-schema/denial-distribution-payment_outcomes.txt" 2>/dev/null || true

  psql "$DB_URL" -c "
    SELECT carc_code, rarc_code, COUNT(*) AS cnt
    FROM denials
    GROUP BY carc_code, rarc_code
    ORDER BY cnt DESC
    LIMIT 30
  " > "$REPORT_DIR/db-schema/denial-distribution-denials.txt" 2>/dev/null || true

  psql "$DB_URL" -c "
    SELECT payer_id, hcpcs_code, avg_paid, denial_rate, sample_count
    FROM learned_rates
    ORDER BY sample_count DESC NULLS LAST
    LIMIT 20
  " > "$REPORT_DIR/db-schema/learned-rates-sample.txt" 2>/dev/null || true

  psql "$DB_URL" -c "
    SELECT id, status, submission_method, clearinghouse,
           length(raw_x12_outbound) AS x12_chars,
           submitted_at
    FROM claim_submissions
    WHERE raw_x12_outbound IS NOT NULL
    ORDER BY submitted_at DESC NULLS LAST
    LIMIT 15
  " > "$REPORT_DIR/edi-samples/claim-submissions-x12-metadata.txt" 2>/dev/null || true

else
  if [ ! -f "$REPORT_DIR/db-schema/MANUAL-STEP.txt" ]; then
    echo "  ⚠ No DATABASE_URL (Core container, core, or $REPO_ROOT/.env) — skipping DB export"
    printf '%s\n' "Set DATABASE_URL in .env or run psql manually." > "$REPORT_DIR/db-schema/MANUAL-STEP.txt"
  fi
fi

###############################################################################
# 5. CLAIM LIFECYCLE
###############################################################################
echo "[5/7] Documenting claim lifecycle..."

grep -rn "class.*Status\|ORDER_STATUS\|CLAIM_STATUS\|status.*enum\|StatusEnum" \
  "$REPO_ROOT/services" 2>/dev/null | head -40 > "$REPORT_DIR/claim-lifecycle/status-enums.txt" || true
for d in /opt/poseidon /home/poseidon/deploy /app; do
  [ -d "$d" ] || continue
  grep -rn "class.*Status\|ORDER_STATUS\|CLAIM_STATUS\|status.*enum\|StatusEnum" "$d" 2>/dev/null \
    | head -40 >> "$REPORT_DIR/claim-lifecycle/status-enums.txt" || true
done

grep -rl "workflow\|state_machine\|transition" "$REPO_ROOT/services" 2>/dev/null \
  | head -20 > "$REPORT_DIR/claim-lifecycle/workflow-files.txt" || true
for d in /opt/poseidon /home/poseidon/deploy /app; do
  [ -d "$d" ] || continue
  grep -rl "workflow\|state_machine\|transition" "$d" 2>/dev/null \
    | head -20 >> "$REPORT_DIR/claim-lifecycle/workflow-files.txt" || true
done

if [ -n "$DB_URL" ]; then
  psql "$DB_URL" -c "
    SELECT status, COUNT(*) AS cnt
    FROM orders
    GROUP BY status
    ORDER BY cnt DESC
  " > "$REPORT_DIR/claim-lifecycle/order-status-distribution.txt" 2>/dev/null || true

  psql "$DB_URL" -c "
    SELECT status, COUNT(*) AS cnt
    FROM claim_submissions
    GROUP BY status
    ORDER BY cnt DESC
  " > "$REPORT_DIR/claim-lifecycle/claim-status-distribution.txt" 2>/dev/null || true
fi

###############################################################################
# 6. TRIDENT INTELLIGENCE SNAPSHOT (aggregates only)
###############################################################################
echo "[6/7] Capturing Trident intelligence metrics..."

curl -s "http://localhost:8002/openapi.json" | python3 -c "
import json, sys
try:
    spec = json.load(sys.stdin)
    paths = spec.get('paths', {})
    print(f'Trident Endpoints: {len(paths)}')
    for p in sorted(paths.keys()):
        methods = [m.upper() for m in paths[p] if m in ('get','post','put','patch','delete')]
        print(f'  {\" \".join(methods):20s} {p}')
except Exception:
    print('Could not parse Trident OpenAPI spec')
" > "$REPORT_DIR/api-surface/trident-capabilities.txt" 2>/dev/null || true

if [ -n "$DB_URL" ]; then
  psql "$DB_URL" -c "
    SELECT
      COUNT(*) AS total_records,
      COUNT(DISTINCT payer_id) AS unique_payers,
      COUNT(DISTINCT hcpcs_code) AS unique_hcpcs,
      ROUND(AVG(denial_rate)::numeric, 3) AS avg_denial_rate,
      ROUND(AVG(avg_paid)::numeric, 2) AS avg_avg_paid
    FROM learned_rates
  " > "$REPORT_DIR/db-schema/trident-intelligence-summary.txt" 2>/dev/null || true
fi

###############################################################################
# 7. PLATFORM MANIFEST
###############################################################################
echo "[7/7] Generating platform manifest..."

cat > "$REPORT_DIR/platform-summary.json" << MANIFEST
{
  "platform": "POSEIDON",
  "operator": "Stryke Fox Medical",
  "generated_at": "$TIMESTAMP",
  "services": {
    "core_api": {"port": 8001, "framework": "FastAPI", "health": "/ready"},
    "trident": {"port": 8002, "framework": "FastAPI", "health": "/ready"},
    "intake": {"port": 8003, "framework": "FastAPI", "health": "/ready"},
    "ml": {"port": 8004, "framework": "FastAPI", "health": "/ready"},
    "availity_node": {"port": 8005, "framework": "Node", "health": "/live"},
    "edi": {"port": 8006, "framework": "FastAPI", "health": "/health"},
    "frontend": {"port": 3000, "framework": "Next.js", "health": "/api/health"}
  },
  "edi_pipeline": {
    "outbound_837p": {
      "primary_note": "Configure per env: Availity SFTP vs Stedi API (SUBMISSION_METHOD)",
      "format": "X12 5010 837P",
      "edi_openapi_paths": ["/api/v1/claims/submit/{order_id}", "/api/v1/claims/validate/{order_id}"]
    },
    "inbound_835": {
      "format": "X12 5010 835",
      "storage": "remittance_batches, remittance_claims, remittance_adjustments, remittance_service_lines",
      "stedi_dedup": "stedi_835_import_ids"
    },
    "acknowledgments": ["TA1", "999"],
    "future_transactions": ["276/277 claim status", "270/271 eligibility"]
  },
  "database": {
    "provider_note": "Neon or Postgres per DATABASE_URL",
    "pk_type": "UUID"
  },
  "integration_ask": {
    "stedi": [
      "837P claim submission via Stedi API (replace/supplement Availity SFTP)",
      "835 ERA ingestion via webhook or scheduled pull",
      "276/277 real-time claim status",
      "270/271 eligibility verification",
      "TA1/999 acknowledgment webhook delivery"
    ]
  }
}
MANIFEST

echo ""
echo "=============================================="
echo " Audit complete → $REPORT_DIR/"
echo "=============================================="
echo ""
echo "Contents:"
ls -la "$REPORT_DIR"/
echo ""
echo "Next steps:"
echo "  1. Review $REPORT_DIR/README.md"
echo "  2. Redact secrets in edi-samples/edi-config.txt and any copied .x12/.835 files"
echo "  3. grep -riE 'ssn|dob|patient' $REPORT_DIR/ — ensure no PHI before sharing"
echo "  4. tar czf stedi-audit-\$(date +%Y%m%d).tar.gz $REPORT_DIR/"
echo "  5. Share with Stedi engineering"
