#!/bin/bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}►${NC} $1"; }
ok()   { echo -e "  ${GREEN}✅${NC} $1"; }
fail() { echo -e "  ${RED}❌${NC} $1"; }

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  POSEIDON — LOCAL / DOCKER PREFLIGHT${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""

cd "$(dirname "$0")"

if [ "$#" -gt 0 ]; then
    log "Extra arguments ignored: $*"
fi

log "Running repo validation (frontend production build + Python compile + compose config)..."
bash scripts/verify_deploy_readiness.sh
ok "Repo validation passed"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  PREFLIGHT COMPLETE${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo "  Runtime:     Docker Compose (see docker-compose.yml)"
echo ""
echo "  Bring up the full stack:"
echo "    bash scripts/docker-up.sh"
echo "    # or: docker compose up -d --build"
echo ""
echo "  Then open (via nginx): http://localhost/  (dashboard)"
echo "  Core readiness:        http://127.0.0.1:8001/ready"
echo ""
