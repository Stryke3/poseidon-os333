#!/bin/bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}►${NC} $1"; }
ok()   { echo -e "  ${GREEN}✅${NC} $1"; }
fail() { echo -e "  ${RED}❌${NC} $1"; }

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  POSEIDON — RENDER-FIRST DEPLOY${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""

cd "$(dirname "$0")"

if [ "$#" -gt 0 ]; then
    log "Ignoring legacy arguments; this script now runs Render-first validation only"
fi

log "Render-first preflight..."
bash scripts/verify_deploy_readiness.sh
ok "Repo validation passed"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  LOCAL VALIDATION COMPLETE${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo "  Production source of truth:"
echo "    Code:        GitHub"
echo "    Runtime:     Render"
echo "    Services:    render.yaml"
echo ""
echo "  Next steps:"
echo "    1. Push the current branch to GitHub"
echo "    2. Verify Render env vars for each backend service, especially DATABASE_URL"
echo "    3. Confirm health and logs in the Render dashboard after deploy"
echo ""
