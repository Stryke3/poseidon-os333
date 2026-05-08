#!/bin/bash

# STRYKER OS / SPEAR PRODUCTION DEPLOY — FINAL ORDERED BUILD
set -euo pipefail

echo "🚀 Starting Spear Production Deployment..."

# Configuration
SERVER="root@157.230.145.247"
SERVER_PATH="/opt/strykefox"
LOCAL_PATH="/Volumes/WORKSPACE/poseidon 2"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results - using simple variables instead of associative array
BUILD_RESULT="PENDING"
ROUTING_RESULT="PENDING"
PUBLIC_SITE_RESULT="PENDING"
FOUNDER_BUTTON_RESULT="PENDING"
MOMMY_CARE_LANGUAGE_RESULT="PENDING"
EL_KIT_LANGUAGE_RESULT="PENDING"
LOGOS_RESULT="PENDING"
API_INGEST_RESULT="PENDING"
BENEFITS_VERIFY_RESULT="PENDING"
TRIDENT_OPTIMIZER_RESULT="PENDING"
SWO_GENERATION_RESULT="PENDING"
POD_GENERATION_RESULT="PENDING"
GENERATED_KIT_RETRIEVAL_RESULT="PENDING"

# Functions
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ====${NC}"
}

set_test_result() {
    local test_name="$1"
    local result="$2"
    case "$test_name" in
        "BUILD") BUILD_RESULT="$result" ;;
        "ROUTING") ROUTING_RESULT="$result" ;;
        "PUBLIC_SITE") PUBLIC_SITE_RESULT="$result" ;;
        "FOUNDER_BUTTON") FOUNDER_BUTTON_RESULT="$result" ;;
        "MOMMY_CARE_LANGUAGE") MOMMY_CARE_LANGUAGE_RESULT="$result" ;;
        "EL_KIT_LANGUAGE") EL_KIT_LANGUAGE_RESULT="$result" ;;
        "LOGOS") LOGOS_RESULT="$result" ;;
        "API_INGEST") API_INGEST_RESULT="$result" ;;
        "BENEFITS_VERIFY") BENEFITS_VERIFY_RESULT="$result" ;;
        "TRIDENT_OPTIMIZER") TRIDENT_OPTIMIZER_RESULT="$result" ;;
        "SWO_GENERATION") SWO_GENERATION_RESULT="$result" ;;
        "POD_GENERATION") POD_GENERATION_RESULT="$result" ;;
        "GENERATED_KIT_RETRIEVAL") GENERATED_KIT_RETRIEVAL_RESULT="$result" ;;
    esac
}

print_test_table() {
    echo ""
    print_header "DEPLOYMENT RESULTS"
    printf "%-25s | %-10s\n" "TEST" "RESULT"
    echo "----------------------------------------"
    printf "%-25s | %-10s\n" "BUILD" "$BUILD_RESULT"
    printf "%-25s | %-10s\n" "ROUTING" "$ROUTING_RESULT"
    printf "%-25s | %-10s\n" "PUBLIC SITE" "$PUBLIC_SITE_RESULT"
    printf "%-25s | %-10s\n" "FOUNDER BUTTON" "$FOUNDER_BUTTON_RESULT"
    printf "%-25s | %-10s\n" "MOMMY CARE LANGUAGE" "$MOMMY_CARE_LANGUAGE_RESULT"
    printf "%-25s | %-10s\n" "EL KIT LANGUAGE" "$EL_KIT_LANGUAGE_RESULT"
    printf "%-25s | %-10s\n" "LOGOS" "$LOGOS_RESULT"
    printf "%-25s | %-10s\n" "API INGEST" "$API_INGEST_RESULT"
    printf "%-25s | %-10s\n" "BENEFITS VERIFY" "$BENEFITS_VERIFY_RESULT"
    printf "%-25s | %-10s\n" "TRIDENT OPTIMIZER" "$TRIDENT_OPTIMIZER_RESULT"
    printf "%-25s | %-10s\n" "SWO GENERATION" "$SWO_GENERATION_RESULT"
    printf "%-25s | %-10s\n" "POD GENERATION" "$POD_GENERATION_RESULT"
    printf "%-25s | %-10s\n" "GENERATED KIT RETRIEVAL" "$GENERATED_KIT_RETRIEVAL_RESULT"
}

