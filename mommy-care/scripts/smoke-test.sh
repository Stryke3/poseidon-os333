#!/usr/bin/env bash
# STRYKER OS - Smoke Test for Michael Garcher Case
set -euo pipefail

API_BASE="http://localhost:3001/api/lite"
PATIENT_ID="michael-garcher-test"

echo "🧪 Starting STRYKER OS Smoke Test for Michael Garcher..."
echo "Patient ID: $PATIENT_ID"
echo ""

# Test 1: Package Optimization
echo "📦 Testing Package Optimization..."
OPTIMIZATION_RESULT=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"extracted_procedure": "Total Knee Arthroplasty", "patient_id": "'$PATIENT_ID'"}' \
  "$API_BASE/optimizer" | jq -r '.optimization_score')

if [ -z "$OPTIMIZATION_RESULT" ]; then
  echo "❌ Package Optimization failed"
  exit 1
fi

echo "✅ Package Optimization Score: $OPTIMIZATION_RESULT%"
echo ""

# Test 2: Extraction Process
echo "🔍 Testing Extraction Process..."
EXTRACTION_RESULT=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"patient_id": "'$PATIENT_ID'", "extraction_confidence": 0.95}' \
  "$API_BASE/main" | jq -r '.status')

if [ "$EXTRACTION_RESULT" != "success" ]; then
  echo "❌ Extraction Process failed"
  exit 1
fi

echo "✅ Extraction Process: $EXTRACTION_RESULT"
echo ""

# Test 3: POD Generation
echo "📄 Testing POD Generation..."
POD_RESULT=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"patient_id": "'$PATIENT_ID'"}' \
  "$API_BASE/patients/$PATIENT_ID/generate/pod" | jq -r '.delivery_confirmation')

if [ -z "$POD_RESULT" ]; then
  echo "❌ POD Generation failed"
  exit 1
fi

echo "✅ POD Generation: $POD_RESULT"
echo ""

# Test 4: Dashboard Integration
echo "📊 Testing Dashboard Integration..."
DASHBOARD_RESULT=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"patient_id": "'$PATIENT_ID'"}' \
  "$API_BASE/patients/$PATIENT_ID/generated" | jq -r '.optimization_score')

if [ -z "$DASHBOARD_RESULT" ]; then
  echo "❌ Dashboard Integration failed"
  exit 1
fi

echo "✅ Dashboard Optimization Score: $DASHBOARD_RESULT%"

# Final Verification
echo ""
echo "🎯 SMOKE TEST SUMMARY"
echo "========================"
echo "Package Optimization: ✅ $OPTIMIZATION_RESULT%"
echo "Extraction Process: ✅ $EXTRACTION_RESULT"
echo "POD Generation: ✅ $POD_RESULT"
echo "Dashboard Integration: ✅ $DASHBOARD_RESULT%"
echo ""

if [ "$OPTIMIZATION_RESULT" -gt 80 ] && [ "$EXTRACTION_RESULT" = "success" ] && [ "$DASHBOARD_RESULT" -gt 80 ]; then
  echo "🎉 Michael Garcher case: BLOCKED → SWO READY"
  echo "✅ E2E Flow Complete!"
  exit 0
else
  echo "⚠️  Michael Garcher case: Issues detected"
  exit 1
fi
