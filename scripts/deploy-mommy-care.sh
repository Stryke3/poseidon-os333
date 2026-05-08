#!/bin/bash

# Deploy Mommy Care Kit and El Kit de Cuidado
# This script builds and deploys both bilingual maternity sites

set -e  # Exit on any error

echo "🚀 Starting Mommy Care deployment..."

# Configuration
SERVER="root@157.230.145.247"
SERVER_PATH="/opt/strykefox"
LOCAL_PATH="/Volumes/WORKSPACE/poseidon 2"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Step 1: Build Mommy Care (English)
print_status "Building Mommy Care (English)..."
cd "$LOCAL_PATH/mommy-care"
NEXT_PUBLIC_BASE_PATH="/mommy-care" npm run build

if [ $? -ne 0 ]; then
    print_error "Mommy Care build failed"
    exit 1
fi

# Step 2: Build El Kit de Cuidado (Spanish)
print_status "Building El Kit de Cuidado (Spanish)..."
cd "$LOCAL_PATH/el-kit-de-cuidado"
NEXT_PUBLIC_BASE_PATH="/el-kit-de-cuidado" npm run build

if [ $? -ne 0 ]; then
    print_error "El Kit de Cuidado build failed"
    exit 1
fi

# Step 3: Clear .next cache
print_status "Clearing .next cache..."
cd "$LOCAL_PATH/mommy-care"
rm -rf .next/cache

cd "$LOCAL_PATH/el-kit-de-cuidado"
rm -rf .next/cache

# Step 4: Package both folders
print_status "Packaging Mommy Care..."
cd "$LOCAL_PATH"
tar -czf mommy-care-deploy.tar.gz mommy-care/.next mommy-care/public mommy-care/package.json mommy-care/next.config.ts

print_status "Packaging El Kit de Cuidado..."
tar -czf el-kit-de-cuidado-deploy.tar.gz el-kit-de-cuidado/.next el-kit-de-cuidado/public el-kit-de-cuidado/package.json el-kit-de-cuidado/next.config.ts

# Step 5: Upload to server
print_status "Uploading Mommy Care to server..."
scp mommy-care-deploy.tar.gz $SERVER:$SERVER_PATH/

print_status "Uploading El Kit de Cuidado to server..."
scp el-kit-de-cuidado-deploy.tar.gz $SERVER:$SERVER_PATH/

# Step 6: Extract on server
print_status "Extracting Mommy Care on server..."
ssh $SERVER "cd $SERVER_PATH && tar -xzf mommy-care-deploy.tar.gz && rm mommy-care-deploy.tar.gz"

print_status "Extracting El Kit de Cuidado on server..."
ssh $SERVER "cd $SERVER_PATH && tar -xzf el-kit-de-cuidado-deploy.tar.gz && rm el-kit-de-cuidado-deploy.tar.gz"

# Step 7: Set permissions
print_status "Setting permissions..."
ssh $SERVER "cd $SERVER_PATH && chown -R root:root mommy-care el-kit-de-cuidado"

# Step 8: Restart PM2 services
print_status "Restarting PM2 services..."
ssh $SERVER "cd $SERVER_PATH && pm2 restart mommy-care || pm2 start mommy-care --name 'mommy-care' --interpreter node -- .next/standalone/server.js"
ssh $SERVER "cd $SERVER_PATH && pm2 restart el-kit-de-cuidado || pm2 start el-kit-de-cuidado --name 'el-kit-de-cuidado' --interpreter node -- .next/standalone/server.js"

# Step 9: Start poseidon_nginx if stopped
print_status "Starting poseidon_nginx..."
ssh $SERVER "docker start poseidon_nginx || echo 'poseidon_nginx already running'"

# Step 10: Reload nginx inside docker
print_status "Reloading nginx inside docker..."
ssh $SERVER "docker exec poseidon_nginx nginx -s reload"

# Step 11: Run curl checks
print_status "Running deployment checks..."

# Check Mommy Care
echo "Checking Mommy Care..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/mommy-care/" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ Mommy Care site is accessible (HTTP $HTTP_STATUS)"
else
    print_error "❌ Mommy Care site not accessible (HTTP $HTTP_STATUS)"
fi

# Check El Kit de Cuidado
echo "Checking El Kit de Cuidado..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/el-kit-de-cuidado/" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ El Kit de Cuidado site is accessible (HTTP $HTTP_STATUS)"
else
    print_error "❌ El Kit de Cuidado site not accessible (HTTP $HTTP_STATUS)"
fi

# Check Mommy Care logo
echo "Checking Mommy Care logo..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/mommy-care/assets/mommy-care-logo.png" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ Mommy Care logo is accessible (HTTP $HTTP_STATUS)"
else
    print_error "❌ Mommy Care logo not accessible (HTTP $HTTP_STATUS)"
fi

# Check El Kit de Cuidado logo
echo "Checking El Kit de Cuidado logo..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/el-kit-de-cuidado/assets/mommy-care-logo.png" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ El Kit de Cuidado logo is accessible (HTTP $HTTP_STATUS)"
else
    print_error "❌ El Kit de Cuidado logo not accessible (HTTP $HTTP_STATUS)"
fi

# Step 12: Clean up local files
print_status "Cleaning up local files..."
rm -f mommy-care-deploy.tar.gz el-kit-de-cuidado-deploy.tar.gz

print_status "🎉 Deployment completed!"
echo ""
echo "📊 Summary:"
echo "  - Mommy Care (English): https://dashboard.strykefox.com/mommy-care/"
echo "  - El Kit de Cuidado (Spanish): https://dashboard.strykefox.com/el-kit-de-cuidado/"
echo "  - PM2 services restarted"
echo "  - Nginx reloaded"
echo ""
echo "If any checks failed, please check the server logs:"
echo "  ssh $SERVER 'cd $SERVER_PATH && pm2 logs'"
echo "  ssh $SERVER 'docker logs poseidon_nginx'"