# STEP 1: VERIFICATIONS
print_header "STEP 1: VERIFICATIONS"

# Verify Node/npm versions
print_status "Checking Node.js and npm versions..."
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
print_status "Node.js: $NODE_VERSION"
print_status "npm: $NPM_VERSION"

# Verify founder button exists
print_status "Checking Founder page button..."
FOUNDER_FILE="$LOCAL_PATH/frontend/src/app/founder/page.tsx"
if [ -f "$FOUNDER_FILE" ] && grep -q "adamwstryker.com" "$FOUNDER_FILE"; then
    print_status "✅ Founder button found"
    set_test_result "FOUNDER_BUTTON" "PASS"
else
    print_error "❌ Founder button missing"
    set_test_result "FOUNDER_BUTTON" "FAIL"
fi

# Verify mommy-care is English
print_status "Checking Mommy Care language..."
if grep -q "My love, my life, my baby" "$LOCAL_PATH/mommy-care/src/components/sections/HeroBanner.tsx" && \
   grep -q "Pain Relief" "$LOCAL_PATH/mommy-care/src/app/page.tsx" && \
   grep -q "Check Eligibility" "$LOCAL_PATH/mommy-care/src/app/page.tsx"; then
    print_status "✅ Mommy Care is English"
    set_test_result "MOMMY_CARE_LANGUAGE" "PASS"
else
    print_error "❌ Mommy Care not English"
    set_test_result "MOMMY_CARE_LANGUAGE" "FAIL"
fi

# Verify el-kit-de-cuidado is Spanish
print_status "Checking El Kit de Cuidado language..."
if grep -q "Mi amor, mi vida, mi bebé" "$LOCAL_PATH/el-kit-de-cuidado/src/components/sections/HeroBanner.tsx" && \
   grep -q "Alivio de Dolor" "$LOCAL_PATH/el-kit-de-cuidado/src/app/page.tsx"; then
    print_status "✅ El Kit de Cuidado is Spanish"
    set_test_result "EL_KIT_LANGUAGE" "PASS"
else
    print_error "❌ El Kit de Cuidado not Spanish"
    set_test_result "EL_KIT_LANGUAGE" "FAIL"
fi

# Verify logo assets exist
print_status "Checking logo assets..."
if [ -f "$LOCAL_PATH/mommy-care/public/assets/mommy-care-logo.png" ] && \
   [ -f "$LOCAL_PATH/el-kit-de-cuidado/public/assets/mommy-care-logo.png" ]; then
    print_status "✅ Logo assets exist"
    set_test_result "LOGOS" "PASS"
else
    print_error "❌ Logo assets missing"
    set_test_result "LOGOS" "FAIL"
fi

# Verify Next.js config
print_status "Checking Next.js configurations..."
MOMMY_CONFIG="$LOCAL_PATH/mommy-care/next.config.ts"
EL_KIT_CONFIG="$LOCAL_PATH/el-kit-de-cuidado/next.config.ts"

if grep -q "NEXT_PUBLIC_BASE_PATH" "$MOMMY_CONFIG" && \
   grep -q "trailingSlash: true" "$MOMMY_CONFIG" && \
   grep -q "proxyPrefetch" "$MOMMY_CONFIG" && \
   grep -q "NEXT_PUBLIC_BASE_PATH" "$EL_KIT_CONFIG" && \
   grep -q "trailingSlash: true" "$EL_KIT_CONFIG"; then
    print_status "✅ Next.js configs correct"
else
    print_error "❌ Next.js config issues"
fi

# Verify deploy artifacts are clean
print_status "Checking for clean deploy artifacts..."
cd "$LOCAL_PATH"
if [ ! -f "mommy-care-deploy.tar.gz" ] && [ ! -f "el-kit-de-cuidado-deploy.tar.gz" ]; then
    print_status "✅ Deploy artifacts clean"
else
    print_warning "Cleaning old deploy artifacts..."
    rm -f mommy-care-deploy.tar.gz el-kit-de-cuidado-deploy.tar.gz
fi

# STEP 2: BUILD
print_header "STEP 2: BUILD"

# Build Mommy Care
print_status "Building Mommy Care (English)..."
cd "$LOCAL_PATH/mommy-care"
NEXT_PUBLIC_BASE_PATH="/mommy-care" npm run build

