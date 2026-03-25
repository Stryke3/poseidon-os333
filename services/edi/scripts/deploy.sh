#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# POSEIDON EDI Service — Deployment Script
# Run on production droplet after placing service code in ./services/edi/
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[EDI]${NC} $1"; }
warn() { echo -e "${YELLOW}[EDI]${NC} $1"; }
err()  { echo -e "${RED}[EDI]${NC} $1"; }

POSEIDON_ROOT="${POSEIDON_ROOT:-/opt/poseidon}"
SERVICE_DIR="$POSEIDON_ROOT/services/edi"

# ─── PRE-FLIGHT ──────────────────────────────────────────────────────────────

log "Pre-flight checks..."

if [ ! -f "$POSEIDON_ROOT/.env" ]; then
    err ".env file not found at $POSEIDON_ROOT/.env"
    exit 1
fi

source "$POSEIDON_ROOT/.env"

if [ -z "${DATABASE_URL:-}" ]; then
    err "DATABASE_URL not set in .env"
    exit 1
fi

# ─── STEP 1: APPLY MIGRATION ────────────────────────────────────────────────

log "Applying EDI schema migration..."

MIGRATION_FILE="$SERVICE_DIR/migrations/001_edi_schema.sql"
if [ -f "$MIGRATION_FILE" ]; then
    docker exec -i poseidon_postgres psql -U "${POSTGRES_USER:-poseidon}" -d "${POSTGRES_DB:-poseidon}" < "$MIGRATION_FILE"
    log "Migration applied successfully"
else
    warn "Migration file not found at $MIGRATION_FILE — skipping"
fi

# ─── STEP 2: VERIFY ENV VARS ────────────────────────────────────────────────

MISSING=()
[[ -z "${STEDI_API_KEY:-}" ]] && MISSING+=("STEDI_API_KEY")
[[ -z "${ISA_SENDER_ID:-}" ]] && MISSING+=("ISA_SENDER_ID")

if [[ ${#MISSING[@]} -gt 0 ]]; then
    warn "Missing env vars (required for live submission):"
    for v in "${MISSING[@]}"; do warn "  → $v"; done
    warn "Service will start in DRY_RUN mode until these are set."
    # Force dry run if no Stedi key
    if [[ -z "${STEDI_API_KEY:-}" ]]; then
        export EDI_DRY_RUN=true
    fi
fi

# ─── STEP 3: BUILD & START ──────────────────────────────────────────────────

log "Building EDI service container..."
cd "$POSEIDON_ROOT"

docker compose build edi 2>&1 | tail -20

log "Starting EDI service..."
docker compose up -d edi

# Wait for health
log "Waiting for service health..."
for i in {1..15}; do
    sleep 2
    STATUS=$(curl -s http://localhost:8006/health 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
    if [[ "$STATUS" == "ok" || "$STATUS" == "degraded" ]]; then
        log "EDI service is ${STATUS}!"
        break
    fi
    if [[ $i -eq 15 ]]; then
        err "Service failed to start after 30 seconds"
        docker compose logs edi --tail=30
        exit 1
    fi
done

# ─── STEP 4: SMOKE TEST ─────────────────────────────────────────────────────

log "Running smoke tests..."

# Health endpoint
curl -s http://localhost:8006/health | python3 -m json.tool

# Docs
log "API docs available at: http://localhost:8006/docs"
log "Swagger UI: http://localhost:8006/docs"

# ─── STEP 5: VERIFY TABLES ──────────────────────────────────────────────────

log "Verifying database tables..."
docker exec poseidon_postgres psql -U "${POSTGRES_USER:-poseidon}" -d "${POSTGRES_DB:-poseidon}" -c "
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN (
        'claim_submissions', 'remittance_batches', 'remittance_claims',
        'remittance_adjustments', 'remittance_service_lines', 'edi_audit_log',
        'order_line_items', 'order_diagnoses'
      )
    ORDER BY table_name;
"

# ─── DONE ────────────────────────────────────────────────────────────────────

echo ""
log "════════════════════════════════════════════════════════════"
log "  EDI Service deployed successfully"
log "════════════════════════════════════════════════════════════"
log ""
log "  837P Claims:     POST http://localhost:8006/api/v1/claims/submit/{order_id}"
log "  837P Batch:      POST http://localhost:8006/api/v1/claims/submit/batch"
log "  837P Validate:   POST http://localhost:8006/api/v1/claims/validate/{order_id}"
log "  837P Status:     GET  http://localhost:8006/api/v1/claims/status/{order_id}"
log ""
log "  835 Upload:      POST http://localhost:8006/api/v1/remittance/upload"
log "  835 Auto-Post:   POST http://localhost:8006/api/v1/remittance/batch/{id}/post"
log "  835 Denials:     GET  http://localhost:8006/api/v1/remittance/denials"
log "  835 Stats:       GET  http://localhost:8006/api/v1/remittance/stats"
log ""
log "  Dry Run Mode:    ${EDI_DRY_RUN:-true}"
log "  Stedi Connected: $([ -n "${STEDI_API_KEY:-}" ] && echo 'yes' || echo 'no')"
log ""
