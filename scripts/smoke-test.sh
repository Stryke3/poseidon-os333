#!/bin/bash

# POSEIDON OS Smoke Test Script
# Tests critical service health and document generation pipeline

set -e

echo "🔍 POSEIDON OS Smoke Test Starting..."
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Testing $name... "
    
    if curl -f -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_status"; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo "  Expected: $expected_status, Got: $(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "connection_failed")"
        return 1
    fi
}

# Test service health
echo "🏥 Testing Service Health..."
echo "-------------------------"

test_endpoint "Core API" "http://localhost:8001/ready" "200"
test_endpoint "Trident API" "http://localhost:8002/ready" "200" 
test_endpoint "Intake API" "http://localhost:8003/ready" "200"
test_endpoint "ML API" "http://localhost:8004/ready" "200"
test_endpoint "EDI API" "http://localhost:8006/health" "200"
test_endpoint "Lite API" "http://localhost:8010/health" "200"
test_endpoint "Dashboard" "http://localhost:3000/api/health" "200"

# Test database connectivity
echo ""
echo "🗄️ Testing Database Connectivity..."
echo "----------------------------------"

test_endpoint "Core DB Check" "http://localhost:8001/ready" "200"

# Test MinIO connectivity
echo ""
echo "📦 Testing Object Storage..."
echo "---------------------------"

test_endpoint "MinIO Health" "http://localhost:9000/minio/health/live" "200"

# Test document generation pipeline
echo ""
echo "📄 Testing Document Generation Pipeline..."
echo "-----------------------------------------"

# Create a test patient first
echo -n "Creating test patient... "
PATIENT_RESPONSE=$(curl -s -X POST "http://localhost:8010/patients" \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Key: poseidon-local-internal-key" \
  -d '{
    "first_name": "Test",
    "last_name": "Patient",
    "dob": "1990-01-01",
    "payer_name": "Test Payer",
    "member_id": "TEST123",
    "ordering_provider": "Dr. Test Provider",
    "provider_npi": "1234567890",
    "diagnosis_codes": ["M17.9"],
    "hcpcs_codes": ["L1833"]
  }' || echo "failed")

if echo "$PATIENT_RESPONSE" | grep -q "id"; then
    echo -e "${GREEN}✅ PASS${NC}"
    PATIENT_ID=$(echo "$PATIENT_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "  Patient ID: $PATIENT_ID"
else
    echo -e "${RED}❌ FAIL${NC}"
    echo "  Response: $PATIENT_RESPONSE"
    exit 1
fi

# Test SWO generation
echo -n "Testing SWO generation... "
SWO_RESPONSE=$(curl -s -X POST "http://localhost:8010/patients/$PATIENT_ID/generate/swo" \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Key: poseidon-local-internal-key" || echo "failed")

if echo "$SWO_RESPONSE" | grep -q "id"; then
    echo -e "${GREEN}✅ PASS${NC}"
    SWO_ID=$(echo "$SWO_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "  SWO ID: $SWO_ID"
else
    echo -e "${RED}❌ FAIL${NC}"
    echo "  Response: $SWO_RESPONSE"
    exit 1
fi

# Test PDF preview
echo -n "Testing PDF preview... "
PDF_RESPONSE=$(curl -s -I "http://localhost:8010/patients/$PATIENT_ID/generated/$SWO_ID/preview" \
  -H "X-Internal-API-Key: poseidon-local-internal-key" || echo "failed")

if echo "$PDF_RESPONSE" | grep -q "application/pdf"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    echo "  Content-Type: $(echo "$PDF_RESPONSE" | grep -i content-type || echo "none")"
    exit 1
fi

# Test frontend proxy
echo ""
echo "🌐 Testing Frontend API Proxy..."
echo "--------------------------------"

test_endpoint "Frontend Lite Proxy" "http://localhost:3000/api/lite/patients/$PATIENT_ID/generated/$SWO_ID/preview" "200"

# Cleanup test data
echo ""
echo "🧹 Cleaning up test data..."
echo "-------------------------"

curl -s -X DELETE "http://localhost:8010/patients/$PATIENT_ID" \
  -H "X-Internal-API-Key: poseidon-local-internal-key" > /dev/null || echo "Cleanup failed (non-critical)"

echo ""
echo "🎉 All smoke tests passed!"
echo "=========================="
echo "✅ Services are healthy"
echo "✅ Database connectivity working"
echo "✅ Object storage accessible"
echo "✅ Document generation pipeline functional"
echo "✅ PDF generation working"
echo "✅ Frontend proxy working"
echo ""
echo "System is ready for production use."
