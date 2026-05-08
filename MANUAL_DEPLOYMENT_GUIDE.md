# Manual Deployment Guide - Maternity Sites to StrykeFox Platform

## 🚀 HOW TO DEPLOY MANUALLY

### Step 1: Access the Production Server
```bash
# SSH into the production server
ssh root@157.230.145.247
# Enter your password when prompted
```

### Step 2: Prepare Directory Structure
```bash
# Create strykefox directory if it doesn't exist
mkdir -p /opt/strykefox
cd /opt/strykefox

# Remove existing sites if present (fresh install)
rm -rf mommy-care el-kit-de-cuidado
```

### Step 3: Copy Files from Local to Server
**On your local machine (in separate terminal windows):**

```bash
# Copy Mommy Care (English site)
cd /Volumes/WORKSPACE/poseidon\ 2
scp -r mommy-care/ root@157.230.145.247:/opt/strykefox/

# Copy El Kit de Cuidado (Spanish site)  
scp -r el-kit-de-cuidado/ root@157.230.145.247:/opt/strykefox/
```

### Step 4: Deploy Mommy Care Site (English)
**On the production server:**
```bash
cd /opt/strykefox/mommy-care

# Install dependencies
npm ci --production

# Build the application
npm run build

# Start with PM2
pm2 stop mommy-care || true
PORT=3001 pm2 start npm --name "mommy-care" -- start

# Verify it's running
curl http://localhost:3001/
```

### Step 5: Deploy El Kit de Cuidado Site (Spanish)
**On the production server:**
```bash
cd /opt/strykefox/el-kit-de-cuidado

# Install dependencies
npm ci --production

# Build the application
npm run build

# Start with PM2
pm2 stop el-kit-de-cuidado || true
PORT=3002 pm2 start npm --name "el-kit-de-cuidado" -- start

# Verify it's running
curl http://localhost:3002/
```

### Step 6: Configure Nginx
**On the production server:**
```bash
# Create Nginx configuration for maternity sites
cat > /etc/nginx/sites-available/strykefox-maternity << 'EOF'
# StrykeFox Maternity Sites Configuration
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
}
EOF

# Enable the configuration
ln -sf /etc/nginx/sites-available/strykefox-maternity /etc/nginx/sites-enabled/

# Update main strykefox configuration
echo "include /etc/nginx/sites-enabled/strykefox-maternity;" >> /etc/nginx/sites-enabled/strykefox

# Test and restart Nginx
nginx -t
systemctl restart nginx
```

### Step 7: Set Environment Variables
**On the production server:**
```bash
# Set up API environment variables
cd /opt/strykefox/mommy-care
echo "POSEIDON_API_URL=https://api.strykefox.com" >> .env
echo "POSEIDON_API_KEY=your_api_key_here" >> .env

cd /opt/strykefox/el-kit-de-cuidado  
echo "POSEIDON_API_URL=https://api.strykefox.com" >> .env
echo "POSEIDON_API_KEY=your_api_key_here" >> .env

# Restart PM2 processes to pick up env vars
pm2 restart mommy-care
pm2 restart el-kit-de-cuidado
```

### Step 8: Verify Deployment
**On the production server:**
```bash
# Check PM2 status
pm2 status

# Test local endpoints
curl -I http://localhost:3001/
curl -I http://localhost:3002/

# Test API endpoints
curl -I http://localhost:3001/api/patients
curl -I http://localhost:3002/api/patients
```

### Step 9: Test Live Sites
**From your local machine:**
```bash
# Test English site
curl -I https://strykefox.com/mommy-care/

# Test Spanish site
curl -I https://strykefox.com/el-kit-de-cuidado/
```

### Step 10: Test Intake Form API
**From your local machine:**
```bash
# Test English API
curl -X POST https://strykefox.com/mommy-care/api/patients \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test@example.com","phone":"555-0123","dateOfBirth":"1990-01-01","address":"123 Main St","city":"Test City","state":"CA","zipCode":"90210"}'

# Test Spanish API
curl -X POST https://strykefox.com/el-kit-de-cuidado/api/patients \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test@example.com","phone":"555-0123","dateOfBirth":"1990-01-01","address":"123 Main St","city":"Test City","state":"CA","zipCode":"90210"}'
```

## 🔍 TROUBLESHOOTING

### If sites show 404:
```bash
# Check if PM2 processes are running
pm2 status

# Check if ports are responding
netstat -tlnp | grep :3001
netstat -tlnp | grep :3002

# Check Nginx configuration
nginx -t
```

### If API calls fail:
```bash
# Check environment variables
cat /opt/strykefox/mommy-care/.env
cat /opt/strykefox/el-kit-de-cuidado/.env

# Test API directly
curl http://localhost:3001/api/patients
```

### If Nginx issues:
```bash
# Check Nginx status
systemctl status nginx

# Check Nginx error log
tail -f /var/log/nginx/error.log

# Restart Nginx
systemctl restart nginx
```

## 🎯 SUCCESS INDICATORS

✅ Both sites return HTTP 200
✅ PM2 processes running on ports 3001 & 3002  
✅ API endpoints respond correctly
✅ Patient data flows to Poseidon Core
✅ Revenue generation path active

## 📞 SUPPORT

If you encounter issues:
1. Check the troubleshooting steps above
2. Verify all commands executed successfully
3. Ensure POSEIDON_API_KEY is set correctly
4. Test locally first, then live