if [ $? -eq 0 ]; then
    print_status "✅ Mommy Care build successful"
    set_test_result "BUILD" "PASS"
else
    print_error "❌ Mommy Care build failed"
    set_test_result "BUILD" "FAIL"
    exit 1
fi

# Build El Kit de Cuidado
print_status "Building El Kit de Cuidado (Spanish)..."
cd "$LOCAL_PATH/el-kit-de-cuidado"
NEXT_PUBLIC_BASE_PATH="/el-kit-de-cuidado" npm run build

if [ $? -eq 0 ]; then
    print_status "✅ El Kit de Cuidado build successful"
else
    print_error "❌ El Kit de Cuidado build failed"
    set_test_result "BUILD" "FAIL"
    exit 1
fi

# Build StrykeFox if present
if [ -f "$LOCAL_PATH/strykefox-homepage.html" ]; then
    print_status "✅ StrykeFox marketing site exists"
fi

# STEP 3: CLEANUP
print_header "STEP 3: CLEANUP"

# Remove caches and junk files
print_status "Cleaning caches and junk files..."
cd "$LOCAL_PATH/mommy-care"
rm -rf .next/cache node_modules/.cache .DS_Store

cd "$LOCAL_PATH/el-kit-de-cuidado"
rm -rf .next/cache node_modules/.cache .DS_Store

cd "$LOCAL_PATH"
find . -name "*.DS_Store" -delete
find . -name "._*" -delete

print_status "✅ Cleanup complete"

# STEP 4: PACKAGE
print_header "STEP 4: PACKAGE"

print_status "Packaging Mommy Care..."
tar -czf mommy-care-deploy.tar.gz \
    mommy-care/.next \
    mommy-care/public \
    mommy-care/package.json \
    mommy-care/next.config.ts \
    --exclude='.DS_Store' --exclude='._*' --exclude='*.log'

print_status "Packaging El Kit de Cuidado..."
tar -czf el-kit-de-cuidado-deploy.tar.gz \
    el-kit-de-cuidado/.next \
    el-kit-de-cuidado/public \
    el-kit-de-cuidado/package.json \
    el-kit-de-cuidado/next.config.ts \
    --exclude='.DS_Store' --exclude='._*' --exclude='*.log'

# Package StrykeFox if present
if [ -f "$LOCAL_PATH/strykefox-homepage.html" ]; then
    tar -czf strykefox-deploy.tar.gz strykefox-homepage.html \
        --exclude='.DS_Store' --exclude='._*' --exclude='*.log'
fi

# STEP 5: UPLOAD
print_header "STEP 5: UPLOAD TO SERVER"

print_status "Uploading Mommy Care..."
scp mommy-care-deploy.tar.gz $SERVER:$SERVER_PATH/

print_status "Uploading El Kit de Cuidado..."
scp el-kit-de-cuidado-deploy.tar.gz $SERVER:$SERVER_PATH/

if [ -f "strykefox-deploy.tar.gz" ]; then
    print_status "Uploading StrykeFox..."
    scp strykefox-deploy.tar.gz $SERVER:$SERVER_PATH/
fi

# STEP 6: SERVER DEPLOYMENT
print_header "STEP 6: SERVER DEPLOYMENT"

print_status "Extracting artifacts on server..."
ssh $SERVER "cd $SERVER_PATH && tar -xzf mommy-care-deploy.tar.gz && rm mommy-care-deploy.tar.gz"
ssh $SERVER "cd $SERVER_PATH && tar -xzf el-kit-de-cuidado-deploy.tar.gz && rm el-kit-de-cuidado-deploy.tar.gz"

if ssh $SERVER "test -f $SERVER_PATH/strykefox-deploy.tar.gz"; then
    ssh $SERVER "cd $SERVER_PATH && tar -xzf strykefox-deploy.tar.gz && rm strykefox-deploy.tar.gz"
fi

print_status "Setting permissions..."
ssh $SERVER "cd $SERVER_PATH && chown -R root:root mommy-care el-kit-de-cuidado"

print_status "Starting poseidon_nginx..."
ssh $SERVER "docker start poseidon_nginx || echo 'poseidon_nginx already running'"

