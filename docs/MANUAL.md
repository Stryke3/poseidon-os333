# POSEIDON / StrykeFox System Manual

**Healthcare Revenue Cycle Management Platform**
*CRM meets EMR — v2.0*

---

## Table of Contents

1. [What Is POSEIDON](#1-what-is-poseidon)
2. [Architecture Overview](#2-architecture-overview)
3. [Service Directory](#3-service-directory)
4. [Prerequisites](#4-prerequisites)
5. [Initial Setup](#5-initial-setup)
6. [Running Locally (Docker Compose)](#6-running-locally-docker-compose)
7. [Running the Frontend in Dev Mode](#7-running-the-frontend-in-dev-mode)
8. [Database Setup and Migrations](#8-database-setup-and-migrations)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [User Roles and Authentication](#10-user-roles-and-authentication)
11. [Using the Dashboard](#11-using-the-dashboard)
12. [Data Ingestion](#12-data-ingestion)
13. [API Reference](#13-api-reference)
14. [Trident Denial Intelligence](#14-trident-denial-intelligence)
15. [EDI and Claims (837P / 835)](#15-edi-and-claims-837p--835)
16. [Eligibility and Billing (Availity)](#16-eligibility-and-billing-availity)
17. [ML and Pattern Analysis](#17-ml-and-pattern-analysis)
18. [Fax System](#18-fax-system)
19. [Operations Scripts](#19-operations-scripts)
20. [Deploying with Docker Compose](#20-deploying-with-docker-compose)
21. [Backup and Restore](#21-backup-and-restore)
22. [Security and Compliance](#22-security-and-compliance)
23. [Troubleshooting](#23-troubleshooting)
24. [File and Folder Map](#24-file-and-folder-map)

---

## 1. What Is POSEIDON

POSEIDON is an **RCM-first, DME-focused** healthcare platform that combines a CRM, an EMR-style patient record, eligibility verification, claim submission, denial prediction, and ML-powered pattern analysis into a single deployable stack.

**Core capabilities:**

- Patient demographics, orders, documents (SWO, CMS-1500, POD)
- Kanban-style worklist for reps, billing, intake, and admin
- Real-time eligibility checks (X12 270/271 via Availity)
- Claim submission (X12 837P via Stedi or Availity SFTP)
- Remittance parsing (X12 835 / EOB PDF)
- Denial risk scoring (Trident engine with 19 payer rule sets)
- ML training on your own denial and payment outcomes
- Full audit trail and HIPAA-oriented controls

**What makes it different:** One data model, one API surface, and one deployment for the entire revenue cycle. Eligibility, billing, and denial intelligence are API-native, not export-to-another-tool workflows. ML trains on data that never leaves your stack.

---

## 2. Architecture Overview

```
                    Cloudflare CDN + SSL
                           |
                        nginx (:80/:443)
               ┌──────────┼──────────────────────────┐
               |          |          |         |      |
           Core API   Trident    Intake     ML Svc   EDI       Availity (Node)
           :8001       :8002      :8003     :8004    :8006     :8005
               |          |          |         |      |         |
               └──────────┴──────────┴─────────┴──────┴─────────┘
                                     |
                    ┌────────────────┼────────────────┐
                 PostgreSQL       Redis            MinIO
                  :5432           :6379            :9000
```


| Layer            | Technology                                        |
| ---------------- | ------------------------------------------------- |
| Backend services | Python 3.11, FastAPI, Uvicorn                     |
| Availity service | Node.js, Express, TypeScript, Prisma              |
| Frontend         | Next.js 16 (App Router), React 19, Tailwind CSS   |
| Database         | PostgreSQL (single DB, multi-tenant via `org_id`) |
| Cache / Pub-Sub  | Redis 7.4                                         |
| Object storage   | MinIO (S3-compatible)                             |
| Reverse proxy    | nginx                                             |
| Deployment       | Docker Compose (canonical full stack)             |


---

## 3. Service Directory


| Service       | Port   | Domain                  | Language       | Purpose                                                                                    |
| ------------- | ------ | ----------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| **Core**      | 8001   | api.strykefox.com       | Python/FastAPI | Auth, patients, orders, denials, outcomes, eligibility, billing, KPIs, documents, workflow |
| **Trident**   | 8002   | trident.strykefox.com   | Python/FastAPI | Denial risk scoring, payer rules (19 payers), optimization, learning loop                  |
| **Intake**    | 8003   | intake.strykefox.com    | Python/FastAPI | EOB/835 parsing, batch CSV ingest, denial-file and appeal uploads                          |
| **ML**        | 8004   | ml.strykefox.com        | Python/FastAPI | Training pipeline, denial patterns (CARC, payer, HCPCS), reimbursement estimates           |
| **Availity**  | 8005   | (internal)              | Node/Express   | Payer intelligence, playbooks, governance, denials automation, Availity API integrations   |
| **EDI**       | 8006   | edi.strykefox.com       | Python/FastAPI | 837P claim build/submit/validate, 835 remittance parsing, SFTP mailbox                     |
| **Dashboard** | 3000   | dashboard.strykefox.com | Next.js        | CRM/EMR UI: worklist, patient record, intake, admin, reporting                             |
| **nginx**     | 80/443 | —                       | —              | Reverse proxy, rate limiting, security headers                                             |


**Shared base:** All Python services import from `services/shared/` which provides the FastAPI app factory, database pool, Redis connection, and config.

---

## 4. Prerequisites

- **Docker** and **Docker Compose** (for local full-stack)
- **Node.js 20+** and **npm** (for frontend dev mode)
- **Python 3.11+** (for running scripts directly)
- **PostgreSQL 15+** (external; not included in Docker Compose)
- **Git**
- A `.env` file with real values (see section 5)

---

## 5. Initial Setup

### 5.1 Clone and configure environment

```bash
cp .env.template .env
```

Open `.env` and set real values. At minimum you need:


| Variable           | What to set                                         |
| ------------------ | --------------------------------------------------- |
| `DATABASE_URL`     | Connection string to your PostgreSQL instance       |
| `REDIS_PASSWORD`   | A strong password (also embedded in `REDIS_URL`)    |
| `JWT_SECRET`       | 64-character hex string                             |
| `NEXTAUTH_SECRET`  | 64-character hex string (different from JWT_SECRET) |
| `INTERNAL_API_KEY` | Shared secret for service-to-service calls          |
| `MINIO_SECRET_KEY` | A strong password for MinIO                         |


Generate secrets:

```bash
openssl rand -hex 32   # produces 64 hex characters
```

### 5.2 Apply the database schema

Connect to your PostgreSQL and run:

```bash
psql "$DATABASE_URL" -f scripts/init.sql
```

Then apply migrations (see [section 8](#8-database-setup-and-migrations)).

### 5.3 Validate readiness

```bash
bash scripts/verify_deploy_readiness.sh
```

For production pre-cutover:

```bash
bash scripts/verify_deploy_readiness.sh --strict-env
```

---

## 6. Running Locally (Docker Compose)

Docker Compose starts Redis, MinIO, all six application services, the dashboard, and nginx. **PostgreSQL is not included** — you must provide `DATABASE_URL` in `.env` pointing to a running Postgres instance.

```bash
docker compose up --build
```

After startup:


| URL                               | What                         |
| --------------------------------- | ---------------------------- |
| `http://localhost`                | Dashboard (via nginx)        |
| `http://localhost/api/*`          | Core API (via nginx rewrite) |
| `http://127.0.0.1:8001`           | Core API (direct)            |
| `http://localhost/trident-api/*`  | Trident (via nginx)          |
| `http://localhost/intake-api/*`   | Intake (via nginx)           |
| `http://localhost/ml-api/*`       | ML (via nginx)               |
| `http://localhost/edi-api/*`      | EDI (via nginx)              |
| `http://localhost/availity-api/*` | Availity (via nginx)         |


Stop everything:

```bash
docker compose down
```

---

## 7. Running the Frontend in Dev Mode

For faster iteration on the dashboard without rebuilding Docker:

```bash
cd frontend
npm install
```

Create `frontend/.env.local` with:

```env
CORE_API_URL=http://127.0.0.1:8001
TRIDENT_API_URL=http://127.0.0.1:8002
INTAKE_API_URL=http://127.0.0.1:8003
ML_API_URL=http://127.0.0.1:8004
AVAILITY_SERVICE_URL=http://127.0.0.1:8005
EDI_API_URL=http://127.0.0.1:8006
NEXTAUTH_SECRET=<your-64-char-hex>
NEXTAUTH_URL=http://localhost:3000
```

Then:

```bash
npm run dev
```

The dashboard is available at `http://localhost:3000`. Backend services must be running (via Compose or individually).

---

## 8. Database Setup and Migrations

### Initial schema

```bash
psql "$DATABASE_URL" -f scripts/init.sql
```

This creates all tables: organizations, users, payers, patients, patient_insurances, physicians, orders, order_line_items, order_documents, eligibility_checks, auth_requests, eob_claims, eob_line_items, payment_outcomes, denials, appeals, trident_rules, trident_training_ledger, learned_rates, claim_submissions, remittance_batches, remittance_claims, workflow_events, audit_log, fax_log, notifications, communications_messages, patient_notes, and more. It also seeds the 19 payer rules and a default organization.

### Incremental migrations

Migration files live in `scripts/migrations/` (numbered `001`_ through `016_`+). Run them in order:

```bash
bash scripts/run_production_migrations.sh
```

Or apply individually:

```bash
psql "$DATABASE_URL" -f scripts/migrations/001_add_fax_log.sql
psql "$DATABASE_URL" -f scripts/migrations/002_claim_submissions.sql
# ... and so on
```

---

## 9. Environment Variables Reference

Below are the key groups. The complete list is in `.env.template`.

### Infrastructure


| Variable                                | Description                                 |
| --------------------------------------- | ------------------------------------------- |
| `DATABASE_URL`                          | PostgreSQL connection string                |
| `REDIS_URL`                             | Redis connection string (includes password) |
| `MINIO_ENDPOINT`                        | MinIO host:port                             |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO credentials                           |
| `MINIO_BUCKET`                          | Default bucket name (`poseidon-docs`)       |


### Authentication


| Variable           | Description                      |
| ------------------ | -------------------------------- |
| `JWT_SECRET`       | Signs backend JWTs               |
| `NEXTAUTH_SECRET`  | Signs dashboard session cookies  |
| `NEXTAUTH_URL`     | Public dashboard URL             |
| `INTERNAL_API_KEY` | Service-to-service shared secret |


### Availity / Clearinghouse


| Variable                                        | Description             |
| ----------------------------------------------- | ----------------------- |
| `AVAILITY_CLIENT_ID` / `AVAILITY_CLIENT_SECRET` | OAuth2 credentials      |
| `AVAILITY_TOKEN_URL`                            | Token endpoint          |
| `AVAILITY_ELIGIBILITY_URL`                      | 270 submission endpoint |
| `AVAILITY_CLAIMS_URL`                           | 837 submission endpoint |
| `AVAILITY_SENDER_ID` / `AVAILITY_RECEIVER_ID`   | X12 ISA envelope IDs    |
| `AVAILITY_DEFAULT_PROVIDER_NPI`                 | Fallback NPI            |


### EDI / Stedi


| Variable            | Description                         |
| ------------------- | ----------------------------------- |
| `SUBMISSION_METHOD` | `stedi_api` or `availity_sftp`      |
| `STEDI_API_KEY`     | Raw Stedi API key                   |
| `EDI_DRY_RUN`       | `true` to simulate (no live submit) |


### Trident Learning


| Variable                            | Description                              |
| ----------------------------------- | ---------------------------------------- |
| `TRIDENT_LEARNING_MODE`             | `off`, `manual`, `continuous`, or `full` |
| `TRIDENT_LEARNING_INTERVAL_MINUTES` | Background refresh cadence               |
| `TRIDENT_LEARNING_LOOKBACK_DAYS`    | Operational data window for recomputes   |
| `TRIDENT_LEARNING_AUTO_RETRAIN`     | Auto-retrain after sync                  |


### Tuning


| Variable                          | Default | Description                                       |
| --------------------------------- | ------- | ------------------------------------------------- |
| `DENIAL_THRESHOLD`                | 0.65    | Risk score above which claims are flagged         |
| `WRITE_OFF_DOLLAR_THRESHOLD`      | 50.00   | Below this, auto-write-off                        |
| `APPEAL_WINDOW_DAYS`              | 60      | Days allowed to appeal                            |
| `MIN_TRAINING_RECORDS`            | 25      | Records needed before ML activates                |
| `INTAKE_OCR_CONFIDENCE_THRESHOLD` | 0.55    | Below this, inbound fax OCR is flagged incomplete |


---

## 10. User Roles and Authentication

### Roles


| Role        | Access                                                        |
| ----------- | ------------------------------------------------------------- |
| `admin`     | Full access to all features                                   |
| `executive` | Read-only analytics and KPIs                                  |
| `billing`   | Orders, denials, outcomes, claims                             |
| `intake`    | Patient and order creation, document uploads                  |
| `rep`       | Patient creation, read orders, update order status via kanban |
| `system`    | Service-to-service automation calls                           |


### Logging in

1. **Dashboard (human users):** Navigate to the dashboard URL and sign in with your email and password. Sessions are managed by NextAuth.
2. **API (automation):** `POST /auth/login` with `{ email, password }` returns `{ access_token, role }`. Include the token as `Authorization: Bearer <token>` on subsequent requests.
3. **Service-to-service:** Use `INTERNAL_API_KEY` in the `X-Internal-Key` header for intake-to-core workflow calls.

---

## 11. Using the Dashboard

### 11.1 Kanban Worklist

The main dashboard view is a **Kanban board** of orders grouped by status (Draft, Submitted, In Review, Approved, Denied, Appealed, Paid, Closed). Drag a card between columns to update its status — this calls `PATCH /orders/{id}/status` and writes to the database.

Cards display:

- Patient name, payer, HCPCS codes
- Denial risk score and tier (from Trident)
- Reimbursement and billed amounts
- Document attachment indicators (SWO, CMS-1500, POD)

### 11.2 Patient Record

Click any order card to open the **patient chart** (EMR-style record):

- Demographics, diagnoses, insurance
- Order timeline and status history
- Attached documents (SWO, CMS-1500, POD)
- Denial history and appeal status
- Reimbursement lines from payment outcomes
- "View full patient record (PDF)" link

### 11.3 Intake Page

Upload files or submit patient intake forms:

- EOB PDFs, 835 EDI files
- Batch CSV/XLSX for bulk order import
- Denial spreadsheets
- Appeal documents

### 11.4 Fax Page

View inbound faxes (via Sinch), their OCR status, and associated patient/order linkages. Faxes with OCR confidence below threshold are flagged for manual review.

### 11.5 Revenue / Analytics

KPI dashboard showing:

- Denial rate, clean claim rate
- Days in A/R
- Appeal win rate
- Weekly trends
- Payer-specific breakdowns

### 11.6 Admin Section

Available to `admin` role:

- User management
- Governance settings
- Learning status and sync controls
- Denials queue and appeal management

### 11.7 Customization

- **Logo:** Replace `frontend/logo.svg` with your logo. Rebuild and hard-refresh (`Ctrl+Shift+R`).
- **Live data:** Dashboard polls `/api/orders` and `/api/denials` every 60 seconds. Click "Refresh" in the header for immediate sync.

---

## 12. Data Ingestion

### 12.1 Folder structure

The `data/` directory is **gitignored** (PHI). Create these folders on each machine:


| Path                 | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `data/eobs/`         | EOB PDFs, 835 EDI files                       |
| `data/denials/`      | Denial CSV exports                            |
| `data/appeals/`      | Appeal documents                              |
| `data/spreadsheets/` | Open claims, batch intake CSVs                |
| `data/lvco/`         | Client-specific spreadsheets for batch ingest |
| `data/processed/`    | Archive / post-processing (optional)          |


### 12.2 CLI batch ingest (LVCO)

Drop CSV/XLSX files into `data/lvco/`, then:

```bash
# Dry run (parse only, no database writes)
bash scripts/ingest_lvco.sh --dry-run

# Full ingest
bash scripts/ingest_lvco.sh

# Single file
bash scripts/ingest_lvco.sh --file /path/to/file.csv
```

**Auth:** Set `POSEIDON_INGEST_EMAIL` and `POSEIDON_INGEST_PASSWORD` in `.env`, or provide `POSEIDON_ACCESS_TOKEN`.

**URL routing:** `CORE_BASE_URL` must reach Core's `/auth/login` and `/orders/import`:

- Through nginx: `http://localhost/api`
- Direct to Core: `http://127.0.0.1:8001`
- Via dashboard **Core proxy** (same origin as the app): `http://localhost/api/core` when nginx routes `/api/` to Next.js (see `frontend/src/app/api/core/`)

**XLSX support:** Install `openpyxl` first: `pip install openpyxl`

### 12.3 Full live pipeline (ingest + Trident scoring + PDFs)

```bash
python3 scripts/lvco_live_pipeline.py
```

This runs the LVCO ingest, then triggers Trident scoring and PDF materialization for all imported orders.

### 12.4 WHT data-room pulls

For recurring WHT data-room imports:

```bash
python3 scripts/wht_data_room_pull.py --mode morning
python3 scripts/wht_data_room_pull.py --mode nightly
```

Automate with cron:

```bash
bash scripts/setup_wht_pull_cron.sh
```

### 12.5 Deduplication

- **Within one request:** Rows matching the same org + patient + payer + HCPCS + ICD are collapsed.
- **Across requests:** Core skips creating a new draft order when a matching draft already exists (same org, patient, payer, sorted HCPCS, diagnosis signature).

### 12.6 API uploads

Use the Intake API directly:

```bash
# EOB
curl -X POST http://localhost:8003/ingest/eob -F "file=@eob.pdf"

# Batch CSV
curl -X POST http://localhost:8003/ingest/batch -F "file=@claims.csv"

# Denial spreadsheet
curl -X POST http://localhost:8003/ingest/denial-file -F "file=@denials.csv"

# Appeal document
curl -X POST http://localhost:8003/ingest/appeal -F "file=@appeal.pdf"
```

---

## 13. API Reference

All APIs require `Authorization: Bearer <token>` unless noted.

### Auth


| Method | Path          | Description                      |
| ------ | ------------- | -------------------------------- |
| POST   | `/auth/login` | Returns `{ access_token, role }` |


### Patients


| Method | Path        | Description    |
| ------ | ----------- | -------------- |
| POST   | `/patients` | Create patient |
| GET    | `/patients` | List patients  |


### Orders


| Method | Path                          | Description                                     |
| ------ | ----------------------------- | ----------------------------------------------- |
| POST   | `/orders`                     | Create order                                    |
| GET    | `/orders`                     | List orders (filter by status)                  |
| PATCH  | `/orders/{id}/status`         | Update order status                             |
| GET    | `/orders/{id}/patient-record` | Full patient + order summary with document refs |


### Documents


| Method | Path                                      | Description             |
| ------ | ----------------------------------------- | ----------------------- |
| GET    | `/documents/patient-record-pdf?order_id=` | Full patient record PDF |


### Denials and Outcomes


| Method | Path        | Description              |
| ------ | ----------- | ------------------------ |
| POST   | `/denials`  | Record a denial          |
| GET    | `/denials`  | List denials             |
| POST   | `/outcomes` | Record a payment outcome |


### Analytics


| Method | Path                | Description        |
| ------ | ------------------- | ------------------ |
| GET    | `/analytics/kpis`   | KPI dashboard data |
| GET    | `/analytics/trends` | Weekly trend data  |


### Eligibility


| Method | Path                            | Description                               |
| ------ | ------------------------------- | ----------------------------------------- |
| POST   | `/eligibility/check`            | Raw Availity 270                          |
| POST   | `/eligibility/check-from-order` | 270 built from patient/order              |
| POST   | `/eligibility/check-simple`     | 270 from JSON, returns parsed 271 summary |


### Billing


| Method | Path                               | Description                                |
| ------ | ---------------------------------- | ------------------------------------------ |
| POST   | `/billing/submit-claim`            | Raw Availity 837 P/I/D                     |
| POST   | `/billing/submit-claim-from-order` | Build 837P from order, returns 997 summary |


### Communications


| Method | Path                       | Description             |
| ------ | -------------------------- | ----------------------- |
| GET    | `/communications/feed`     | Unified in-app ops feed |
| POST   | `/communications/messages` | Post a team message     |


### Trident


| Method | Path                              | Description                                 |
| ------ | --------------------------------- | ------------------------------------------- |
| POST   | `/score`                          | Score a claim pre-submission                |
| POST   | `/optimize`                       | Get billing optimization recommendations    |
| GET    | `/payers`                         | List all 19 configured payers               |
| GET    | `/payers/{id}`                    | Payer-specific rules                        |
| POST   | `/train`                          | Submit outcome for learning                 |
| GET    | `/model/status`                   | Current model state                         |
| GET    | `/api/v1/trident/learning-status` | Learning status and corpus counts           |
| POST   | `/api/v1/trident/learning-sync`   | Recompute learned rates, optionally retrain |


### Intake


| Method | Path                  | Description               |
| ------ | --------------------- | ------------------------- |
| POST   | `/ingest/eob`         | Upload EOB PDF or 835 EDI |
| POST   | `/ingest/batch`       | Upload batch CSV          |
| POST   | `/ingest/denial-file` | Upload denial spreadsheet |
| POST   | `/ingest/appeal`      | Upload appeal document    |
| GET    | `/data/inventory`     | List all uploaded files   |
| POST   | `/patient-intake`     | Intake form submission    |


### ML


| Method | Path                      | Description                         |
| ------ | ------------------------- | ----------------------------------- |
| POST   | `/train/batch`            | Batch training record ingest        |
| GET    | `/patterns`               | Full denial pattern analysis        |
| GET    | `/patterns/payer/{id}`    | Payer-specific patterns             |
| GET    | `/patterns/hcpcs/{code}`  | HCPCS-specific patterns             |
| POST   | `/reimbursement/estimate` | Expected reimbursement estimate     |
| POST   | `/weights/recompute`      | Retrain diagnosis weights           |
| GET    | `/status`                 | ML engine status and data inventory |


### EDI


| Method | Path                           | Description                  |
| ------ | ------------------------------ | ---------------------------- |
| POST   | `/api/v1/claims/submit`        | Submit 837P claim            |
| POST   | `/api/v1/claims/validate`      | Validate claim before submit |
| GET    | `/api/v1/claims/status/{id}`   | Claim status                 |
| POST   | `/api/v1/claims/resubmit/{id}` | Resubmit a claim             |
| POST   | `/api/v1/remittance/upload`    | Upload 835 file              |
| GET    | `/api/v1/remittance/batches`   | List remittance batches      |
| GET    | `/health`                      | EDI service health           |


---

## 14. Trident Denial Intelligence

Trident is the denial-risk scoring engine. It maintains rule sets for **19 payers** including Medicare DMERC, UHC, Aetna, BCBS, Cigna, Humana, Medicaid, and Anthem.

### How it works

1. When an order is created, Core publishes an `orders.created` event to Redis.
2. Trident subscribes, scores the order against payer rules (CMN requirements, prior auth lists, modifier rules, baseline denial rates, timely filing windows).
3. Trident writes `denial_risk_score`, `risk_tier`, and `trident_flags` back to the order row.
4. The dashboard displays the risk tier on every kanban card and patient record.

### Learning loop

Trident learns continuously from your operational data:

- **Continuous mode** (`TRIDENT_LEARNING_MODE=continuous`): Background refresh every `TRIDENT_LEARNING_INTERVAL_MINUTES` (default 15).
- **Manual mode**: Trigger sync via `POST /api/v1/trident/learning-sync`.
- **Lookback window**: Configurable via `TRIDENT_LEARNING_LOOKBACK_DAYS` (default 365).
- **Auto-retrain**: When `TRIDENT_LEARNING_AUTO_RETRAIN=true`, Trident retrains after sync once minimum records are met.

### Key thresholds


| Variable                     | Default | Meaning                                      |
| ---------------------------- | ------- | -------------------------------------------- |
| `DENIAL_THRESHOLD`           | 0.65    | Score above this = flagged for review        |
| `WRITE_OFF_DOLLAR_THRESHOLD` | 50.00   | Below this amount = auto-write-off candidate |
| `MIN_TRAINING_RECORDS`       | 25      | Records required before ML activates         |


---

## 15. EDI and Claims (837P / 835)

### Submitting claims (837P)

**From the dashboard:** Use the billing interface or the "Submit Claim" action on an order.

**From the API:**

```bash
# Validate first
curl -X POST http://localhost:8006/api/v1/claims/validate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "order_id": "..." }'

# Submit
curl -X POST http://localhost:8006/api/v1/claims/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "order_id": "..." }'
```

**Or use Core's one-click flow:**

```bash
curl -X POST http://localhost:8001/billing/submit-claim-from-order \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "order_id": "..." }'
```

### Submission methods

Controlled by `SUBMISSION_METHOD`:

- `**stedi_api**` (default): Submits via Stedi API. Requires `STEDI_API_KEY`.
- `**availity_sftp**`: Submits via Availity SFTP. Requires `AVAILITY_SFTP_USER`, `AVAILITY_SFTP_PASS`, and related ISA envelope variables.

### Dry run mode

Set `EDI_DRY_RUN=true` to simulate claim submission without sending to the clearinghouse. Useful for testing.

### Remittance (835)

Upload 835 files for automated parsing:

```bash
curl -X POST http://localhost:8006/api/v1/remittance/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@remittance.835"
```

Parsed data populates `remittance_batches` and `remittance_claims` tables and feeds back into denials and payment outcomes.

---

## 16. Eligibility and Billing (Availity)

### Prerequisites

Set Availity OAuth2 credentials in `.env`:

- `AVAILITY_CLIENT_ID`
- `AVAILITY_CLIENT_SECRET`
- `AVAILITY_TOKEN_URL`

### Checking eligibility

**Simple (JSON in, parsed summary out):**

```bash
curl -X POST http://localhost:8001/eligibility/check-simple \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "member_id": "ABC123",
    "payer_id": "medicare_dmerc",
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "1950-01-15"
  }'
```

Returns a parsed 271 summary: `{ eligible, coverage_segments, errors }`.

**From order (auto-builds 270 from patient/order data):**

```bash
curl -X POST http://localhost:8001/eligibility/check-from-order \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "order_id": "..." }'
```

---

## 17. ML and Pattern Analysis

The ML service trains on your denial and payment outcome data to surface actionable patterns.

### Denial patterns

```bash
# All patterns
curl http://localhost:8004/patterns -H "Authorization: Bearer $TOKEN"

# By payer
curl http://localhost:8004/patterns/payer/medicare_dmerc -H "Authorization: Bearer $TOKEN"

# By HCPCS code
curl http://localhost:8004/patterns/hcpcs/E0601 -H "Authorization: Bearer $TOKEN"
```

Patterns include CARC/RARC frequency, payer-specific denial rates, and category breakdowns.

### Reimbursement estimates

```bash
curl -X POST http://localhost:8004/reimbursement/estimate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "payer_id": "medicare_dmerc", "hcpcs_codes": ["E0601"] }'
```

### Training

ML activates after `MIN_TRAINING_RECORDS` (default 25) records are available. Data comes from:

- Denials and outcomes recorded through Core
- EOB/835 intake parsing
- Batch CSV uploads

Retrain diagnosis weights manually:

```bash
curl -X POST http://localhost:8004/weights/recompute -H "Authorization: Bearer $TOKEN"
```

---

## 18. Fax System

POSEIDON integrates with **Sinch Fax API v3** for inbound/outbound fax.

### Configuration

Set in `.env`:

- `SINCH_PROJECT_ID`
- `SINCH_KEY_ID`
- `SINCH_KEY_SECRET`
- `SINCH_WEBHOOK_SECRET`

### How it works

1. Inbound faxes arrive via Sinch webhook to Core (`/webhooks/fax`).
2. Core runs OCR (via Tesseract.js on the frontend side or server-side processing).
3. If OCR confidence is above `INTAKE_OCR_CONFIDENCE_THRESHOLD` (default 0.55), the system attempts to auto-create a patient/order.
4. Low-confidence faxes are flagged as `intake_incomplete` for manual review on the Fax page.
5. All fax events are logged in the `fax_log` table.

---

## 19. Operations Scripts

All scripts are in the `scripts/` directory. Run from the repo root.

### Validation and readiness


| Script                                                 | Purpose                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `bash scripts/verify_deploy_readiness.sh`              | Pre-deploy validation (Dockerfiles, configs, env)             |
| `bash scripts/verify_deploy_readiness.sh --strict-env` | Production-only gate (requires real secrets)                  |
| `bash scripts/validate_production_env.sh`              | Validates secrets, HTTPS, placeholder removal                 |
| `bash scripts/meeting_ready.sh`                        | Non-destructive full-stack bring-up + health checks for demos |


### Database


| Script                                                          | Purpose                                            |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `bash scripts/run_production_migrations.sh`                     | Apply all numbered migrations in order             |
| `bash scripts/backup_postgres.sh`                               | Timestamped PostgreSQL dump to `backups/postgres/` |
| `bash scripts/restore_postgres.sh backups/postgres/<file>.dump` | Restore a backup                                   |


### Stateful storage


| Script                                                                  | Purpose                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `bash scripts/backup_stateful_storage.sh`                               | Archive MinIO data, Redis persistence, Trident models |
| `bash scripts/restore_stateful_storage.sh backups/stateful/<timestamp>` | Restore from snapshot                                 |


### Data ingest


| Script                                  | Purpose                                                     |
| --------------------------------------- | ----------------------------------------------------------- |
| `bash scripts/ingest_lvco.sh`           | Batch ingest CSV/XLSX from `data/lvco/`                     |
| `python3 scripts/lvco_live_pipeline.py` | Full pipeline: ingest + Trident score + PDF materialization |
| `python3 scripts/wht_data_room_pull.py` | WHT data-room automated pulls                               |
| `bash scripts/import_matia_to_core.sh`  | Import data from Matia pipeline                             |


### Infrastructure


| Script                                 | Purpose                                   |
| -------------------------------------- | ----------------------------------------- |
| `bash scripts/hard_boot.sh`            | Full teardown and rebuild of Docker stack |
| `bash scripts/check_container_pins.sh` | Verify Docker image version pins          |


---

## 20. Deploying with Docker Compose

The repo ships a **single full stack** in [docker-compose.yml](../docker-compose.yml): Postgres, Redis, MinIO, Core, Trident, Intake, ML, EDI, Availity, Dashboard, and nginx.

### Prerequisites

- Docker Engine 24+ (or Docker Desktop) with enough disk for images and volumes.
- Root `.env` — copy from `.env.template` and replace placeholder secrets (`CHANGE_ME`, etc.).

### Bring up

```bash
cp .env.template .env   # once
docker compose up -d --build
# or: bash scripts/docker-up.sh
```

- **Dashboard (via nginx):** `http://localhost/` (server_name includes `localhost`, `127.0.0.1`, `dashboard.strykefox.com` for local hostname testing).
- **Core (host-published):** `http://127.0.0.1:8001` — check `GET /ready` before relying on login.
- **EDI:** `http://127.0.0.1:8006/health`

### Production-style settings

- Set `ENVIRONMENT=production` in `.env` only when all secrets are real; backend `settings.validate()` rejects placeholders in production.
- Point `CORS_ALLOW_ORIGINS` and `TRUSTED_HOSTS` at the hostnames you expose through nginx or your load balancer.
- For TLS, terminate at nginx or an external LB (see commented SSL blocks in `nginx/nginx.conf`).

### Important notes

- Default **Postgres** in Compose uses the `postgres` service; `DATABASE_URL` defaults to `postgresql://poseidon:poseidon@postgres:5432/poseidon_db` unless overridden in `.env`.
- **MinIO** in Compose listens on **9000** inside the network (`MINIO_ENDPOINT=minio:9000` in `.env.template`).
- `bash scripts/hard_boot.sh` runs `docker compose down -v` then `up -d --build` — **destructive** to local volumes.

---

## 21. Backup and Restore

### PostgreSQL

```bash
# Backup
bash scripts/backup_postgres.sh
# Creates: backups/postgres/poseidon_<timestamp>.dump

# Restore
bash scripts/restore_postgres.sh backups/postgres/poseidon_<timestamp>.dump
```

### Stateful storage (MinIO + Redis + models)

```bash
# Backup
bash scripts/backup_stateful_storage.sh
# Creates: backups/stateful/<timestamp>/

# Restore
bash scripts/restore_stateful_storage.sh backups/stateful/<timestamp>
```

---

## 22. Security and Compliance

### Authentication

- **Passwords:** bcrypt (cost 12) with SHA256 fallback for legacy hashes.
- **Sessions:** JWT with configurable expiry (`JWT_EXPIRY_HOURS`, default 8; dashboard session length also respects `NEXTAUTH_SESSION_MAX_AGE`).
- **NextAuth:** Cookie-based session for the dashboard.

### Authorization

- Role-based access control: admin, billing, intake, rep, executive, system.
- All queries scoped by `org_id` (multi-tenant isolation).

### Audit trail

Every sensitive action writes to the `audit_log` table:

- `org_id`, `user_id`, `action`, `resource`, `resource_id`, `ip_address`, `timestamp`
- No PHI in audit rows.

### PHI protection

- `PHI_IN_LOGS=false` by default — app logs use IDs only.
- ML models train on data that never leaves the stack.
- Documents stored in MinIO (S3-compatible, self-hosted).

### Network security

- nginx adds security headers: `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`.
- Rate limiting: 60 req/min for API, 10 req/min for auth and uploads.
- `CORS_ALLOW_ORIGINS` restricted to the dashboard origin.
- `TRUSTED_HOSTS` whitelist for FastAPI.
- OpenAPI docs disabled in production (`EXPOSE_API_DOCS=false`).
- TLS-ready nginx config (uncomment SSL block and set cert paths).

---

## 23. Troubleshooting

### "Cannot reach the database"

- Verify `DATABASE_URL` in root `.env` matches **where Postgres actually runs** (Compose service `postgres:5432` from inside containers, or an external URL with `sslmode=require` if TLS is required).
- The shared `base.py` helper can normalize some DSNs for managed providers.
- If you use the bundled Postgres, ensure the `postgres` container is healthy: `docker compose ps` and `docker compose logs postgres --tail=50`.

### Dashboard login fails

- Confirm `NEXTAUTH_SECRET` is set and matches between build and runtime.
- Confirm `NEXTAUTH_URL` matches the URL you're accessing.
- Confirm `CORE_API_URL` is reachable from the dashboard container.

### Services unhealthy in Docker Compose

- Check logs: `docker compose logs <service-name>`
- Health checks hit `/ready` (Python services) or `/api/health` (dashboard) or `/health` (EDI) or `/live` (Availity).
- Redis and MinIO must be healthy before app services start (dependency ordering in Compose).

### Ingest script auth errors

- The ingest script must hit Core's `/auth/login`, **not** NextAuth's `/api/auth`.
- Set `CORE_BASE_URL` to reach Core directly: `http://127.0.0.1:8001` or `http://localhost/api`.

### Trident not scoring orders

- Verify `TRIDENT_API_URL` is set and the Trident service is running.
- Check `TRIDENT_LEARNING_MODE` is not `off`.
- Confirm `MIN_TRAINING_RECORDS` threshold is met.

### EDI claims rejected

- Verify `EDI_DRY_RUN=false` for real submissions.
- Check ISA envelope variables (`ISA_SENDER_ID`, `ISA_RECEIVER_ID`, etc.).
- For Stedi: confirm `STEDI_API_KEY` is the raw key (no "Bearer" prefix).
- For Availity SFTP: confirm `AVAILITY_SFTP_USER` and `AVAILITY_SFTP_PASS`.

### Duplicate orders after re-import

- Run migration `008_dedup_orders_sorted_hcpcs.sql` to clean up historical duplicates.
- Core now deduplicates across requests using sorted HCPCS + diagnosis signature.

---

## 24. File and Folder Map

```
poseidon 2/
├── frontend/                    # Next.js 16 dashboard
│   ├── src/
│   │   ├── app/                 # App Router pages and API routes
│   │   │   ├── api/             # BFF proxy routes to backend services
│   │   │   ├── admin/           # Admin pages (governance, learning, denials)
│   │   │   ├── intake/          # Intake page
│   │   │   ├── patients/        # Patient record pages
│   │   │   ├── fax/             # Fax management
│   │   │   ├── revenue/         # Revenue analytics
│   │   │   └── settings/        # Settings
│   │   ├── components/          # React components (dashboard, kanban, charts)
│   │   └── lib/                 # Auth, API helpers, config
│   ├── Dockerfile
│   ├── package.json
│   └── .env.local               # Local dev overrides (not committed)
│
├── services/
│   ├── shared/                  # Shared Python base (app factory, DB, Redis, config)
│   │   └── base.py
│   ├── core/                    # Core API service
│   │   ├── main.py              # FastAPI app + all route mounts
│   │   └── Dockerfile
│   ├── trident/                 # Trident scoring engine
│   │   ├── main.py
│   │   ├── Historical_Model_Data/
│   │   └── Dockerfile
│   ├── intake/                  # Intake / ingest service
│   │   ├── main.py
│   │   └── Dockerfile
│   ├── ml/                      # ML training and patterns
│   │   ├── main.py
│   │   └── Dockerfile
│   ├── edi/                     # EDI service (837P/835)
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   └── routers/
│   │   └── Dockerfile
│   └── availity/                # Availity Node service
│       ├── src/index.ts
│       ├── prisma/schema.prisma
│       ├── package.json
│       └── Dockerfile
│
├── nginx/
│   └── nginx.conf               # Reverse proxy configuration
│
├── scripts/
│   ├── init.sql                 # Canonical database schema
│   ├── migrations/              # Numbered SQL migrations (001–016+)
│   ├── run_production_migrations.sh
│   ├── ingest_lvco.sh           # LVCO batch ingest
│   ├── lvco_live_pipeline.py    # Full pipeline script
│   ├── wht_data_room_pull.py    # WHT automation
│   ├── backup_postgres.sh       # DB backup
│   ├── restore_postgres.sh      # DB restore
│   ├── backup_stateful_storage.sh
│   ├── restore_stateful_storage.sh
│   ├── verify_deploy_readiness.sh
│   ├── validate_production_env.sh
│   ├── meeting_ready.sh
│   └── hard_boot.sh
│
├── data/                        # Gitignored — PHI and local data drops
│   ├── eobs/
│   ├── denials/
│   ├── appeals/
│   ├── spreadsheets/
│   └── lvco/
│
├── docs/
│   ├── MANUAL.md                # This file
│   ├── TECHNICAL_BREAKDOWN.md   # Architecture and design rationale
│   ├── DATA_INGEST.md           # Ingest folder layout and scripts
│   └── PRODUCTION_SECRETS_CHECKLIST.md
│
├── docker-compose.yml           # Full-stack orchestration (canonical runtime)
├── .env.template                # Environment variable template
└── README.md                    # Project overview
```

---

## Target Metrics


| Metric           | Industry Baseline | POSEIDON Target |
| ---------------- | ----------------- | --------------- |
| Denial Rate      | 45%               | < 27%           |
| Clean Claim Rate | 55%               | > 75%           |
| Days in A/R      | 45+               | < 30            |
| Appeal Win Rate  | —                 | > 40%           |


---

*Last updated: April 2026*