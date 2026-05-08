#!/usr/bin/env bash
# POSEIDON OS - Bilingual Maternity Sites Deployment to strykefox.com
set -euo pipefail

HOST="root@157.230.145.247"
REMOTE_PATH="/opt/strykefox"
MOMMY_CARE_PATH="$REMOTE_PATH/mommy-care"
EL_KIT_PATH="$REMOTE_PATH/el-kit-de-cuidado"

echo "Starting bilingual maternity sites deployment to strykefox.com..."

# Determine which site to deploy based on current directory
CURRENT_DIR=$(basename "$PWD")
if [ "$CURRENT_DIR" = "mommy-care" ]; then
    SITE_NAME="Mommy Care"
    SITE_PATH="$MOMMY_CARE_PATH"
    PORT=3001
    SUBDIRECTORY="mommy-care"
elif [ "$CURRENT_DIR" = "el-kit-de-cuidado" ]; then
    SITE_NAME="El Kit de Cuidado"
    SITE_PATH="$EL_KIT_PATH"
    PORT=3002
    SUBDIRECTORY="el-kit-de-cuidado"
else
    echo "Error: Must be run from either mommy-care or el-kit-de-cuidado directory"
    exit 1
fi

echo "Deploying $SITE_NAME to strykefox.com/$SUBDIRECTORY..."

# 1. Build the application locally first
echo "Building Next.js application..."
npm run build

# 2. Sync to production server
echo "Syncing code to production server..."
rsync -avz --exclude '.git' --exclude 'node_modules' \
      --exclude '.next' --exclude 'data/' --exclude 'backups/' \
      ./ $HOST:$SITE_PATH/

# 3. Remote execution for deployment
ssh $HOST << EOF
  cd $SITE_PATH
  
  # Install dependencies
  echo "Installing dependencies..."
  npm ci --production
  
  # Build the application
  echo "Building Next.js application..."
  npm run build
  
  # Ensure proper permissions
  chown -R www-data:www-data $SITE_PATH
  chmod -R 755 $SITE_PATH
  
  # Update Nginx configuration for $SUBDIRECTORY subdirectory
  echo "Configuring Nginx for $SUBDIRECTORY subdirectory..."
  cat > /etc/nginx/sites-available/$SUBDIRECTORY << 'NGINX_CONF'
location /$SUBDIRECTORY/ {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_cache_bypass \$http_upgrade;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Server \$host;
}
NGINX_CONF
  
  # Enable site
  if [ ! -f /etc/nginx/sites-enabled/$SUBDIRECTORY ]; then
    ln -sf /etc/nginx/sites-available/$SUBDIRECTORY /etc/nginx/sites-enabled/
  fi
  
  # Update main strykefox configuration to include this site
  if ! grep -q "include /etc/nginx/sites-enabled/$SUBDIRECTORY;" /etc/nginx/sites-enabled/strykefox; then
    echo "include /etc/nginx/sites-enabled/$SUBDIRECTORY;" >> /etc/nginx/sites-enabled/strykefox
  fi
  
  # Test and reload Nginx
  nginx -t && systemctl reload nginx
  
  # Start/Restart the Next.js server
  echo "Starting Next.js server for $SITE_NAME..."
  
  # Kill existing process if running
  pkill -f "PORT=$PORT" || true
  
  # Start new process
  cd $SITE_PATH
  PORT=$PORT nohup npm start > /dev/null 2>&1 &
  
  echo "$SITE_NAME deployment completed!"
EOF

echo "Deployment complete! $SITE_NAME is now available at: https://strykefox.com/$SUBDIRECTORY"
