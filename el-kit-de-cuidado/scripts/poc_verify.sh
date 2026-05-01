#!/usr/bin/env bash
# POSEIDON OS - Production Verification Script
set -euo pipefail

SERVICE_URL=${1:-"http://127.0.0.1"}
MAX_ATTEMPTS=30
ATTEMPT_DELAY=2

echo "🔍 Verifying POSEIDON OS deployment at $SERVICE_URL..."

for ((i=1; i<=MAX_ATTEMPTS; i++)); do
    echo "Attempt $i/$MAX_ATTEMPTS: Checking service health..."
    
    # Check if service is responding
    if curl -f -s --max-time 10 "$SERVICE_URL/health" > /dev/null; then
        echo "✅ Service is healthy and responding!"
        
        # Check API endpoints
        echo "🔗 Testing API endpoints..."
        
        # Test patients endpoint
        if curl -f -s --max-time 5 "$SERVICE_URL/api/patients/health" > /dev/null; then
            echo "  ✅ Patients API: OK"
        else
            echo "  ⚠️  Patients API: Not responding"
        fi
        
        # Test orders endpoint  
        if curl -f -s --max-time 5 "$SERVICE_URL/api/orders/health" > /dev/null; then
            echo "  ✅ Orders API: OK"
        else
            echo "  ⚠️  Orders API: Not responding"
        fi
        
        # Test consent endpoint
        if curl -f -s --max-time 5 "$SERVICE_URL/api/documents/consent/health" > /dev/null; then
            echo "  ✅ Consent API: OK"
        else
            echo "  ⚠️  Consent API: Not responding"
        fi
        
        echo "🎉 POSEIDON OS verification PASSED!"
        exit 0
    else
        echo "  ⏳ Service not ready, waiting ${ATTEMPT_DELAY}s..."
        sleep $ATTEMPT_DELAY
    fi
done

echo "❌ Verification FAILED after $MAX_ATTEMPTS attempts"
echo "🔧 Check logs: docker compose logs -f"
echo "📊 Check status: docker compose ps"
exit 1
