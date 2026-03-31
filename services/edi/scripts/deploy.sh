#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# POSEIDON EDI Service — Legacy Deployment Script
# Deprecated: production runtime is GitHub + Render, not a droplet + Compose.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

printf '[EDI] %s\n' 'services/edi/scripts/deploy.sh is deprecated.'
printf '[EDI] %s\n' 'Production deployment now happens from GitHub through Render.'
printf '[EDI] %s\n' 'Use render.yaml, Render env vars, and Render deploy logs for the EDI service.'
printf '[EDI] %s\n' 'If you need schema updates, run bash scripts/run_production_migrations.sh against the managed DATABASE_URL.'
exit 1
