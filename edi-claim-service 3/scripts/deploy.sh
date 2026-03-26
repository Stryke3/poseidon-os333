#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# POSEIDON EDI Service — Production Deployment
# Target: poseidon-prod (157.230.145.247)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[EDI]${NC} $1"; }
warn() { echo -e "${YELLOW}[EDI]${NC} $1"; }
err()  { echo -e "${RED}[EDI]${NC} $1"; }
info() { echo -e "${CYAN}[EDI]${NC} $1"; }

POSEIDON_ROOT="${POSEIDON_ROOT:-/opt/poseidon}"
SERVICE_DIR="$POSEIDON_ROOT/services/edi"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  POSEIDON EDI Service — Deployment${NC}"
echo -e "${CYAN}  837P Outbound Claims + 835 Inbound Remittance${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ─── PRE-FLIGHT ──────────────────────────────────────────────────────────────

log "Running pre-flight checks..."

if [ ! -f "$POSEIDON_ROOT/.env" ]; then
    err ".env file not found at $POSEIDON_ROOT/.env"
    exit 1
fi

set -a
source "$POSEIDON_ROOT/.env"
set +a

if [ -z "${DATABASE_URL:-}" ] && [ -z "${POSTGRES_USER:-}" ]; then
    err "Neither DATABASE_URL nor POSTGRES_USER set in .env"
    exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
    DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB:-poseidon}"
fi

log "Pre-flight passed"

# ─── STEP 1: APPEND ENV VARS ────────────────────────────────────────────────

log "Checking .env for EDI variables..."

ENV_FILE="$POSEIDON_ROOT/.env"

append_env() {
    local key="$1"
    local val="$2"
    if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
        echo "${key}=${val}" >> "$ENV_FILE"
        info "  Added ${key}"
    fi
}

echo "" >> "$ENV_FILE"
echo "# ── EDI Service (added $(date +%Y-%m-%d)) ──" >> "$ENV_FILE"

append_env "SUBMISSION_METHOD" "availity_sftp"
append_env "AVAILITY_SFTP_HOST" "files.availity.com"
append_env "AVAILITY_SFTP_PORT" "22"
append_env "AVAILITY_SFTP_USER" "Poseidon"
append_env "AVAILITY_SFTP_PASS" ""
append_env "AVAILITY_USE_QA" "false"
append_env "AVAILITY_CUSTOMER_ID" "2618273"
append_env "ISA_SENDER_QUAL" "ZZ"
append_env "ISA_SENDER_ID" "AV09311993     "
append_env "ISA_RECEIVER_QUAL" "01"
append_env "ISA_RECEIVER_ID" "030240928      "
append_env "ISA_TEST_INDICATOR" "T"
append_env "BILLING_NPI" "1821959420"
append_env "BILLING_TAX_ID" "393429726"
append_env "BILLING_ORG_NAME" "STRYKEFOX MEDICAL"
append_env "BILLING_ADDR" "9225 W CHARLESTON BLVD STE 2134"
append_env "BILLING_CITY" "LAS VEGAS"
append_env "BILLING_STATE" "NV"
append_env "BILLING_ZIP" "89117"
append_env "BILLING_TAXONOMY" "332B00000X"
append_env "BILLING_PHONE" "6124996561"
append_env "EDI_DRY_RUN" "true"

warn ""
warn "Set AVAILITY_SFTP_PASS in .env before going live."
warn ""

# ─── STEP 2: APPLY MIGRATION ────────────────────────────────────────────────

log "Applying EDI schema migration..."

MIGRATION_FILE="$SERVICE_DIR/migrations/001_edi_schema.sql"
if [ -f "$MIGRATION_FILE" ]; then
    if docker exec -i poseidon_postgres psql -U "${POSTGRES_USER:-poseidon}" -d "${POSTGRES_DB:-poseidon}" < "$MIGRATION_FILE" 2>/dev/null; then
        log "Migration applied"
    else
        warn "Docker migration failed, trying psql directly..."
        psql "$DATABASE_URL" < "$MIGRATION_FILE" 2>/dev/null || err "Migration failed — run manually"
    fi