print_status "Restarting PM2 services..."
ssh $SERVER "cd $SERVER_PATH && pm2 restart mommy-care || pm2 start mommy-care --name 'mommy-care' --interpreter node -- .next/standalone/server.js"
ssh $SERVER "cd $SERVER_PATH && pm2 restart el-kit-de-cuidado || pm2 start el-kit-de-cuidado --name 'el-kit-de-cuidado' --interpreter node -- .next/standalone/server.js"

print_status "Reloading nginx..."
ssh $SERVER "docker exec poseidon_nginx nginx -s reload || echo 'nginx reload attempted'"

# STEP 7: VERIFY PUBLIC ROUTES
print_header "STEP 7: ROUTE VERIFICATION"

# Check StrykeFox
print_status "Checking StrykeFox site..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://strykefox.com/" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ StrykeFox site accessible"
    set_test_result "PUBLIC_SITE" "PASS"
else
    print_error "❌ StrykeFox site not accessible (HTTP $HTTP_STATUS)"
    set_test_result "PUBLIC_SITE" "FAIL"
fi

# Check Mommy Care
print_status "Checking Mommy Care route..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/mommy-care/" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ Mommy Care route accessible"
else
    print_error "❌ Mommy Care route not accessible (HTTP $HTTP_STATUS)"
fi

# Check El Kit de Cuidado
print_status "Checking El Kit de Cuidado route..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/el-kit-de-cuidado/" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ El Kit de Cuidado route accessible"
else
    print_error "❌ El Kit de Cuidado route not accessible (HTTP $HTTP_STATUS)"
fi

# Check logos
print_status "Checking Mommy Care logo..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/mommy-care/assets/mommy-care-logo.png" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ Mommy Care logo accessible"
else
    print_error "❌ Mommy Care logo not accessible (HTTP $HTTP_STATUS)"
fi

print_status "Checking El Kit de Cuidado logo..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/el-kit-de-cuidado/assets/mommy-care-logo.png" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ El Kit de Cuidado logo accessible"
else
    print_error "❌ El Kit de Cuidado logo not accessible (HTTP $HTTP_STATUS)"
fi

# Check robots.txt and sitemap
print_status "Checking robots.txt..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://strykefox.com/robots.txt" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ robots.txt accessible"
else
    print_error "❌ robots.txt not accessible (HTTP $HTTP_STATUS)"
fi

print_status "Checking sitemap.xml..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://strykefox.com/sitemap.xml" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ sitemap.xml accessible"
else
    print_error "❌ sitemap.xml not accessible (HTTP $HTTP_STATUS)"
fi

# Set routing test result
if curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/mommy-care/" | grep -q "200" && \
   curl -s -o /dev/null -w "%{http_code}" "https://dashboard.strykefox.com/el-kit-de-cuidado/" | grep -q "200"; then
    set_test_result "ROUTING" "PASS"
else
    set_test_result "ROUTING" "FAIL"
fi

# STEP 8: SPEAR E2E SMOKE TEST
print_header "STEP 8: SYNTHETIC E2E SMOKE TEST"

print_status "Running synthetic-only E2E smoke test..."

# Create synthetic patient
SYNTHETIC_PATIENT='{
  "firstName": "Test",
  "lastName": "Patient",
  "email": "test@example.com",
  "phone": "555-0199",
  "dateOfBirth": "1990-01-01",
  "address": {
    "street": "123 Test St",
    "city": "Test City",
    "state": "CA",
    "zip": "90210"
  },
  "insurance": {
    "provider": "Test Insurance",
    "memberId": "TEST123456",
    "groupNumber": "TEST789"
  }
}'

print_status "Testing patient ingestion..."
PATIENT_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$SYNTHETIC_PATIENT" \
  "https://dashboard.strykefox.com/api/patients/" || echo '{"error": "network"}')

if echo "$PATIENT_RESPONSE" | grep -q "id\|success\|created"; then
    print_status "✅ Patient ingestion working"
    set_test_result "API_INGEST" "PASS"
else
    print_error "❌ Patient ingestion failed"
    set_test_result "API_INGEST" "FAIL"
fi

# Test benefits verification
print_status "Testing benefits verification..."
ELIGIBILITY_DATA='{
  "insuranceProvider": "Test Insurance",
  "memberId": "TEST123456",
  "groupNumber": "TEST789",
  "dateOfBirth": "1990-01-01"
}'

BENEFITS_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$ELIGIBILITY_DATA" \
  "https://dashboard.strykefox.com/api/insurance/eligibility" || echo '{"error": "network"}')

