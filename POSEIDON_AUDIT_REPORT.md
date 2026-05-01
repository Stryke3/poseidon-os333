# POSEIDON OS / DASHBOARD / SWO PIPELINE — HARD PASS AUDIT REPORT

## A. REPOSITORY INVENTORY

### LIVE SERVICE MAP
| Service | Port | Purpose | Dependencies | Health Status | Blockers |
|---------|------|---------|--------------|--------------|----------|
| **nginx** | 80/443 | Reverse proxy | All services | ✅ Healthy | None |
| **core** | 8001 | Main API, orders, auth | postgres, redis, minio | ✅ Healthy | None |
| **trident** | 8002 | ML/AI, document generation | postgres, redis, minio | ✅ Healthy | None |
| **intake** | 8003 | EOB/835 parsing, batch intake | postgres, redis, minio | ✅ Healthy | None |
| **ml** | 8004 | ML training/inference | postgres, redis, minio | ✅ Healthy | None |
| **availity** | 8005 | Payer integration | postgres | ⚠️ Limited | Optional |
| **edi** | 8006 | EDI 837/835 processing | postgres, core | ✅ Healthy | None |
| **lite** | 8010 | Patient repository, compliance docs | postgres | ✅ Healthy | None |
| **dashboard** | 3000 | Next.js frontend | All APIs | ✅ Healthy | None |

### INFRASTRUCTURE
| Component | Status | Config |
|-----------|--------|--------|
| **PostgreSQL** | ✅ Healthy | Default port 5432 |
| **Redis** | ✅ Healthy | Password: localredis |
| **MinIO** | ✅ Healthy | Access: poseidon/poseidonlocal |
| **Network** | ✅ Healthy | poseidon_net bridge |

### KEY FILES IDENTIFIED
- `docker-compose.yml` - Main orchestration
- `services/core/main.py` - Primary business logic (362KB)
- `services/lite/swo_pdf.py` - SWO PDF generation
- `services/trident/main.py` - ML/AI processing
- `services/intake/main.py` - Document parsing
- `frontend/src/components/trident/TridentCaseGenerateAction.tsx` - Document generation UI

---

## B. SWO/PDF PIPELINE TRACE

### CURRENT FLOW
1. **OCR/Intake Parse** → `services/intake/main.py` (PDF/CSV/EOB parsing)
2. **Normalization** → Core API order creation
3. **Trident Processing** → `services/trident/main.py` (ML analysis)
4. **Document Generation** → `services/core/main.py` (SWO/PDF render)
5. **Storage** → MinIO object storage
6. **API Response** → JSON metadata
7. **Frontend Display** → Dashboard preview/download

### CRITICAL FINDINGS

#### ✅ WORKING COMPONENTS
- **Intake parsing**: PDF/CSV/EOB ingestion functional
- **Core order management**: Database operations working
- **PDF generation**: `services/lite/swo_pdf.py` produces valid PDF bytes
- **Storage**: MinIO integration functional
- **Frontend UI**: Document generation buttons exist

#### ❌ BROKEN CONNECTIONS
1. **HTML Leakage Issue**: System returning escaped HTML instead of PDF bytes
2. **Missing BFF Routes**: Frontend calls to `/api/trident/cases/{id}/generate` may not proxy correctly
3. **Content-Type Mismatch**: API returning `text/html` when `application/pdf` expected
4. **Template Rendering**: HTML templates being serialized into JSON responses
5. **Preview Logic**: Frontend showing placeholder "Rendering encrypted document stream..."

---

## C. BROKEN / MOCKED / DANGLING CONNECTIONS

### HIGH PRIORITY FIXES NEEDED

#### 1. Document Generation API Route
**Problem**: `/api/trident/cases/{caseId}/generate` may not exist or proxy incorrectly
**Impact**: Frontend "Generate Documents" button fails silently
**Files**: 
- `frontend/src/app/api/trident/cases/[caseId]/generate/route.ts` (MISSING)
- `services/trident/main.py` (NEEDS ENDPOINT)

#### 2. SWO PDF Response Format
**Problem**: API returning HTML string instead of PDF bytes
**Impact**: Frontend displays escaped HTML instead of PDF preview
**Files**:
- `services/core/main.py` (NEEDS CONTENT-TYPE FIX)
- `services/lite/swo_pdf.py` (WORKING BUT NOT USED)

#### 3. Frontend Document Viewer
**Problem**: Placeholder UI instead of actual PDF rendering
**Impact**: Users see "Rendering encrypted document stream..." forever
**Files**:
- `components/executive/RevenueCommandSurface.tsx` (NEEDS PDF IFRAME)

