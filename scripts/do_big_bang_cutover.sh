#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "" ]]; then
  echo "Usage: $0 <droplet-host-or-ip> [ssh-user]"
  echo "Example: $0 157.230.145.247 root"
  exit 1
fi

HOST="$1"
SSH_USER="${2:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/poseidon}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/poseidon_droplet}"
SSH_OPTS="-o IdentitiesOnly=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=no"

if [[ ! -f "${SSH_KEY}" ]]; then
  echo "Missing SSH key: ${SSH_KEY}"
  exit 1
fi

echo "Deploying POSEIDON compose stack to ${SSH_USER}@${HOST}:${REMOTE_DIR}"

if ! command -v rsync >/dev/null 2>&1; then
  echo "Missing rsync"
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "Missing ssh"
  exit 1
fi

ssh -i "${SSH_KEY}" ${SSH_OPTS} "${SSH_USER}@${HOST}" "echo connected >/dev/null"

rsync -az --delete --delete-excluded \
  -e "ssh -i ${SSH_KEY} ${SSH_OPTS}" \
  --exclude ".git" \
  --exclude "node_modules/" \
  --exclude "frontend/node_modules/" \
  --exclude "services/availity/node_modules/" \
  --exclude ".next" \
  --exclude "frontend/.next/" \
  --exclude "data" \
  --exclude "backups" \
  --exclude "aries 2" \
  --exclude "matia_complete 2" \
  --exclude "matia_complete.zip" \
  --exclude "POSEIDON_GROUND_TRUTH.md" \
  --exclude "stedi-audit-report" \
  "/Volumes/WORKSPACE/poseidon 2/" "${SSH_USER}@${HOST}:${REMOTE_DIR}/"

ssh -i "${SSH_KEY}" ${SSH_OPTS} "${SSH_USER}@${HOST}" "bash -lc '
set -euo pipefail
cd \"${REMOTE_DIR}\"
if [[ ! -f .env ]]; then
  cp .env.template .env
  echo \"Created .env from template. Fill production secrets before go-live.\"
fi
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8001/ready >/dev/null
curl -fsS http://127.0.0.1:8002/ready >/dev/null
curl -fsS http://127.0.0.1:8003/ready >/dev/null
curl -fsS http://127.0.0.1:8004/ready >/dev/null
curl -fsS http://127.0.0.1:8005/live >/dev/null
curl -fsS http://127.0.0.1:8006/health >/dev/null
curl -fsS http://127.0.0.1/healthz >/dev/null
echo \"Remote compose health checks passed.\"
'"

echo
echo "Deployment command sequence completed."
echo "Next:"
echo "  1) Update DNS records away from Render targets."
echo "  2) Run: bash scripts/audit_no_render_pointers.sh"
