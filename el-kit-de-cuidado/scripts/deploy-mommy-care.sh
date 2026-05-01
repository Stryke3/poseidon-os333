#!/usr/bin/env bash
# POSEIDON OS - Mommy Care Deployment to strykefox.com
set -euo pipefail

HOST="root@157.230.145.247"
REMOTE_PATH="/opt/poseidon"
STRYKEFOX_PATH="/opt/strykefox"
MOMMY_CARE_PATH="$STRYKEFOX_PATH/mommy-care"

echo "Starting Mommy Care deployment to strykefox.com..."

# 1. Build the application locally first
echo "Building Next.js application..."
npm run build

# 2. Sync to POSEIDON server
echo "Syncing code to production server..."
rsync -avz --exclude '.git' --exclude 'node_modules' \
      --exclude '.next' --exclude 'data/' --exclude 'backups/' \
      ./ $HOST:$REMOTE_PATH/

# 3. Remote execution for deployment
ssh $HOST << 'EOF'
  cd /opt/poseidon
  
  # Ensure strykefox directory structure exists
  mkdir -p /opt/strykefox/mommy-care
  
  # Build the application
  echo "Building Next.js application..."
  npm run build
  
  # Copy built files to strykefox mommy-care directory
  echo "Copying built files to strykefox.com/mommy-care..."
  cp -r .next/static /opt/strykefox/mommy-care/
  cp -r public /opt/strykefox/mommy-care/
  cp package.json /opt/strykefox/mommy-care/
  cp -r node_modules /opt/strykefox/mommy-care/
  
  # Update Nginx configuration for mommy-care subdirectory
  echo "Configuring Nginx for mommy-care subdirectory..."
  cat > /etc/nginx/sites-available/mommy-care << 'NGINX_CONF'
location /mommy-care/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
NGINX_CONF
  
  # Enable mommy-care site
  if [ ! -f /etc/nginx/sites-enabled/mommy-care ]; then
    ln -sf /etc/nginx/sites-available/mommy-care /etc/nginx/sites-enabled/
  fi
  
  # Update main strykefox configuration to include mommy-care
  if ! grep -q "include /etc/nginx/sites-enabled/mommy-care;" /etc/nginx/sites-enabled/strykefox; then
    echo "include /etc/nginx/sites-enabled/mommy-care;" >> /etc/nginx/sites-enabled/strykefox
  fi
  
  # Test and reload Nginx
  nginx -t && systemctl reload nginx
  
  # Start the Next.js server for mommy-care
  echo "Starting Next.js server for mommy-care..."
  cd /opt/strykefox/mommy-care
  PORT=3001 nohup npm start > /dev/null 2>&1 &
  
  echo "Mommy Care deployment completed!"
EOF

echo "Deployment complete! Mommy Care is now available at: https://strykefox.com/mommy-care"
