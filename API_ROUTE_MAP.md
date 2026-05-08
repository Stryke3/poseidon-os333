# STRYKER OS API ROUTE MAP
**Date:** 2026-05-05
**Server:** 157.230.145.247

## CORE API ENDPOINTS (Port 8001)

| Route | Method | Auth | Upstream Service | Purpose | Verified |
|-------|--------|------|------------------|---------|----------|
| `/ready` | GET | None | Poseidon Core | Health check | ✅ Working |
| `/health` | GET | None | Poseidon Core | Health check | ✅ Working |
| `/api/v1/patients` | POST | Required | Poseidon Core | Create patient | 🔄 To verify |
| `/api/v1/patients/{id}` | GET | Required | Poseidon Core | Get patient | 🔄 To verify |
| `/api/v1/patients/{id}/documents` | POST | Required | Poseidon Core | Upload document | 🔄 To verify |
| `/api/v1/patients/{id}/packets` | GET | Required | Poseidon Core | Get packet | 🔄 To verify |
| `/api/v1/patients/{id}/packets/generate` | POST | Required | Poseidon Core | Generate packet | 🔄 To verify |

## TRIDENT API ENDPOINTS (Port 8002)

| Route | Method | Auth | Upstream Service | Purpose | Verified |
|-------|--------|------|------------------|---------|----------|
| `/ready` | GET | None | Poseidon Trident | Health check | ✅ Working |
| `/health` | GET | None | Poseidon Trident | Health check | ✅ Working |
| `/api/v1/ocr/process` | POST | Required | Poseidon Trident | Process document | 🔄 To verify |
| `/api/v1/ocr/status/{job_id}` | GET | Required | Poseidon Trident | Check OCR status | 🔄 To verify |
| `/api/v1/ocr/results/{job_id}` | GET | Required | Poseidon Trident | Get OCR results | 🔄 To verify |

## INTAKE API ENDPOINTS (Port 8003)

| Route | Method | Auth | Upstream Service | Purpose | Verified |
|-------|--------|------|------------------|---------|----------|
| `/ready` | GET | None | Poseidon Intake | Health check | ✅ Working |
| `/health` | GET | None | Poseidon Intake | Health check | ✅ Working |
| `/api/v1/intake/submit` | POST | None | Poseidon Intake | Submit intake | 🔄 To verify |
| `/api/v1/intake/status/{id}` | GET | None | Poseidon Intake | Get intake status | 🔄 To verify |

## PUBLIC FACING ENDPOINTS

| Route | Method | Auth | Upstream Service | Purpose | Verified |
|-------|--------|------|------------------|---------|----------|
| `https://strykefox.com/mommy-care/` | GET | None | PM2 (Port 3001) | Mommy Care Kit | ✅ Working |
| `https://strykefox.com/el-kit-de-cuidado/` | GET | None | PM2 (Port 3002) | El Kit de Cuidado | ✅ Working |
| `https://strykefox.com/founder/` | GET | None | Frontend | Founder page | ✅ Working |
| `https://strykefox.com/robots.txt` | GET | None | Static | SEO robots | ✅ Working |
| `https://strykefox.com/sitemap.xml` | GET | None | Static | SEO sitemap | ✅ Working |

## VERIFICATION COMMANDS

### Core API
```bash
# Health check
curl -X GET https://api.strykefox.com/ready

# With proper host header
curl -X GET http://127.0.0.1:8001/ready -H "Host: api.strykefox.com"
```

### Trident API
```bash
# Health check
curl -X GET https://trident.strykefox.com/ready

# With proper host header
curl -X GET http://127.0.0.1:8002/ready -H "Host: trident.strykefox.com"
```

### Intake API
```bash
# Health check
curl -X GET https://intake.strykefox.com/ready

# With proper host header
curl -X GET http://127.0.0.1:8003/ready -H "Host: intake.strykefox.com"
```

## SERVICE STATUS SUMMARY

| Service | Port | Status | Health Endpoint | Notes |
|---------|------|--------|----------------|-------|
| Poseidon Core | 8001 | ✅ Running | `/ready` | Responds with proper host header |
| Poseidon Trident | 8002 | ✅ Running | `/ready` | Responds with proper host header |
| Poseidon Intake | 8003 | ✅ Running | `/ready` | Responds with proper host header |
| Mommy Care | 3001 | ✅ Running | N/A | PM2 managed |
| El Kit de Cuidado | 3002 | ✅ Running | N/A | PM2 managed |
| Nginx | 80/443 | ✅ Running | N/A | SSL configured |

## KNOWN ISSUES

1. **Host Header Validation**: Core services require proper host header for API calls
2. **SSL Certificate**: Only strykefox.com certificate generated (subdomains need separate certs)
3. **API Documentation**: Need to verify actual endpoint structures beyond health checks

## NEXT STEPS

1. Verify patient creation endpoint
2. Test document upload flow
3. Verify packet generation
4. Test end-to-end intake flow
5. Generate additional SSL certificates for subdomains
