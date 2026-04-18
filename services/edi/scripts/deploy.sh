#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# POSEIDON EDI Service — Legacy droplet deploy script (deprecated)
# Canonical runtime: root docker-compose.yml (EDI service on port 8006).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

printf '[EDI] %s\n' 'services/edi/scripts/deploy.sh is deprecated.'
printf '[EDI] %s\n' 'Run the full stack from the repo root: docker compose up -d --build'
printf '[EDI] %s\n' 'For schema updates: bash scripts/run_production_migrations.sh against your DATABASE_URL.'
exit 1
