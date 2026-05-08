#!/usr/bin/env bash
# POSEIDON OS - Production Deployment Script
set -euo pipefail

HOST="root@157.230.145.247"
REMOTE_PATH="/opt/poseidon"

echo "🚀 Starting Poseidon OS Deployment to Production..."

# 1. Sync local changes to Droplet (Excluding bloat)
echo "📦 Syncing code to production server..."
rsync -avz --exclude '.git' --exclude 'node_modules' --exclude '.next' \
      --exclude 'data/' --exclude 'backups/' \
      ./ $HOST:$REMOTE_PATH/

# 2. Remote Execution - Build and Deploy
echo "🔨 Building and deploying application..."
ssh $HOST << 'EOF'
  cd /opt/poseidon
  
  # Build the application
  echo "Building Next.js application..."
  npm run build
  
  # Ensure Nginx is configured for the edge
  if [ ! -f /etc/nginx/sites-enabled/poseidon ]; then
    echo "Configuring Nginx for edge routing..."
    ln -sf /opt/poseidon/nginx/poseidon.conf /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
  fi

  # Pull images and restart services
  echo "Updating Docker containers..."
  docker compose pull
  docker compose up -d --remove-orphans
  
  # Wait for services to be ready
  echo "Waiting for services to be ready..."
  sleep 30
  
  # Verify Readiness
  echo "Verifying deployment..."
  bash scripts/poc_verify.sh http://127.0.0.1
  
  # Clean up old images
  echo "Cleaning up old Docker images..."
  docker image prune -f
EOF

echo "✅ Deploy Complete. Verification PASSED."
echo "🌐 Application is now live at: https://el-kit-de-cuidado.com"
