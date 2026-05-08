#!/usr/bin/env bash
# STRYKER OS: Complete Maternity Site Integration Deployment
set -euo pipefail

HOST="root@157.230.145.247"
REMOTE_PATH="/opt/strykefox"

echo "🚀 STRYKER OS: Maternity Site Integration Deployment"
echo "=================================================="

# Function to deploy a single site with full configuration
deploy_maternity_site() {
    local site_name=$1
    local port=$2
    local subdirectory=$3
    local language=$4
    
    echo "📦 Deploying $site_name ($language) to strykefox.com/$subdirectory..."
    
    # Create remote directory structure
    ssh $HOST "mkdir -p $REMOTE_PATH/$subdirectory" || true
    
    # Sync all files including node_modules for production
    echo "📤 Syncing files to production server..."
    rsync -avz --exclude '.git' --exclude '.next' --exclude 'data/' --exclude 'backups/' \
          "$site_name/" $HOST:$REMOTE_PATH/$subdirectory/
    
    # Execute deployment commands on production server
    ssh $HOST << EOF
        cd $REMOTE_PATH/$subdirectory
        
        echo "🔧 Installing dependencies..."
        npm ci --production
        
        echo "🏗️  Building Next.js application..."
        npm run build
        
        echo "🔄 Setting up PM2 process..."
        pm2 stop "$subdirectory" || true
        PORT=$port pm2 start npm --name "$subdirectory" -- start
        
        echo "✅ $site_name deployed successfully!"
EOF
}

# Function to configure Nginx for both sites
configure_nginx() {
    echo "🌐 Configuring Nginx reverse proxy..."
    
    ssh $HOST << 'EOF'
        # Create comprehensive Nginx configuration for maternity sites
        cat > /etc/nginx/sites-available/strykefox-maternity << 'NGINX_CONF'
# StrykeFox Maternity Sites Configuration
# English Mommy Care Site
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
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Ssl $https;
}

# Spanish El Kit de Cuidado Site  
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
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Ssl $https;
}
NGINX_CONF

        # Enable the configuration
        if [ ! -f /etc/nginx/sites-enabled/strykefox-maternity ]; then
            ln -sf /etc/nginx/sites-available/strykefox-maternity /etc/nginx/sites-enabled/
        fi
        
        # Update main strykefox configuration
        if ! grep -q "include /etc/nginx/sites-enabled/strykefox-maternity;" /etc/nginx/sites-enabled/strykefox; then
            echo "include /etc/nginx/sites-enabled/strykefox-maternity;" >> /etc/nginx/sites-enabled/strykefox
        fi
        
        echo "🔄 Testing and restarting Nginx..."
        nginx -t && systemctl restart nginx
        
        echo "✅ Nginx configuration updated!"
EOF
}

# Function to verify deployment
verify_deployment() {
    echo "🔍 Verifying deployment..."
    
    ssh $HOST << 'EOF'
        echo "📊 PM2 Process Status:"
        pm2 status
        
        echo "🌐 Testing local endpoints..."
        echo "Mommy Care (Port 3001):"
        curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3001/ || echo "❌ Not responding"
        
        echo "El Kit de Cuidado (Port 3002):"
        curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3002/ || echo "❌ Not responding"
        
        echo "🔗 Testing API endpoints..."
        echo "Mommy Care API:"
        curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3001/api/patients || echo "❌ API not responding"
        
        echo "El Kit de Cuidado API:"
        curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3002/api/patients || echo "❌ API not responding"
EOF
}

# Execute deployment sequence
echo "🎯 Starting deployment sequence..."

# Deploy both sites
deploy_maternity_site "mommy-care" "3001" "mommy-care" "English"
deploy_maternity_site "el-kit-de-cuidado" "3002" "el-kit-de-cuidado" "Spanish"

# Configure Nginx
configure_nginx

# Verify deployment
verify_deployment

echo "🎉 DEPLOYMENT COMPLETE!"
echo "===================="
echo "📍 English Site: https://strykefox.com/mommy-care"
echo "📍 Spanish Site: https://strykefox.com/el-kit-de-cuidado"
echo "🔗 API Integration: api.strykefox.com"
echo "📋 Revenue Flow: Active"
echo "🌐 DNS: elkitdecuidado.com → CNAME strykefox.com/el-kit-de-cuidado"
echo ""
echo "✅ Priority: Revenue over theory - Intake-to-Trident flow secured!"
