# POSEIDON Healthcare RCM Platform v2.0
### StrykeFox — A CRM meets EMR
Revenue cycle + relationship management with full patient record (demographics, orders, DMEs, POD, SWO, documents) in one place.

---

## Architecture

```
                    Cloudflare CDN + SSL
                           │
                        nginx
               ┌──────────┼──────────┬──────────┐
               │          │          │          │
           Core API   Trident    Intake      ML Svc
           :8001       :8002      :8003      :8004
               │          │          │          │
               └──────────┴──────────┴──────────┘
                                │
                    ┌───────────┼───────────┐
                 PostgreSQL   Redis      MinIO
                  :5432       :6379      :9000
```

## Services

| Service | Port | Domain | Purpose |
|---------|------|--------|---------|
| Core API | 8001 | api.strykefox.com | Patient/Order lifecycle, auth, KPIs |
| Trident | 8002 | trident.strykefox.com | ML denial prediction, scoring |
| Intake | 8003 | intake.strykefox.com | EOB/835 parsing, batch intake |
| ML Service | 8004 | ml.strykefox.com | Training pipeline, pattern analysis |
| Dashboard | 3000 | dashboard.strykefox.com | CRM meets EMR — worklist, patient record, reporting |

## Cursor shortcuts

AI (Claude) code shortcuts for this project: see [.cursor/CURSOR_SHORTCUTS.md](.cursor/CURSOR_SHORTCUTS.md). Quick ref: **Chat** `Cmd+L` / `Ctrl+L`, **Inline edit** `Cmd+K` / `Ctrl+K`, **Composer** `Cmd+I` / `Ctrl+I`.

## Quick Start

```bash
# 1. Clone and configure
cp .env.template .env
# Edit .env and replace every CHANGE_ME / placeholder value before production boot

# 2. First-time launch
docker compose up -d --build

# 2.5. Readiness validation
bash scripts/verify_deploy_readiness.sh

# 3. Verify health (through nginx on :80 — default compose does not publish 8001–8004 on the host)
curl -s http://localhost/api/health
curl -s http://localhost/api/ready
curl -s http://localhost/trident-api/health
curl -s http://localhost/intake-api/health
curl -s http://localhost/ml-api/health
# Dashboard (Next) /api/health is not exposed on the host by default; compose healthcheck hits it inside the container:
# docker compose exec dashboard wget -qO- http://localhost:3000/api/health
# Optional: docker compose exec core curl -s http://localhost:8001/ready

# 4. View logs
docker compose logs -f core
docker compose logs -f trident

# 5. (Existing DBs only) Add POD column for CRM proof-of-delivery tracking
psql -U poseidon -d poseidon -f scripts/migrations/001_add_pod_document_id.sql

# 6. Create a database backup before major changes or cutover
bash scripts/backup_postgres.sh
```

## Mobile build & Firestarter deploy

The dashboard is **mobile-friendly** (responsive layout, touch-friendly kanban, safe-area support). To deploy as a static site (e.g. **Vercel** or **Firebase** / Firestarter), see **[firestarter/README.md](firestarter/README.md)**. Use `frontend/` as the deploy root; `firebase.json` and `frontend/vercel.json` are preconfigured.

## Dashboard — CRM meets EMR

POSEIDON is **a CRM meets EMR**: pipeline and relationship tracking (orders, POD, rep worklist) with full **patient record** in one place—demographics, diagnoses, orders, DMEs, proof of delivery (POD), SWO, CMS-1500, and timeline. Click a card to open the patient account (EMR-style record) with order tracking, documents, and **View full patient record (PDF)**.

- **Use the app via the main nginx URL** so `/api` is proxied to Core (e.g. `http://dashboard.strykefox.com` or `http://localhost` with nginx on port 80). If you open the dashboard container directly on **port 3000** only (no nginx), `/api` requests will 404 and data won’t load. From the host, Core/Trident/Intake/ML are not published on 8001–8004 by default—use **`http://localhost/api/...`** (via nginx) or add compose `ports` for debugging.
- **Logo:** Put your logo at `frontend/logo.svg`. The app shows it when present; otherwise it shows the “P” mark. Rebuild the dashboard image (or refresh after replacing the file in a volume) and do a hard refresh (Ctrl+Shift+R / Cmd+Shift+R) if the old logo is cached.
- **Live data:** The dashboard polls `/api/orders` and `/api/denials` on load and every 60s. Use the header “Refresh” for an immediate sync.
- **Kanban → SQL:** Dragging a card to a new column calls `PATCH /orders/{id}/status` and updates the database. Admin, Billing, and Rep roles can update order status.

## Data Ingestion

Drop files into `./data/` subfolders (contents are typically **gitignored**; see [docs/DATA_INGEST.md](docs/DATA_INGEST.md)):

```
data/eobs/         → EOB PDFs, .835 EDI files
data/denials/      → Denial CSV exports
data/appeals/      → Appeal documents
data/spreadsheets/ → Open claims, batch intake
data/lvco/         → LVCO / client-specific spreadsheets for batch ingest (you create this folder locally)
```