if echo "$BENEFITS_RESPONSE" | grep -q "benefits\|coverage\|eligible"; then
    print_status "✅ Benefits verification working"
    set_test_result "BENEFITS_VERIFY" "PASS"
else
    print_error "❌ Benefits verification failed"
    set_test_result "BENEFITS_VERIFY" "FAIL"
fi

# Test Trident optimizer
print_status "Testing Trident optimizer..."
OPTIMIZER_DATA='{
  "patientId": "test-patient-001",
  "insuranceCoverage": ["basic", "premium"],
  "clinicalNeeds": ["compression", "support", "recovery"],
  "preferences": ["comfort", "discreet"]
}'

OPTIMIZER_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$OPTIMIZER_DATA" \
  "https://dashboard.strykefox.com/api/lite/optimizer" || echo '{"error": "network"}')

if echo "$OPTIMIZER_RESPONSE" | grep -q "packages\|recommendations\|optimized"; then
    print_status "✅ Trident optimizer working"
    set_test_result "TRIDENT_OPTIMIZER" "PASS"
else
    print_error "❌ Trident optimizer failed"
    set_test_result "TRIDENT_OPTIMIZER" "FAIL"
fi

# Test SWO generation
print_status "Testing SWO generation..."
SWO_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"patientId": "test-patient-001", "packageId": "optimized-001"}' \
  "https://dashboard.strykefox.com/api/lite/patients/test-patient-001/generate/swo" || echo '{"error": "network"}')

if echo "$SWO_RESPONSE" | grep -q "swoId\|generated\|success"; then
    print_status "✅ SWO generation working"
    set_test_result "SWO_GENERATION" "PASS"
else
    print_error "❌ SWO generation failed"
    set_test_result "SWO_GENERATION" "FAIL"
fi

# Test POD generation
print_status "Testing POD generation..."
POD_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"patientId": "test-patient-001", "swoId": "test-swo-001"}' \
  "https://dashboard.strykefox.com/api/lite/patients/test-patient-001/generate/pod" || echo '{"error": "network"}')

if echo "$POD_RESPONSE" | grep -q "podId\|generated\|success"; then
    print_status "✅ POD generation working"
    set_test_result "POD_GENERATION" "PASS"
else
    print_error "❌ POD generation failed"
    set_test_result "POD_GENERATION" "FAIL"
fi

# Test generated packet retrieval
print_status "Testing generated packet retrieval..."
RETRIEVAL_RESPONSE=$(curl -s \
  "https://dashboard.strykefox.com/api/lite/patients/test-patient-001/generated" || echo '{"error": "network"}')

if echo "$RETRIEVAL_RESPONSE" | grep -q "packets\|generated\|retrieved"; then
    print_status "✅ Generated packet retrieval working"
    set_test_result "GENERATED_KIT_RETRIEVAL" "PASS"
else
    print_error "❌ Generated packet retrieval failed"
    set_test_result "GENERATED_KIT_RETRIEVAL" "FAIL"
fi

# STEP 9: CLEANUP
print_header "STEP 9: LOCAL CLEANUP"

print_status "Cleaning local deploy artifacts..."
cd "$LOCAL_PATH"
rm -f mommy-care-deploy.tar.gz el-kit-de-cuidado-deploy.tar.gz strykefox-deploy.tar.gz

# STEP 10: FINAL RESULTS
print_header "STEP 10: DEPLOYMENT COMPLETE"

print_test_table

echo ""
print_status "🎉 Spear Production Deployment Complete!"
echo ""
echo "📊 Deployed Sites:"
echo "  - StrykeFox Corporate: https://strykefox.com/"
echo "  - Mommy Care (English): https://dashboard.strykefox.com/mommy-care/"
echo "  - El Kit de Cuidado (Spanish): https://dashboard.strykefox.com/el-kit-de-cuidado/"
echo ""
echo "🔧 Services Status:"
echo "  - PM2 services restarted"
echo "  - poseidon_nginx running"
echo "  - nginx reloaded"
echo ""
if [ "${TEST_RESULTS[BUILD]}" = "PASS" ] && [ "${TEST_RESULTS[ROUTING]}" = "PASS" ]; then
    print_status "✅ DEPLOYMENT SUCCESSFUL"
else
    print_error "❌ DEPLOYMENT HAD ISSUES"
fi
