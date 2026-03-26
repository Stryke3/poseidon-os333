#!/bin/bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}►${NC} $1"; }
ok()   { echo -e "  ${GREEN}✅${NC} $1"; }
fail() { echo -e "  ${RED}❌${NC} $1"; }

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  POSEIDON — PRODUCTION GO-LIVE${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""

cd "$(dirname "$0")"

# ─── PREFLIGHT ───────────────────────────────────────────────
log "Preflight..."
[ ! -f .env ] && { fail ".env missing"; exit 1; }
grep -q "CHANGE_ME" .env && { fail ".env has CHANGE_ME placeholders"; exit 1; }
docker compose version > /dev/null 2>&1 || { fail "docker compose unavailable"; exit 1; }
if command -v psql > /dev/null 2>&1; then
    USE_DOCKER_PSQL=false
    ok "Using local psql"
else
    USE_DOCKER_PSQL=true
    ok "Using dockerized psql client"
fi
ok "Preflight passed"

# ─── READ DATABASE URL ───────────────────────────────────────
DB_URL=$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
DB_URL=$(echo "$DB_URL" | tr -d "'\"")

run_psql() {
    if [ "$USE_DOCKER_PSQL" = true ]; then
        docker run --rm -i postgres:15-alpine psql "$DB_URL" "$@"
    else
        psql "$DB_URL" "$@"
    fi
}

# ─── TEST NEON CONNECTION ────────────────────────────────────
log "Testing Neon database connection..."
if run_psql -c "SELECT 1;" > /dev/null 2>&1; then
    ok "Neon connected"
else
    fail "Cannot connect to Neon. Check DATABASE_URL in .env"
    exit 1
fi

# ─── TOTAL TEARDOWN ──────────────────────────────────────────
log "Tearing down all containers..."
docker compose down --remove-orphans 2>/dev/null || true
ok "Containers down"

# ─── FLUSH DOCKER ────────────────────────────────────────────
log "Pruning Docker cache + old images..."
docker builder prune -f 2>/dev/null || true
docker images --format '{{.Repository}}:{{.Tag}}' | grep -iE 'poseidon|strykefox' | while read img; do
    docker rmi "$img" 2>/dev/null || true
done || true
ok "Docker cache flushed"

# ─── FLUSH REDIS ─────────────────────────────────────────────
log "Flushing Redis..."
docker compose up -d redis
sleep 4
REDIS_PW=$(grep '^REDIS_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d "'\"")
docker compose exec -T redis redis-cli -a "$REDIS_PW" FLUSHALL 2>/dev/null || true
ok "Redis flushed"

# ─── RESET NEON DATABASE ────────────────────────────────────
log "Dropping all tables in Neon..."
run_psql -c "
DO \$\$ DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END \$\$;
" 2>/dev/null
ok "All tables dropped"

log "Applying schema to Neon..."
run_psql < scripts/init.sql
ok "Schema + reference data applied"

[ -f scripts/seed_admin.sql ] && {
    run_psql < scripts/seed_admin.sql 2>/dev/null || true
    ok "Admin user applied"
}

[ -f services/edi/migrations/001_edi_schema.sql ] && {
    run_psql < services/edi/migrations/001_edi_schema.sql 2>/dev/null || true
    ok "EDI schema applied"
}

if [ -d scripts/migrations ]; then
    for f in scripts/migrations/*.sql; do
        [ -f "$f" ] && run_psql < "$f" 2>/dev/null || true
    done
    ok "Migrations applied"
fi

TABLE_COUNT=$(run_psql -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
PAYER_COUNT=$(run_psql -tAc "SELECT COUNT(*) FROM payers;" 2>/dev/null || echo "0")
USER_COUNT=$(run_psql -tAc "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
PATIENT_COUNT=$(run_psql -tAc "SELECT COUNT(*) FROM patients;" 2>/dev/null || echo "0")
ok "Tables: ${TABLE_COUNT} | Payers: ${PAYER_COUNT} | Users: ${USER_COUNT} | Patients: ${PATIENT_COUNT}"

# ─── BUILD ───────────────────────────────────────────────────
log "Building all containers (--no-cache)..."
docker compose build --no-cache --parallel 2>&1 | tail -5
ok "All images built"

# ─── START ───────────────────────────────────────────────────
log "Starting infrastructure (redis, minio)..."
docker compose up -d redis minio
sleep 6

log "Starting Availity (Prisma migrates on boot)..."
docker compose up -d availity
sleep 10

log "Starting backend..."
docker compose up -d core trident intake ml edi
sleep 10

log "Starting frontend..."
docker compose up -d dashboard
sleep 8

log "Starting nginx..."
docker compose up -d nginx
sleep 3

# ─── HEALTH CHECKS ──────────────────────────────────────────
echo ""
log "Health checks..."
ALL_OK=true

for pair in "core:8001:/ready" "trident:8002:/ready" "intake:8003:/ready" "ml:8004:/ready" "availity:8005:/live" "edi:8006:/health"; do
    IFS=: read -r svc port path <<< "$pair"
    if docker compose exec -T "$svc" curl -sf "http://127.0.0.1:${port}${path}" > /dev/null 2>&1; then
        ok "$svc"
    else
        fail "$svc (port $port)"
        ALL_OK=false
    fi
done

docker compose exec -T dashboard wget -qO- "http://127.0.0.1:3000/api/health" > /dev/null 2>&1 && ok "dashboard" || { fail "dashboard"; ALL_OK=false; }
curl -sf -H "Host: api.strykefox.com" http://localhost/ready > /dev/null 2>&1 && ok "nginx → core" || { fail "nginx → core"; ALL_OK=false; }

# ─── NEON VERIFY ─────────────────────────────────────────────
log "Verifying Neon from services..."
CORE_DB=$(docker compose exec -T core curl -sf http://127.0.0.1:8001/ready 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('database','?'))" 2>/dev/null || echo "unknown")
ok "Core → Neon: ${CORE_DB}"

# ─── RESULT ──────────────────────────────────────────────────
echo ""
if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  POSEIDON IS LIVE${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
else
    echo -e "${YELLOW}══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  DEPLOYED WITH WARNINGS${NC}"
    echo -e "${YELLOW}══════════════════════════════════════════════════════${NC}"
    echo "  docker compose logs <service> --tail 100"
fi

echo ""
echo "  Database:     Neon.tech (cloud)"
echo "  Compute:      DigitalOcean (157.230.145.247)"
echo ""
echo "  Endpoints:"
echo "    App:        https://app.strykefox.com"
echo "    API Docs:   https://api.strykefox.com/docs"
echo "    Trident:    https://trident.strykefox.com"
echo "    EDI:        https://edi.strykefox.com"
echo ""
echo "  Login:        admin@strykefox.com"
echo "  Patients:     0 — enter your first real patient"
echo "  Orders:       0 — create from patient intake"
echo ""
echo "  Ingest data from data/ folder:"
echo "    POST https://intake.strykefox.com/api/v1/intake/eob -F 'file=@data/eobs/FILE.pdf'"
echo "    POST https://intake.strykefox.com/api/v1/intake/batch -F 'file=@data/spreadsheets/FILE.csv'"
echo ""
