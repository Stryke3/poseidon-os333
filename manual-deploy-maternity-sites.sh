#!/usr/bin/env bash
# Manual deployment script for maternity sites to fix 404 errors
set -euo pipefail

HOST="root@157.230.145.247"
REMOTE_PATH="/opt/strykefox"

echo "🚀 Starting manual deployment of maternity sites..."

# Function to deploy a single site
deploy_site() {
    local site_name=$1
    local port=$2
    local subdirectory=$3
    
    echo "📦 Deploying $site_name to strykefox.com/$subdirectory..."
    
    # Sync files to production
    echo "📤 Syncing files to production server..."
    rsync -avz --exclude '.git' --exclude 'node_modules' \
          --exclude '.next' --exclude 'data/' --exclude 'backups/' \
          "$site_name/" $HOST:$REMOTE_PATH/$subdirectory/
    
    # Execute remote commands
    ssh $HOST << EOF
        cd $REMOTE_PATH/$subdirectory
        
        echo "🔧 Installing dependencies..."
        npm ci --production
        
        echo "🏗️  Building application..."
        npm run build
        
        echo "🔄 Restarting PM2 process..."
        pm2 stop "$subdirectory" || true
        PORT=$port pm2 start npm --name "$subdirectory" -- start
        
        echo "✅ $site_name deployed successfully!"
EOF
}

# Deploy both sites
deploy_site "mommy-care" "3001" "mommy-care"
deploy_site "el-kit-de-cuidado" "3002" "el-kit-de-cuidado"

# Update Nginx configuration
echo "🌐 Updating Nginx configuration..."
ssh $HOST << 'EOF'
    # Create main Nginx configuration for maternity sites
    cat > /etc/nginx/sites-available/strykefox-maternity << 'NGINX_CONF'
# Maternity Sites Configuration
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
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Server $host;
}

location /el-kit-de-cuidado/ {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Server $host;
}
NGINX_CONF

    # Enable the configuration
    if [ ! -f /etc/nginx/sites-enabled/strykefox-maternity ]; then
        ln -sf /etc/nginx/sites-available/strykefox-maternity /etc/nginx/sites-enabled/
    fi
    
    # Update main strykefox config to include maternity sites
    if ! grep -q "include /etc/nginx/sites-enabled/strykefox-maternity;" /etc/nginx/sites-enabled/strykefox; then
        echo "include /etc/nginx/sites-enabled/strykefox-maternity;" >> /etc/nginx/sites-enabled/strykefox
    fi
    
    echo "🔄 Restarting Nginx..."
    nginx -t && systemctl restart nginx
    
    echo "📊 Checking PM2 status..."
    pm2 status
    
    echo "🌍 Testing sites..."
    curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ || echo "❌ Mommy Care not responding"
    curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/ || echo "❌ El Kit de Cuidado not responding"
    
    echo "✅ Nginx configuration updated!"
EOF

echo "🎉 Deployment completed!"
echo "📍 English site: https://strykefox.com/mommy-care"
echo "📍 Spanish site: https://strykefox.com/el-kit-de-cuidado"
echo "🔍 Test the 5-step intake form to verify api.strykefox.com integration"