else
    warn "Migration not found at $MIGRATION_FILE"
fi

# ─── STEP 3: VERIFY TABLES ──────────────────────────────────────────────────

log "Verifying tables..."

docker exec poseidon_postgres psql -U "${POSTGRES_USER:-poseidon}" -d "${POSTGRES_DB:-poseidon}" -t -c "
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
    AND table_name IN (
        'claim_submissions','remittance_batches','remittance_claims',
        'remittance_adjustments','remittance_service_lines','edi_audit_log',
        'order_line_items','order_diagnoses'
    ) ORDER BY table_name;
" 2>/dev/null || warn "Could not verify tables"

# ─── STEP 4: BUILD & START ──────────────────────────────────────────────────

log "Building EDI service container..."
cd "$POSEIDON_ROOT"

COMPOSE_FILE="$POSEIDON_ROOT/docker-compose.yml"

if grep -q "edi:" "$COMPOSE_FILE" 2>/dev/null; then
    docker compose build edi 2>&1 | tail -10
    docker compose up -d edi
    log "Started via docker compose"
else
    info "Building standalone..."
    docker build -t poseidon-edi "$SERVICE_DIR" 2>&1 | tail -10

    docker stop poseidon_edi 2>/dev/null || true
    docker rm poseidon_edi 2>/dev/null || true

    # Detect network name
    NETWORK=$(docker network ls --format '{{.Name}}' | grep -i poseidon | head -1)
    NETWORK=${NETWORK:-poseidon-network}

    docker run -d \
        --name poseidon_edi \
        --restart unless-stopped \
        --network "$NETWORK" \
        -p 127.0.0.1:8005:8005 \
        --env-file "$POSEIDON_ROOT/.env" \
        -e SERVICE_PORT=8005 \
        -e DATABASE_URL="$DATABASE_URL" \
        poseidon-edi

    log "Started standalone on port 8005"
fi

# ─── STEP 5: HEALTH CHECK ───────────────────────────────────────────────────

log "Waiting for health..."

for i in {1..20}; do
    sleep 2
    STATUS=$(curl -s http://localhost:8005/health 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
    if [[ "$STATUS" == "ok" || "$STATUS" == "degraded" ]]; then
        log "EDI service is UP"
        curl -s http://localhost:8005/health | python3 -m json.tool
        break
    fi
    if [[ $i -eq 20 ]]; then
        err "Service failed to start"
        docker logs poseidon_edi --tail=30 2>/dev/null
        exit 1
    fi
done

# ─── STEP 6: NGINX ──────────────────────────────────────────────────────────

NGINX_CONF="$POSEIDON_ROOT/nginx/conf.d/poseidon.conf"
if [ -f "$NGINX_CONF" ] && ! grep -q "edi.strykefox.com" "$NGINX_CONF" 2>/dev/null; then
    log "Adding edi.strykefox.com to nginx..."
    cat >> "$NGINX_CONF" << 'EOF'

upstream edi_backend { server poseidon_edi:8005; }
server {
    listen 80;
    server_name edi.strykefox.com;
    client_max_body_size 50M;
    location / {
        proxy_pass http://edi_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
EOF
    docker exec poseidon_nginx nginx -s reload 2>/dev/null || warn "Reload nginx manually"
fi

# ─── DONE ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  EDI Service Deployed${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Swagger:  http://localhost:8005/docs"
echo "  Health:   http://localhost:8005/health"
echo ""
echo "  NEXT STEPS:"
echo "    1. nano $ENV_FILE   → set AVAILITY_SFTP_PASS"
echo "    2. curl -X POST http://localhost:8005/api/v1/claims/validate/1"
echo "    3. Set EDI_DRY_RUN=false, restart container"
echo "    4. Submit test claim (ISA15=T), check Availity portal"
echo "    5. When passing, set ISA_TEST_INDICATOR=P"
echo ""