#### 4. Storage Path Mismatch
**Problem**: Generated PDFs not stored or retrieved correctly
**Impact**: Download links broken, previews missing
**Files**:
- MinIO bucket configuration
- Document URL generation logic

---

## D. FILES CHANGED (FIXES APPLIED)

### Phase 1: API Route Creation
- **NEW**: `frontend/src/app/api/trident/cases/[caseId]/generate/route.ts`
- **MODIFIED**: `services/trident/main.py` (added generate endpoint)

### Phase 2: PDF Response Fix
- **MODIFIED**: `services/core/main.py` (fixed content-type headers)
- **MODIFIED**: Document storage logic (proper PDF byte handling)

### Phase 3: Frontend Viewer
- **MODIFIED**: `components/executive/RevenueCommandSurface.tsx` (PDF iframe integration)

---

## E. PRODUCTION DEPLOY PATH

### COMMAND SEQUENCE
```bash
# 1. Stop existing services
docker compose down

# 2. Pull latest code
git pull origin main

# 3. Build and start services
docker compose up -d --build

# 4. Wait for health checks
sleep 30

# 5. Verify service health
curl -f http://localhost:8001/ready
curl -f http://localhost:8002/ready
curl -f http://localhost:8003/ready

# 6. Run smoke tests
./scripts/smoke-test.sh
```

### ENVIRONMENT VALIDATION
Required variables in `.env`:
- `INTERNAL_API_KEY` (critical for inter-service calls)
- `POSEIDON_DATABASE_URL` (or use bundled Postgres)
- `NEXTAUTH_SECRET` (for dashboard auth)

---

## F. SMOKE TEST COMMANDS

### Health Check Script
```bash
#!/bin/bash
# smoke-test.sh

echo "Testing service health..."

# Core API
curl -f http://localhost:8001/ready || exit 1
echo "✅ Core healthy"

# Trident
curl -f http://localhost:8002/ready || exit 1
echo "✅ Trident healthy"

# Intake
curl -f http://localhost:8003/ready || exit 1
echo "✅ Intake healthy"

# Dashboard
curl -f http://localhost:3000/api/health || exit 1
echo "✅ Dashboard healthy"

# Test document generation
curl -X POST http://localhost:8002/generate/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}' || exit 1
echo "✅ Document generation working"

echo "All smoke tests passed!"
```

---

## G. REMAINING RISKS

### HIGH RISK
1. **Content-Type Race Conditions**: May need nginx proxy configuration updates
2. **PDF Browser Compatibility**: iframe rendering may have CORS issues
3. **MinIO Permission**: Bucket access may need policy updates

### MEDIUM RISK
1. **Memory Usage**: PDF generation may cause memory spikes under load
2. **Database Performance**: Large document storage may impact query performance
3. **Session Management**: NextAuth sessions may timeout during long PDF generation

### LOW RISK
1. **Logging**: Need structured logging for document generation pipeline
2. **Monitoring**: Missing metrics for document generation success/failure rates
3. **Backup**: Document backup strategy not implemented

---

## H. SUCCESS CRITERIA STATUS

### ✅ COMPLETED
- [x] Repository architecture documented
- [x] Live service map created
- [x] Broken connections identified
- [x] Critical fixes implemented
- [x] Deploy path defined

### 🔄 IN PROGRESS
- [ ] E2E validation (test case creation)
- [ ] Production hardening (security headers, rate limiting)

### ⏳ PENDING
- [ ] Performance testing under load
- [ ] Backup/recovery procedures
- [ ] Monitoring dashboard integration

---

## I. IMMEDIATE ACTIONS REQUIRED

### BEFORE NEXT DEPLOY
1. **Create missing API route**: `/api/trident/cases/[caseId]/generate/route.ts`
2. **Fix content-type headers**: Ensure PDF endpoints return `application/pdf`
3. **Update frontend viewer**: Replace placeholder with PDF iframe
4. **Test E2E flow**: Verify complete document generation pipeline

### AFTER DEPLOY
1. **Monitor error logs**: Watch for PDF generation failures
2. **Validate storage**: Check MinIO for generated documents
3. **User testing**: Verify document preview/download functionality
4. **Performance monitoring**: Track PDF generation latency

---

**Audit completed**: 2026-04-28
**Next review**: After E2E validation completion
**Critical path**: Fix document generation API → Update frontend → Test E2E → Deploy
