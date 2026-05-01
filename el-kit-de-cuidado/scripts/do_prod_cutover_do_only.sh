#!/usr/bin/env bash
# POSEIDON OS - STRYKER OS DEPLOYMENT ENGINE
set -euo pipefail

HOST="root@157.230.145.247"
REMOTE_PATH="/opt/poseidon"

echo "🚀 Starting Poseidon OS Production Deploy..."

# 1. Sync local changes to Droplet (Excluding bloat)
rsync -avz --exclude '.git' --exclude 'node_modules' --exclude '.next' \
      --exclude 'data/' --exclude 'backups/' \
      ./ $HOST:$REMOTE_PATH/

# 2. Remote Execution
ssh $HOST << 'EOF'
  cd /opt/poseidon
  
  # Ensure Nginx is configured for the edge
  if [ ! -f /etc/nginx/sites-enabled/poseidon ]; then
    ln -sf /opt/poseidon/nginx/poseidon.conf /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
  fi

  # Pull images and restart
  docker compose pull
  docker compose up -d --remove-orphans

  # Verify Readiness
  bash scripts/poc_verify.sh http://127.0.0.1
EOF

echo "✅ Deploy Complete. Verification PASSED."