**Batch ingest:** `bash scripts/ingest_lvco.sh` (see [docs/DATA_INGEST.md](docs/DATA_INGEST.md)).

Then call the API or use the dashboard upload page.

## Google Sheets Sync (deprecated)

This project previously shipped an optional Google Apps Script connector for syncing a denial-tracking Sheet with Poseidon.
That flow is now deprecated — all data should move directly through the Poseidon APIs into PostgreSQL (via CSV uploads to `data/` or direct API calls),
and the `scripts/google_apps_script.js` helper has been removed from this repo.

## Environment Variables

Production notes:
- `ENVIRONMENT=production` now enforces non-placeholder secrets for backend startup.
- `NEXTAUTH_SECRET` is required for the dashboard in production.
- `CORS_ALLOW_ORIGINS` and `TRUSTED_HOSTS` should be set to your real domains before internet exposure.
- The frontend is pinned to `Next.js 16` and production builds run with `--webpack` for stable repeatable builds in this environment.
- Live ingest now requires a real signed-in operator in production; service-account fallback is disabled unless explicitly enabled outside production.
- Human dashboard logins are environment-managed and may be rotated independently of historical seed prompts. Do not rely on old docs that mention fixed credentials such as `admin@strykefox.com` / `StrykeFox2026!`.
- `CORE_API_EMAIL` / `CORE_API_PASSWORD` are automation credentials for service-to-service and scripted ingest paths. They are not the canonical source of truth for operator-facing login instructions.
- Public founder inquiries should set `PUBLIC_INQUIRY_ALLOWED_ORIGINS` to the exact allowed public site origin(s).
- Intake-to-Core workflow automation now requires `INTERNAL_API_KEY` on the request path in addition to the Core bearer token.

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXTAUTH_SECRET` | — | Required in production for dashboard session signing |
| `NEXTAUTH_URL` | — | Public dashboard base URL used by NextAuth |
| `INTERNAL_API_KEY` | — | Required shared secret for service-to-service requests such as Intake → Core workflow actions |
| `ALLOW_CORE_SERVICE_ACCOUNT_FALLBACK` | false | Non-production only escape hatch for live ingest if no operator session token is present |
| `PUBLIC_INQUIRY_ALLOWED_ORIGINS` | `NEXTAUTH_URL` or explicit list | Comma-separated browser origins allowed to post to the public inquiry endpoint |
| `CORS_ALLOW_ORIGINS` | dashboard + localhost | Comma-separated allowed browser origins for APIs |
| `TRUSTED_HOSTS` | public + internal service hosts | Comma-separated hostnames accepted by FastAPI |
| `EXPOSE_API_DOCS` | false | Set `true` to expose `/docs` outside non-production environments |
| `DENIAL_THRESHOLD` | 0.65 | Risk score above which claims are flagged |
| `WRITE_OFF_DOLLAR_THRESHOLD` | 50.00 | Below this, auto-write-off |
| `APPEAL_WINDOW_DAYS` | 60 | Days to appeal a denial |
| `MIN_TRAINING_RECORDS` | 100 | Records before ML activates |
| `MODEL_RETRAIN_INTERVAL_DAYS` | 30 | Auto-retrain cadence |
| `TRIDENT_LEARNING_MODE` | continuous | `off`, `manual`, `continuous`, or `full` learning orchestration |
| `TRIDENT_LEARNING_INTERVAL_MINUTES` | 15 | Minimum cadence for background refresh scheduling |
| `TRIDENT_LEARNING_LOOKBACK_DAYS` | 365 | Window of operational data included in learned-rate recomputes |
| `TRIDENT_LEARNING_AUTO_RETRAIN` | true | Auto-retrain Trident after sync once minimum records are met |
| `AVAILITY_BASE_URL` | — | Base URL for Availity APIs (optional, informational) |
| `AVAILITY_TOKEN_URL` | — | OAuth2 token endpoint for Availity client credentials |
| `AVAILITY_CLIENT_ID` | — | Availity API client ID |
| `AVAILITY_CLIENT_SECRET` | — | Availity API client secret |
| `AVAILITY_ELIGIBILITY_URL` | — | Full URL for the 270 eligibility submission endpoint |
| `AVAILITY_SENDER_ID` | POSEIDON | X12 sender ID used in ISA/GS |
| `AVAILITY_RECEIVER_ID` | AVAILITY | X12 receiver ID used in ISA/GS |
| `AVAILITY_DEFAULT_PROVIDER_NPI` | — | Fallback NPI if order.referring_physician_npi is empty |
| `AVAILITY_CLAIMS_URL` | — | Availity 837 claim submission endpoint (billing) |
| `AVAILITY_CLAIM_STATUS_URL` | — | Availity claim status check endpoint (optional) |
| `AVAILITY_BILLING_TIN` | — | Billing provider EIN (1000A) for 837 P |
| `SMTP_HOST` | — | SMTP host for outbound operational email |
| `SMTP_PORT` | 587 | SMTP port |
| `SMTP_USER` | — | SMTP username / mailbox |
| `SMTP_PASSWORD` | — | SMTP password or app password |
| `EMAIL_FROM_ADDRESS` | — | Default sender for outbound workflow email |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID for email/calendar integration |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | — | Google refresh token for mailbox/calendar access |
| `GOOGLE_CALENDAR_ID` | — | Calendar ID for operational scheduling |

### Production Login Guidance

- For human access, use the current operator account credentials managed in the live environment, not historical seeded passwords from planning prompts.
- For automation, use `CORE_API_EMAIL` / `CORE_API_PASSWORD` or a bearer token only where the script explicitly supports service credentials.
- If a prompt, runbook, or scratch note still references `admin@strykefox.com` with a fixed password, treat it as stale until revalidated against the current environment.

## Operations

Production cutover helpers:
- `bash scripts/validate_production_env.sh` validates required secrets, HTTPS settings, and placeholder removal.
- `bash scripts/verify_deploy_readiness.sh --strict-env` is the production-only pre-cutover gate after real secrets are installed.
- `bash scripts/meeting_ready.sh` runs a non-destructive full-stack bring-up + health checks for demo/meeting readiness.
- `bash scripts/backup_postgres.sh` writes a timestamped PostgreSQL dump into `backups/postgres/`.
- `bash scripts/restore_postgres.sh backups/postgres/<file>.dump` restores a captured PostgreSQL backup.
- `bash scripts/backup_stateful_storage.sh` archives MinIO data, Redis persistence, and Trident model artifacts into `backups/stateful/`.
- `bash scripts/restore_stateful_storage.sh backups/stateful/<timestamp>` restores a captured stateful-storage snapshot back into the running stack.

## Key API Endpoints

### Auth
```
POST /auth/login              → { access_token, role }
```

### Core
```
POST   /patients              → Create patient
GET    /patients              → List patients
POST   /orders                → Create order
GET    /orders                → List orders (filter by status)
GET    /orders/{id}/patient-record → CRM: patient + order summary, document refs (SWO, CMS-1500, POD), record_pdf_url
GET    /documents/patient-record-pdf?order_id= → Full patient record PDF (DMEs, POD, SWO, tracking); 501 until PDF generation
PATCH  /orders/{id}/status    → Update order status
POST   /denials               → Record denial
GET    /denials               → List denials
POST   /outcomes              → Record payment outcome
GET    /analytics/kpis        → KPI dashboard data
GET    /analytics/trends      → Weekly trend data
POST   /eligibility/check     → Availity 270 (raw)
POST   /eligibility/check-from-order → 270 from patient/order
POST   /eligibility/check-simple     → 270 from JSON, returns parsed 271 summary
POST   /billing/submit-claim  → Availity 837 (raw P/I/D), returns 997 summary
POST   /billing/submit-claim-from-order → Build 837 P from order + submit
GET    /communications/feed   → Unified in-app feed for ops, tracking, and workflow updates
POST   /communications/messages → Post a Slack-style team update into the app
GET    /integrations/status   → Email/calendar/in-app push configuration status
```

### Trident
```
POST   /score                 → Score a claim pre-submission
POST   /optimize              → Get billing optimization recommendations
GET    /payers                → List all 19 configured payers
GET    /payers/{id}           → Payer-specific rules
POST   /train                 → Submit outcome for learning
GET    /model/status          → Model state
GET    /api/v1/trident/learning-status → Continuous learning status + corpus counts
POST   /api/v1/trident/learning-sync   → Recompute learned rates and optionally retrain
```

### Intake
```
POST   /ingest/eob            → Upload EOB PDF or 835 EDI
POST   /ingest/batch          → Upload batch CSV
POST   /ingest/denial-file    → Upload denial spreadsheet
POST   /ingest/appeal         → Upload appeal document
GET    /data/inventory        → List all uploaded files
POST   /patient-intake        → Intake form submission
```

### ML
```
POST   /train/batch           → Batch training record ingest
GET    /patterns              → Full denial pattern analysis
GET    /patterns/payer/{id}   → Payer-specific patterns
GET    /patterns/hcpcs/{code} → HCPCS-specific patterns
POST   /reimbursement/estimate → Expected reimbursement estimate
POST   /weights/recompute     → Retrain diagnosis weights
GET    /status                → ML engine status + data inventory
```

## Roles

| Role | Access |
|------|--------|
| `admin` | Full access |
| `executive` | Read-only analytics + KPIs |
| `billing` | Orders, denials, outcomes |
| `intake` | Patient/order creation |
| `rep` | Patient creation, read orders, update order status (kanban) |
| `system` | Service-to-service calls |

## Target Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Denial Rate | 45% (industry) | <27% |
| Clean Claim Rate | 55% | >75% |
| Days in AR | 45+ | <30 |
| Appeal Win Rate | — | >40% |
