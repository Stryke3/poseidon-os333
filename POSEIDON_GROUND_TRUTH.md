⚠ URGENT — see section 8

# POSEIDON — Ground Truth Inventory

> **Deployment policy (current):** **Render is not in use** for this project. Canonical production is **DigitalOcean + docker compose + nginx** (`STATUS.md`, `PRODUCTION_HARDENING.md`). Section 9 below is a **point-in-time (2026-04-18) public-DNS/HTTP snapshot**; it may describe records or headers that pointed at a legacy managed host. Do not treat Render as an operational or deployment target.

**Generated:** 2026-04-18
**Scope:** Local repo at `/Volumes/WORKSPACE/poseidon 2`, local filesystem, git history reachable from that working tree, public internet. SSH to the droplet, direct Neon queries, DigitalOcean API, and Cloudflare API were **out of scope for this run**. Every assertion is one of:

- `[CONFIRMED]` — evidence cited inline (file path + line, command output, HTTP response)
- `[INFERRED]` — indirect signal cited
- `[UNKNOWN]` — not determinable without additional access

This document is an inventory. No recommendations. No gap analysis. No tier rankings.

---

## 1. Access inventory (Phase 0)

| Surface | Accessible? | Evidence |
|---|---|---|
| Local repo `/Volumes/WORKSPACE/poseidon 2` | **Yes** `[CONFIRMED]` | `ls` returns full tree (40+ top-level entries: `services/`, `trident-core/`, `frontend/`, `docker-compose.yml`, `.env`, etc.) |
| Other poseidon directories on laptop | **Yes, 10 workspace dirs match** `[CONFIRMED]` | `find` returned `/Volumes/WORKSPACE/cursor/projects/{Volumes-WORKSPACE-poseidon-2,Users-adamstryker-Library-CloudStorage-GoogleDrive...Poseidon-OS,Volumes-WORKSPACE-poseidon-os,Users-adamstryker-poseidon-os,...Poseidon-OS-web-exec-dashboard,Volumes-WORKSPACE-poseidon}`, plus `/Users/adamstryker/Desktop/poseidon`, plus Cursor/Claude project metadata dirs. Find over `/Volumes` was backgrounded and partial; at least the entries above were printed. |
| Git history | **Yes** `[CONFIRMED]` | `git log --oneline` returns from `23dc00d` back; 60+ commits reachable; latest commit `23dc00d cursor: compose-first deploy docs, DB URL handling, and stack hardening` |
| Web search | **Yes** `[CONFIRMED]` | Used during this run |
| Public HTTP to `*.strykefox.com` | **Yes** `[CONFIRMED]` | `curl` responses captured in section 9 |
| DNS (`dig`) | **Yes** `[CONFIRMED]` | Resolved every subdomain in section 9 |
| SSH to `157.230.145.247` | **Out of scope** | Prompt directive |
| Neon DB direct query | **Out of scope** | Prompt directive |
| DigitalOcean API | **No `doctl` on laptop** `[CONFIRMED]` | `which doctl` prior returned nothing in output; no `doctl auth list` result reached stdout before the broader access-check job was killed for running too long. No DO API usage was attempted. |
| Cloudflare API | **No local credentials found** `[CONFIRMED]` | `ls ~/.cloudflared` and `ls ~/.config/cloudflared` returned nothing in the partial output before the job was terminated; `env \| grep -i cloudflare` produced no output. |

---

## 2. Service map (Phase 1.1)

### Compose files present

| Path | Purpose (from file) |
|---|---|
| `./docker-compose.yml` | Primary. 9 services. `[CONFIRMED]` from read of file (414 lines). |
| `./edi-claim-service 3/docker-compose-snippet.yml` | A snippet, not a full stack. `[CONFIRMED]` filename; contents not inspected this run. |
| `./matia_complete 2/docker-compose.yml` | Belongs to the `matia_complete 2/` side repo (itself gitignored per `.gitignore` line "matia_complete 2/" — actually `.gitignore` lists `aries 2/` and `matia_complete 2/` exclusions). Outside POSEIDON's runtime. |

### Services declared in `./docker-compose.yml` `[CONFIRMED]`

| Service | Image / Build | Published port (host:container) | Health endpoint (from healthcheck block) | Restart | DB driver in code |
|---|---|---|---|---|---|
| `redis` | `redis:7.4.8-alpine` | — (network only) | `redis-cli -a $REDIS_PASS ping` | `unless-stopped` | — |
| `minio` | `minio/minio:RELEASE.2025-04-03T14-56-28Z` | — (network only, console 9001 internal) | `GET /minio/health/live` on `:9000` | `unless-stopped` | — |
| `postgres` | `postgres:16-alpine` | `127.0.0.1:5432:5432` | `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` | `unless-stopped` | — |
| `core` | build `./services` dockerfile `core/Dockerfile` | `127.0.0.1:8001:8001` | `GET /ready` with `Host: api.strykefox.com` | `unless-stopped` | `psycopg[binary,pool]==3.2.3` (`services/core/requirements.txt`) |
| `trident` | build `./services` dockerfile `trident/Dockerfile` | — (network only, `:8002`) | `GET /ready` with `Host: trident.strykefox.com` | `unless-stopped` | `psycopg[binary,pool]==3.2.3` |
| `intake` | build `./services` dockerfile `intake/Dockerfile` | — (network only, `:8003`) | `GET /ready` with `Host: intake.strykefox.com` | `unless-stopped` | `psycopg[binary,pool]==3.2.3` |
| `ml` | build `./services` dockerfile `ml/Dockerfile` | — (network only, `:8004`) | `GET /ready` with `Host: ml.strykefox.com` | `unless-stopped` | `psycopg[binary,pool]==3.2.3` |
| `edi` | build `./services/edi` | `127.0.0.1:8006:8006` | `GET /health` on `:8006` | `unless-stopped` | `asyncpg==0.29.0` (`services/edi/requirements.txt`) |
| `availity` | build `./services/availity` | — (network only, `:8005`) | `GET /live` on `:8005` | `unless-stopped` | **Not Python.** Node/Express, `@prisma/client` (`services/availity/package.json`) |
| `dashboard` | build `./frontend` | — (network only, `:3000`) | `GET /api/health` with `Host: dashboard.strykefox.com` | `unless-stopped` | — (Next.js) |
| `nginx` | `nginx:1.29.6-alpine` | `80:80`, `443:443` | `GET /healthz` on `:80` | `unless-stopped` | — |

That is **11 services** — not 9. The infrastructure trio (`redis`, `minio`, `postgres`), the 5 Python backends (`core`, `trident`, `intake`, `ml`, `edi`), the `availity` Node service, the `dashboard` Next.js service, and `nginx`. `[CONFIRMED]` from `docker-compose.yml` lines 31–413.

### Port memory check `[CONFIRMED]`

| Claim (prior memory) | Actual |
|---|---|
| `edi` on `:8005`, `availity` on `:8006` | **Inverted.** `edi:8006/health`, `availity:8005/live`. `docker-compose.yml` lines 254/306 (`PORT: 8006` / `PORT: 8005`), healthcheck lines 291/314. `.env` line 93: `EDI_API_URL=http://edi:8006`. |
| core/trident/intake/ml ports | Match: `8001/8002/8003/8004`, each health endpoint is `/ready`. |

### Additional compose fact `[CONFIRMED]`

Every app service's `environment:` block sets `DATABASE_URL: ${POSEIDON_DATABASE_URL:-postgresql://poseidon:poseidon@postgres:5432/poseidon_db}` (lines 103, 145, 183, 219, 255, 307). Because Compose's `environment:` block overrides `env_file:`, the Neon URL in `.env` (`DATABASE_URL=...neon.tech...`, `.env` line 22) is **shadowed** unless `POSEIDON_DATABASE_URL` is separately set. `POSEIDON_DATABASE_URL` is not present in `.env` or `.env.template`. The header comment of `docker-compose.yml` (lines 10–11) explicitly warns about this: *"use POSEIDON_DATABASE_URL to override bundled Postgres. Do not rely on DATABASE_URL from .env for Compose — that broke many setups."* What a live **droplet or other production host** resolves is `[UNKNOWN]` from this vantage (see deployment policy: Render is not used).

---

## 3. Application surface (Phase 1.2)

### Python services — entrypoints, frameworks, route counts `[CONFIRMED]`

All Python services use **FastAPI 0.115.0 + uvicorn 0.30/0.32** (per each service's `requirements.txt`).

| Service | Entry point | Routes | Method breakdown (from `grep -E "@(app\|router)\.(get\|post\|...)"`)|
|---|---|---|---|
| `core` | `services/core/main.py` | **90** | mix of GET (patient/order/denial/fax/billing/analytics reads), POST (eligibility, workflow, fax, outcomes, webhooks), PATCH, DELETE |
| `trident` | `services/trident/main.py` | **24** | scoring, training, payer rules, guidance, data-modeling catalog |
| `intake` | `services/intake/main.py` | **17** | patient intake, batch, eligibility-check, EOB, parse-document, PDF parsing, ingest routes |
| `ml` | `services/ml/main.py` | **15** | predict-denial, predict-reimbursement, train, weights/patterns endpoints |
| `edi` | `services/edi/app/main.py` | **17** | batches, submit, poll-ack, poll-stedi-835, 835 upload, parse-raw |
| `trident-core` (separate Alembic-backed package) | `trident-core/main.py` | **10** | Separate FastAPI app using SQLAlchemy + Alembic rather than psycopg. Not referenced by `docker-compose.yml` services. |

**Total declared HTTP routes across Python services: 163** (`[CONFIRMED]` by summing grep counts).

### External library signals `[CONFIRMED]`

From `requirements.txt` and direct grep of service code:

| Import/library | Where |
|---|---|
| `fastapi`, `uvicorn` | all 5 services + `trident-core` |
| `psycopg[binary,pool]` 3.2.3 | core, trident, intake, ml |
| `asyncpg` 0.29.0 | edi |
| `minio` 7.2.12 | core (only) |
| `sqlalchemy` 2.0.35 + `alembic` 1.13.2 + `psycopg2-binary` 2.9.9 | `trident-core/` only |
| `sentry_sdk`, `Sentry.init`, `SENTRY_DSN` | **None.** `grep` across all `.py`/`.ts`/`.tsx` returned zero hits in service code. Frontend `package-lock.json` contains no Sentry package. `[CONFIRMED]` |
| `opentelemetry`, `OTEL_` | **None.** Zero hits. `[CONFIRMED]` |
| `boto3`, `stripe`, `docusign`, `twilio`, `phaxio`, `concord`, `srfax`, `datadog`, `b2sdk`, `do.spaces` | **None** in Python requirements or code. `[CONFIRMED]` |

### Availity service (Node/TypeScript) `[CONFIRMED]`

- Declared dependencies (from `services/availity/package.json`): `@prisma/client`, `dotenv`, `express`, `express-rate-limit`, `mammoth`, `pdf-parse`, `pino`, `zod`
- Approximate Express route count (from `grep`): **51** routes
- Compiled `dist/` is checked in (directly referenced in compose build context? No — build context is `./services/availity` with its own Dockerfile; `dist/` presence means the build artifact is shipped with the repo)
- 26 test files (`*.test.ts`) under `services/availity`

### Frontend `[CONFIRMED]`

- `frontend/package.json`: name `poseidon-frontend`, `next: ^16.2.1`, `react: ^19.2.4`
- **31 `page.tsx` files** (App Router pages)
- **64 `route.ts` files** (Next.js API route handlers — these act as a BFF)
- Frontend config: `frontend/vercel.json` (Next.js), root `vercel.json` (`{"rootDirectory":"frontend"}`), root `firebase.json` (hosting config pointing at `frontend/`). Three deploy surfaces are configured; which is live is addressed in section 9.

---

## 4. Data model (Phase 1.3) `[CONFIRMED]`

### Schema-defining files found

| File | Purpose | Size / tables |
|---|---|---|
| `scripts/init.sql` | Primary schema loaded by local Postgres container at init (`volumes: ./scripts/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro` in compose) | 47,817 bytes. **39 `CREATE TABLE IF NOT EXISTS` statements**, listed below. |
| `scripts/seed_admin.sql` | 2,113 bytes. Bootstraps admin user/org. |
| `trident-core/app/models/schema.sql` | Schema for `trident-core` package. Not inspected for table list this run. |
| `services/availity/prisma/schema.prisma` | Prisma schema for Node availity service. 24+ `model` declarations with `@@map`. |
| `scripts/migrations/` | **17 numbered SQL migrations** (`001_add_pod_document_id.sql` → `016_*.sql`). Two different `016_*.sql` files (`016_operator_adam_strykefox.sql` and `016_stedi_835_import_ids.sql`) — numbering collision. |
| `services/edi/migrations/` | 1 file (`001_edi_schema.sql`) |
| `services/availity/prisma/migrations/` | 18 migrations, `001_availity_tables` through `018_denial_automation_engine` |
| `trident-core/alembic/versions/` | **Directory does not exist.** Alembic is declared in `trident-core/requirements.txt` but no version files are present. `[CONFIRMED]` by `ls: trident-core/alembic/versions/: No such file or directory`. |

### Tables defined in `scripts/init.sql` (public schema)

Listed in order of appearance:

```
organizations, users, payers, patients, patient_insurances, physicians, orders,
order_diagnoses, order_line_items, order_documents, eligibility_checks,
auth_requests, payer_auth_requirements, eob_claims, eob_line_items,
payment_outcomes, eob_worklist, denials, appeals, trident_rules,
trident_training_ledger, learned_rates, timely_filing_windows, cmn_tracker,
shipments, workflow_events, audit_log, fax_log, notifications,
communications_messages, patient_notes, claim_submissions, remittance_batches,
remittance_claims, remittance_adjustments, remittance_service_lines,
stedi_835_import_ids, edi_audit_log, schema_version, password_reset_tokens
```

Total: **40 tables** in the primary schema definition. `[CONFIRMED]` from `grep -E "^CREATE TABLE" scripts/init.sql | wc -l` combined with the listing above.

### Availity Prisma models (separate namespace within the same DB) `[CONFIRMED]`

Prisma models map to these additional tables (via `@@map`):

```
availity_cases, payer_behavior_rules, authorization_outcomes, payer_manuals,
manual_requirements, learned_rule_suggestions, playbook_performance,
governance_recommendations, governance_drafts, governance_decisions,
payer_playbooks, playbook_executions, payer_score_snapshots,
payer_intelligence_audit_logs, availity_eligibility_checks,
availity_prior_auth_requests, availity_audit_logs,
availity_prior_auth_documents, availity_prior_auth_packets,
pre_submit_validation_results, denial_events,
denial_classification_snapshots, appeal_packets, appeal_outcomes
```

**24 additional tables** via Prisma. Combined with the 40 init.sql tables and any `stedi_835_import_ids`-style additions from migrations, the repository describes a schema of roughly **64+ tables** that would exist in a fully-migrated database. `[CONFIRMED]` from `services/availity/prisma/schema.prisma` grep for `^model ` and `@@map`.

### Schema conflicts / parallelism `[CONFIRMED]`

- Two migration systems target the same database: raw SQL (`scripts/migrations/` + `services/edi/migrations/`) **and** Prisma (`services/availity/prisma/migrations/`). Each owns disjoint table namespaces (psycopg services own `patients`/`orders`/etc.; Prisma owns `availity_*` and governance tables).
- `trident-core/` declares Alembic in `requirements.txt` but has no `alembic/versions/` directory. If it was ever used, the history isn't present in the tree.
- A `_prisma_migrations` tracking table and an `audit_log`-style custom `schema_version` table would both exist in a fully-migrated database. `[INFERRED]` from presence of both systems.

---

## 5. External integrations declared in code (Phase 1.4) `[CONFIRMED]`

For each integration, column three is my assessment: **live in code** (there is a code path that performs the call), **scaffolded** (imports/config/types exist but not wired into a request flow), **env-only** (no references in code; appears only in `.env.template` or `.env`), **absent** (no references at all).

| Integration | Referenced in | Status |
|---|---|---|
| Availity (SOAP/REST + SFTP) | `services/core/availity_client.py`, `services/intake/main.py`, `services/edi/app/clients/availity_sftp.py`, entire `services/availity/` Node service (Prisma schema, 51 routes, 26 tests) | **live in code** |
| Stedi (EDI transport API) | `services/edi/app/clients/stedi.py`, `services/edi/app/main.py` (`/poll-stedi-835`), migration `016_stedi_835_import_ids.sql`, `scripts/stedi-audit.sh` | **live in code** |
| DocuSign / Dropbox Sign (HelloSign) | `services/core/main.py` — `/webhooks/dropbox-sign/swo` and `/api/v1/webhooks/dropbox-sign` routes; `services/shared/base.py` references `DROPBOX_SIGN_*` env vars | **live in code** (webhook side only from grep; outbound request side `[UNKNOWN]` without deeper code read) |
| Gmail OAuth (for patient intake mailbox) | `services/core/main.py`, `services/intake/main.py`; `GMAIL_OAUTH_*` env vars wired in `services/shared/base.py`; `frontend/src/.../route.ts` references `process.env.GMAIL_*` | **live in code** |
| Anthropic (Claude) | Referenced in code in `services/core/`, `services/availity/src/modules/learning/manualRequirement.llm.ts`, `services/intake/main.py`, frontend BFF routes. `.env` line 126 has a live `sk-ant-api03-...` key. | **live in code** |
| OpenAI | Referenced in frontend BFF (`process.env.OPENAI_API_KEY`), `services/shared/base.py`, `services/core/`, `services/availity/src/modules/learning/manualRequirement.llm.ts`. Primary LLM provider appears configurable (`TRIDENT_DIGEST_PROVIDER=auto`). `.env` has no OpenAI key set. | **scaffolded, no key configured** |
| Sinch Fax v3 | `services/core/main.py` (`sinch_fax_id` in `fax_log`, `/fax/log` endpoints, `/fax/inbound` webhook handler), `services/shared/base.py`, `services/intake/main.py`, `frontend/src/.../*.ts` references `SINCH_*`. `.env` has live `SINCH_PROJECT_ID`, `SINCH_KEY_ID`, `SINCH_KEY_SECRET`, `SINCH_FROM_NUMBER=+12084359096`. | **live in code** |
| Matia (data pipeline) | `frontend/src/...` references `MATIA_API_URL`, `MATIA_API_BEARER`, `MATIA_INTEGRATION_ENABLED`; `.env` has flag off (`MATIA_INTEGRATION_ENABLED=false`) | **scaffolded, flag off** |
| HubSpot | `HUBSPOT_API_KEY`/`HUBSPOT_PORTAL_ID` are blank in `.env` (lines 83–84). Grep of code directories returned **zero hits** for `hubspot`. | **env-only** |
| Stripe | Grep across `.py`/`.ts`/`.tsx`/`.js`/`.md` returned one hit in `frontend/package-lock.json` (transitive only). No `stripe` imports in code. | **absent** |
| Twilio | Zero hits. `[CONFIRMED]` | **absent** |
| Phaxio | Zero hits in services. `[CONFIRMED]` | **absent** |
| Concord, SRFax | Zero hits. `[CONFIRMED]` | **absent** |
| Sentry | Zero hits for `sentry_sdk`, `Sentry.init`, `SENTRY_DSN`. `[CONFIRMED]` | **absent** |
| OpenTelemetry / `OTEL_` | Zero hits. `[CONFIRMED]` | **absent** |
| DataDog | Zero hits. `[CONFIRMED]` | **absent** |
| DigitalOcean Spaces | Zero hits for `DO_SPACES`/`digitalocean.spaces`/`spaces_key`. `[CONFIRMED]` | **absent** |
| Backblaze B2 | Zero hits for `b2sdk`/`backblaze`. `[CONFIRMED]` | **absent** |
| Google Sheets API (`gspread`, `sheets.v4`) | Only `scripts/build_manual_pdf.py`. Not in production service path. `[CONFIRMED]` | **scripts only** |

---

## 6. Environment surface (Phase 1.5) `[CONFIRMED]`

### Python backend env vars actually read in code

Sampled via `grep -rhoE "os\.(environ\[|environ\.get\(|getenv\()'[A-Z_][A-Z0-9_]*'"` across `services/` and `trident-core/`. Truncated to 80 unique names; the full grep was not exhaustive (cut at head of sort output):

```
APPEAL_WINDOW_DAYS, APP_ENV, AVAILITY_BASE_URL, AVAILITY_BILLING_TIN,
AVAILITY_CLAIMS_URL, AVAILITY_CLAIM_STATUS_URL, AVAILITY_CLIENT_ID,
AVAILITY_CLIENT_SECRET, AVAILITY_CUSTOMER_ID, AVAILITY_DEFAULT_PROVIDER_NPI,
AVAILITY_ELIGIBILITY_URL, AVAILITY_RECEIVER_ID, AVAILITY_SENDER_ID,
AVAILITY_SFTP_HOST, AVAILITY_SFTP_HOST_QA, AVAILITY_SFTP_PASS,
AVAILITY_SFTP_PORT, AVAILITY_SFTP_USER, AVAILITY_TOKEN_URL, AVAILITY_USE_QA,
BILLING_ADDR, BILLING_CITY, BILLING_CLAIM_BLOCK_DUPLICATE_SUBMISSION,
BILLING_CLAIM_REQUIRE_BILLING_READY, BILLING_NPI, BILLING_ORG_NAME,
BILLING_PHONE, BILLING_STATE, BILLING_TAXONOMY, BILLING_TAX_ID, BILLING_ZIP,
CORE_API_EMAIL, CORE_API_PASSWORD, CORE_API_URL, CORS_ORIGINS, DATABASE_URL,
DB_MAX_OVERFLOW, DB_POOL_SIZE, DENIAL_THRESHOLD, DROPBOX_SIGN_API_KEY,
DROPBOX_SIGN_REQUEST_URL, DROPBOX_SIGN_WEBHOOK_SECRET, EDI_API_URL,
EDI_DEFAULT_ORG_ID, EDI_DRY_RUN, EDI_RELAX_VALIDATION, EMAIL_FROM_ADDRESS,
EMAIL_INTAKE_USERNAME, ENVIRONMENT, EXPOSE_API_DOCS, GMAIL_INTAKE_USER,
GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN,
GMAIL_TOKEN_URL, GOOGLE_CALENDAR_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
GOOGLE_REFRESH_TOKEN, INTAKE_API_URL, INTAKE_OCR_CONFIDENCE_THRESHOLD,
INTERNAL_API_KEY, ISA_RECEIVER_ID, ISA_RECEIVER_QUAL, ISA_SENDER_ID,
ISA_SENDER_QUAL, ISA_TEST_INDICATOR, JWT_ALGORITHM, JWT_EXPIRY_HOURS,
JWT_SECRET, LOG_LEVEL, MINIO_ACCESS_KEY, MINIO_BUCKET, MINIO_BUCKET_DOCUMENTS,
MINIO_ENDPOINT, MINIO_PUBLIC_ENDPOINT, MINIO_SECRET_KEY, MINIO_SECURE,
MIN_TRAINING_RECORDS, ML_API_URL
```

Additional frontend env vars from `grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*" frontend/src` (unique, ~35):

```
ALLOWED_STORAGE_DOWNLOAD_HOSTS, ANTHROPIC_API_KEY, AVAILITY_SERVICE_URL,
CORE_FETCH_TIMEOUT_MS, EDI_INTERNAL_API_KEY, EMAIL_INTAKE_USERNAME,
GMAIL_INTAKE_USER, GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET,
GMAIL_OAUTH_REFRESH_TOKEN, INTAKE_API_FALLBACK_URLS, INTAKE_API_URL,
INTAKE_REQUEST_TIMEOUT_MS, INTERNAL_API_KEY, MATIA_API_BEARER, MATIA_API_URL,
MATIA_INTEGRATION_ENABLED, MATIA_PIPELINE_PATH, MINIO_ENDPOINT,
MINIO_PUBLIC_ENDPOINT, NEXTAUTH_SESSION_MAX_AGE, NEXTAUTH_URL, NEXT_PHASE,
NEXT_PUBLIC_MATIA_DASHBOARD_URL, NEXT_PUBLIC_MINIO_HOST, NODE_ENV,
OPENAI_API_KEY, POSEIDON_ENFORCE_NO_LOCALHOST, PUBLIC_INQUIRY_ALLOWED_ORIGINS,
SINCH_FROM_NUMBER, SINCH_KEY_ID, SINCH_KEY_SECRET, SINCH_WEBHOOK_SECRET,
TRIDENT_DIGEST_ANTHROPIC_MODEL, TRIDENT_DIGEST_LLM, TRIDENT_DIGEST_OPENAI_MODEL,
TRIDENT_DIGEST_PROVIDER
```

### `.env.template` coverage

`.env.template` declares ~80 keys (partial listing in `grep -E "^[A-Z_]...=" .env.template`). Vars **used in code but missing from `.env.template`** include at least:

- `INTAKE_OCR_CONFIDENCE_THRESHOLD` — referenced in intake service but not templated
- `EDI_INTERNAL_API_KEY` — referenced in frontend BFF but not templated (the canonical name in `.env.template` is `INTERNAL_API_KEY`)
- `MATIA_API_URL`, `MATIA_API_BEARER`, `MATIA_PIPELINE_PATH`, `MATIA_INTEGRATION_ENABLED`, `NEXT_PUBLIC_MATIA_DASHBOARD_URL` — referenced but not in template
- `POSEIDON_DATABASE_URL` — referenced by every service in `docker-compose.yml` as the override variable, but not in `.env.template`
- `ALLOWED_STORAGE_DOWNLOAD_HOSTS`, `POSEIDON_ENFORCE_NO_LOCALHOST`, `PUBLIC_INQUIRY_ALLOWED_ORIGINS`, `CORS_ORIGINS` (backend uses this name; `.env` uses `CORS_ALLOW_ORIGINS`) — mismatched/missing

`[CONFIRMED]` by comparing the two listings above.

---

## 7. Documentation inventory (Phase 1.6) `[CONFIRMED]`

`find . -maxdepth 5 -name "*.md"` (excluding `node_modules/`, `.git/`, `dist/`, `.next/`, `backups/`, `aries*/`, `matia*/`, `frontend/vendor/`), with size and last-modified date:

| Size (bytes) | Modified | Path | One-line summary (from first line / section headers) |
|---|---|---|---|
| 645 | 2026-03-20 | `./.cursor/CURSOR_SHORTCUTS.md` | Cursor IDE shortcuts |
| 30,619 | 2026-03-18 | `./POSEIDON_ALL_FOUR.md` | Older (stale by 30 days) narrative covering multi-domain platform scope |
| 8,176 | 2026-03-18 | `./POSEIDON_FIX.md` | Older fix log |
| 6,517 | 2026-04-18 | `./PRODUCTION_HARDENING.md` | **Deploy runbook-adjacent.** "Canonical production: self-hosted Docker Compose on a server or VM." Discusses self-hosted Compose, optional Vercel frontend split, secrets checklist. |
| 15,037 | 2026-04-18 | `./README.md` | Primary README. |
| 6,585 | 2026-04-18 | `./SECURITY_AND_COMPLIANCE.md` | Lists what's "in place" (audit_log, PHI-in-logs flag, bcrypt, JWT, rate-limiting, backup scripts) vs. "you should" (TLS, BAs, retention policy). |
| 2,836 | 2026-04-18 | `./STATUS.md` | Last updated 2026-04-10 (8 days stale). States canonical runtime is Docker Compose. Explicitly notes: "Not yet verified here: Row-level SQL validation against production-like data volumes; External integrations with real credentials; Authenticated exercise of `/worklist/protocols` against a populated DB." |
| 3,054 | 2026-03-10 | `./data/README.md` | Data folder conventions |
| 6,263 | 2026-04-18 | `./docs/DATA_INGEST.md` | LVCO and data ingest procedure |
| 43,449 | 2026-04-18 | `./docs/MANUAL.md` | Operator manual |
| 1,918 | 2026-04-08 | `./docs/PRODUCTION_SECRETS_CHECKLIST.md` | Secrets to set |
| 9,377 | 2026-04-18 | `./docs/TECHNICAL_BREAKDOWN.md` | Architecture description |
| 2,923 | 2026-04-18 | `./firestarter/README.md` | Side tool |
| 3,910 | 2026-03-23 | `./services/availity/README.md` | Availity microservice readme |
| 1,632 | 2026-04-10 | `./stedi-audit-report/README.md` | Stedi audit report side artifact |
| 1,174 | 2026-04-01 | `./trident-core/README.md` | Separate Trident service readme |

**No files matching `RUNBOOK.md`, `DR.md`, `DEPLOY.md`, `ARCHITECTURE.md`, `HIPAA.md`, `INCIDENT.md`, or `ONBOARDING.md` exist in the tree.** `[CONFIRMED]` by `find ... -iname "runbook*" -o -iname "DEPLOY*" -o ...` returning no matches. `PRODUCTION_HARDENING.md` is the closest-to-runbook artifact.

---

## 8. Secrets exposure (from Phases 2.1 and 2.4)

### ⚠ URGENT — live credentials reachable from the laptop

Two classes of exposure were confirmed during this run. Both are on-disk and accessible to anything with read access to this workspace.

#### 8.1 Neon production DB password committed to git history `[CONFIRMED]`

- `git log --all -S "npg_x8CiDQyjMS5p" --oneline` returns exactly one commit:
  ```
  877bbeb Full Poseidon platform: services, dashboard, fax system, Render deploy
  ```
  `877bbeb` was authored **2026-03-26**, **~60 commits ago**, and is reachable from `origin/main`, `remotes/origin/cursor/compose-deployment-docs-db-hardening`, `remotes/origin/feature/edi-core-client-proxy-headers-claim-migrations`, and the local branches of the same names.
- **The password is still present in HEAD.** Files currently on disk in the working tree that contain `neondb_owner:npg_x8CiDQyjMS5p@...neon.tech...`:
  - `./scripts/seed_real.js` (line 4)
  - `./scripts/seed_neon.js` (line 4)
- Literal value in the file:
  ```
  postgresql://neondb_owner:npg_x8CiDQyjMS5p@ep-shy-cherry-akxipuq8-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require
  ```
- Matching value appears in `.env` line 22 (`DATABASE_URL=...npg_x8CiDQyjMS5p...`). `[CONFIRMED]` — the value in the seed scripts is the same credential that `.env` presents as the production Neon connection.
- `.env` line 27 shows a **different** `POSTGRES_PASSWORD` value (`2Kz7mQ9vL1dN6sR4xT8pW3yB5cH0jF2uA9eM7nQ1`) than the `npg_x8CiDQyjMS5p` embedded in `DATABASE_URL`. One or both may be stale. `[CONFIRMED]` from reading `.env`.

#### 8.2 GitHub Personal Access Token embedded in `origin` remote URL `[CONFIRMED]`

- `git remote -v` prints:
  ```
  origin  https://Stryke3:github_pat_[REDACTED]@github.com/Stryke3/poseidon-os333.git (fetch)
  origin  https://Stryke3:github_pat_[REDACTED]@github.com/Stryke3/poseidon-os333.git (push)
  ```
- The PAT lives in `.git/config` (not tracked by git itself, but present in any filesystem backup or screenshare).
- The repository name is `poseidon-os333.git` (three trailing threes), not `poseidon` or `poseidon-os`.

#### 8.3 What is **not** in git history `[CONFIRMED]`

- `git log --all -S "sk-ant-api03"` returned nothing → the Anthropic API key in `.env` line 126 has **not** been committed.
- `git log --all -S "GOCSPX-"` returned nothing → the Gmail OAuth client secret has **not** been committed.
- `.env` is listed in `.gitignore` line 12 (and `.env.local` line 13, `frontend/.env.local` line 14). No `.env*` files have been added to history; the git-sweep of added filenames returned only `.env.production.example`, `.env.template`, `docs/PRODUCTION_SECRETS_CHECKLIST.md`, and `services/availity/.env.example` — all are template files and were inspected for placeholder-only content.
- The only diff-level secret changes in history are in earlier `.env.template` edits swapping `CHANGE_ME` placeholders for local-dev default values like `poseidon`, `poseidonlocal`, `localredis`, `poseidon-local-internal-key`. Those are not production secrets.

#### 8.4 Categories of secret currently sitting in `.env` (on-disk, not tracked) `[CONFIRMED]`

Read from `.env` lines 8–151:

- Platform auth/crypto: `SECRET_KEY`, `JWT_SECRET`, `POSEIDON_API_KEY`, `INTERNAL_API_KEY`, `NEXTAUTH_SECRET`
- Database: full Neon `DATABASE_URL`, plus a standalone `POSTGRES_PASSWORD` that does not match the password inside `DATABASE_URL`
- Redis password
- MinIO access/secret keys
- Core service-account login: `CORE_API_EMAIL=system@strykefox.com`, `CORE_API_PASSWORD=...`
- Gmail OAuth client id + secret + refresh token (live — `GOCSPX-` secret and a `1//0` refresh token)
- Anthropic API key (live — `sk-ant-api03-...`)
- Sinch Fax v3 project id + key id + key secret + `SINCH_FROM_NUMBER=+12084359096`
- Availity customer id (`2618273`), SFTP user (`Poseidon`). `AVAILITY_CLIENT_ID` and `AVAILITY_CLIENT_SECRET` are **blank** in `.env` lines 67–68.
- Stedi API key placeholder: `STEDI_API_KEY=PASTE_YOUR_STEDI_API_KEY_HERE` (line 96, unfilled)
- Billing identity: `BILLING_NPI=1821959420`, `BILLING_TAX_ID=393429726`, `BILLING_ORG_NAME=STRYKEFOX MEDICAL`

Two additional local-only files contain copies of some of these same credentials:

- `frontend/.env.local` (ignored via `.gitignore` line 14) contains `ANTHROPIC_API_KEY=sk-ant-api03-...`
- `.claude/settings.local.json` also contains `sk-ant-api03-...`. `.claude/` is **not** listed in `.gitignore`. `git ls-files .claude/` returns nothing, so the file isn't currently tracked, but no ignore rule prevents a future `git add .` from staging it. `[CONFIRMED]`

### 8.5 SSH keys on laptop `[CONFIRMED]`

`ls -la ~/.ssh/`:
```
-rw-------  hostgator_rsa            (1823 B, 2026-03-16)
-rw-r--r--  hostgator_rsa.pub
-rw-------  id_ed25519               (411 B, 2026-03-16)
-rw-r--r--  id_ed25519.pub
-rw-------  known_hosts              (2332 B, 2026-04-04)
-rw-------  known_hosts.old
```

No `~/.ssh/config` present. `ssh-add -l` output was truncated (the `timeout` command is not installed on this shell; `ssh-add -l` ran but its output was cut when the broader job was killed) — the set of currently-loaded keys is therefore `[UNKNOWN]`. Whether either public key is authorized on `157.230.145.247` is `[UNKNOWN]` from this vantage (prior-session `ssh root@157.230.145.247` returned `Permission denied (publickey,password)`, which suggests it is not, but this run is not permitted to attempt SSH).

---

## 9. Public surface (Phase 3) `[CONFIRMED]`

*Historical snapshot only —* captured 2026-04-18. **Render is not a current deployment target;** use `STATUS.md` for canonical hosting.

### 9.1 DNS `[CONFIRMED]` (raw `dig +short` output)

```
api.strykefox.com        CNAME  poseidon-core.onrender.com.
                                → gcp-us-west1-1.origin.onrender.com.
                                → gcp-us-west1-1.origin.onrender.com.cdn.cloudflare.net.
                                → A 216.24.57.251, 216.24.57.7

dashboard.strykefox.com  CNAME  dashboard-gas0.onrender.com.
                                → gcp-us-west1-1.origin.onrender.com.
                                → ...cdn.cloudflare.net.
                                → A 216.24.57.7, 216.24.57.251

trident.strykefox.com    A      104.21.90.145, 172.67.157.194   (Cloudflare IPs)
intake.strykefox.com     A      172.67.157.194, 104.21.90.145   (Cloudflare IPs)
ml.strykefox.com         A      172.67.157.194, 104.21.90.145   (Cloudflare IPs)
status.strykefox.com     A      (no record)
edi.strykefox.com        A      (no record)
availity.strykefox.com   A      (no record)

strykefox.com            A      76.76.21.21                     (Vercel apex IP)
strykefox.com            MX     aspmx.l.google.com + alts       (Google Workspace)
strykefox.com            TXT    "v=spf1 include:_spf.google.com ~all", + two google-site-verification
strykefox.com            NS     drake.ns.cloudflare.com, vivienne.ns.cloudflare.com   (Cloudflare DNS)
```

**Key implications (at snapshot time; DNS may have changed), not recommendations:**

- Cloudflare is authoritative DNS for `strykefox.com`.
- In this snapshot, `api.strykefox.com` and `dashboard.strykefox.com` CNAMEd into `*.onrender.com` (legacy managed host), then Cloudflare. **Do not use or extend Render;** production target is DO + compose per `STATUS.md`. `[CONFIRMED]` for snapshot DNS only
- `trident.`, `intake.`, and `ml.` resolve directly to Cloudflare edge IPs (`104.21/172.67`), so the origins are proxied and invisible from DNS alone. `[INFERRED]` HTTP `rndr-id` on `dashboard` at the time; origins for subdomains are `[UNKNOWN]` when 502.
- `edi.`, `availity.`, `status.` subdomains do **not** exist in DNS.
- Apex `strykefox.com` is on Vercel (not the same as the DO compose target for POSEIDON app services).

### 9.2 Liveness probes and openapi.json `[CONFIRMED]`

Raw results from `curl` (timed, truncated to first 300 chars of response where applicable):

```
GET https://api.strykefox.com/           → 503 (0.689s)
GET https://api.strykefox.com/ready      → HTML "Service Suspended" page ("This service has been suspended by its owner.")
GET https://api.strykefox.com/health     → same "Service Suspended"
GET https://api.strykefox.com/live       → same
GET https://api.strykefox.com/openapi.json → same

GET https://trident.strykefox.com/       → 502 (1.178s)
GET https://trident.strykefox.com/ready  → "error code: 502"
GET https://trident.strykefox.com/health → "error code: 502"
GET https://trident.strykefox.com/live   → timeout

GET https://intake.strykefox.com/        → 502 (1.405s)
GET https://intake.strykefox.com/{ready,health,/api/health,/openapi.json} → "error code: 502"

GET https://ml.strykefox.com/            → 502 (0.911s)
GET https://ml.strykefox.com/{same}      → "error code: 502"

GET https://dashboard.strykefox.com/           → 307 redirect (0.944s) → /login
GET https://dashboard.strykefox.com/ready      → Next.js HTML (likely not-found page rendered via SSR)
GET https://dashboard.strykefox.com/health     → Next.js HTML
GET https://dashboard.strykefox.com/api/health → {"status":"ok","service":"dashboard","timestamp":"2026-04-18T21:05:30.853Z"}
GET https://dashboard.strykefox.com/openapi.json → Next.js HTML (no OpenAPI route)

GET http://157.230.145.247/              → 404  (nginx/1.18.0 Ubuntu header, body {"detail":"Not Found"} — a FastAPI-style JSON 404)
GET https://157.230.145.247/ -k          → connect refused, port 443 closed
```

Of the six public hosts probed, **only `dashboard.strykefox.com` responded as a live app in this run**. `api.strykefox.com` returned a “service suspended” page from a legacy host. `trident/intake/ml` were 502 from Cloudflare. The droplet at `157.230.145.247` has port 80 open and returns a FastAPI JSON 404 via `nginx/1.18.0 (Ubuntu)` but port 443 is closed and `/` returns 404.

### 9.3 TLS certificates `[CONFIRMED]` (`openssl s_client` + `openssl x509 -noout -issuer -subject -dates`)

| Host | Issuer | Subject CN | Valid |
|---|---|---|---|
| api.strykefox.com | `C=US, O=Google Trust Services, CN=WE1` | `api.strykefox.com` | 2026-03-31 → 2026-06-29 |
| dashboard.strykefox.com | Google Trust Services WE1 | `dashboard.strykefox.com` | 2026-03-29 → 2026-06-27 |
| trident.strykefox.com | Google Trust Services WE1 | `strykefox.com` (**apex**, not trident) | 2026-04-03 → 2026-07-02 |
| intake.strykefox.com | Google Trust Services WE1 | `strykefox.com` (apex) | 2026-04-03 → 2026-07-02 |

Google Trust Services (common for managed and proxied edges). In this snapshot, `api.` and `dashboard.` had their own subject-matching certs. `trident.`, `intake.` (and by extension `ml.`, not tested) are served under the **apex `strykefox.com` cert** via Cloudflare — consistent with Cloudflare presenting the zone cert on proxied hostnames when the origin's cert subject doesn't match.

### 9.4 Response headers `[CONFIRMED]`

```
api.strykefox.com:        server: cloudflare, cf-ray: ...-LAX
dashboard.strykefox.com:  server: cloudflare, cf-ray: ...-LAX, rndr-id: ..., x-powered-by: Next.js, location: /login
trident.strykefox.com:    server: cloudflare, cf-ray: ...-LAS (origin is down; CF returns its own 502)
intake.strykefox.com:     server: cloudflare, cf-ray: ...-LAS
ml.strykefox.com:         server: cloudflare, cf-ray: ...-LAS
strykefox.com:            server: Vercel
```

All *.strykefox.com subdomains transit Cloudflare. The only response that still got through to a healthy app surface in this snapshot was `dashboard.`. For operational hosting, use the DO + compose model in `STATUS.md` — **not** Render. No `/docs` or `/openapi.json` route was publicly exposed in this run (e.g. `api.` was not serving API docs; dashboard is Next.js).

### 9.5 Droplet at `157.230.145.247` `[CONFIRMED]`

- `ping`: reachable (29ms from this laptop)
- `http://`: port 80 returns `HTTP/1.1 404 Not Found, Server: nginx/1.18.0 (Ubuntu), body {"detail":"Not Found"}`. The JSON-with-"detail" shape is FastAPI's default 404 — `[INFERRED]` that an nginx→FastAPI app is running on the droplet, though whether it's a POSEIDON service or something else is `[UNKNOWN]` from this vantage.
- `https://` with `-k`: connection refused on port 443 (no TLS listener).
- No strykefox.com subdomain currently resolves to `157.230.145.247` — the droplet is **not the production origin for the public API right now**.

---

## 10. Tests and CI (Phase 1.7) `[CONFIRMED]`

### Tests

| Location | Files |
|---|---|
| `services/edi/tests/test_edi_claims_smoke.py` | 1 |
| `trident-core/app/tests/test_dx_linking.py`, `test_reimbursement.py`, `test_modifier_logic.py`, `test_claim_validation.py` | 4 |
| `services/availity/**/*.test.ts` | 26 |

No `tests/` directories are present at the top level of `services/core/`, `services/trident/`, `services/intake/`, or `services/ml/` — the four largest Python services by route count have **0 test files each**. `[CONFIRMED]` by the grep-based inventory.

No `pytest.ini`, `conftest.py`, or `jest.config.*` was found at the repo root. A `.pytest_cache` directory exists under `services/edi/` and `trident-core/app/` (artifacts of running tests in those subtrees).

### CI

`.github/workflows/ci.yml` exists on disk (584 bytes, mtime 2026-03-21), contents:

```yaml
name: CI
on:
  push:
    branches: [main, master]
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4 (node 20, cache frontend/package-lock.json)
      - uses: actions/setup-python@v5 (python 3.11)
      - name: Verify deploy readiness
        run: bash scripts/verify_deploy_readiness.sh
```

**`.github/workflows/` is listed in `.gitignore` line 30.** `git ls-files .github/workflows/` returns empty. `git check-ignore -v .github/workflows/ci.yml` confirms: `.gitignore:30:.github/workflows/    .github/workflows/ci.yml`. The CI workflow file therefore exists locally but has never been committed to the repository. `[CONFIRMED]` Whether GitHub Actions is actually running any jobs on this repo is `[UNKNOWN]` without the GitHub API.

---

## 11. Laptop state (Phase 2) `[CONFIRMED]`

### 11.1 Git state of this working tree

- Current branch: `cursor/compose-deployment-docs-db-hardening`, tracking `origin/cursor/compose-deployment-docs-db-hardening`, in sync (0 commits ahead/behind).
- `git status --short`: **clean working tree**.
- `git stash list`: empty.
- Most recent 20 commits on this branch:
  ```
  23dc00d cursor: compose-first deploy docs, DB URL handling, and stack hardening
  d989339 Retrigger dashboard build (trailing slash on COPY scripts)
  30e33f7 Redesign sidebar into 4 collapsible sections
  f33ebfc Clean up header into two-row layout
  40c8010 Move Communications to its own tab in the top nav bar
  60c83ae Fix auth redirect loop causing dashboard flickering
  83e5de1 Auto-create schema_version table if missing in Core startup
  594085a fix(edi-proxy): support dedicated EDI internal API key
  a6eb3c9 Fix PDF intake parsing for eClinicalWorks EMR records
  1c0da6c fix(edi-proxy): send internal API key to EDI upstream
  7716544 fix(ingest): prefer configured parser endpoint and extend PDF parse timeout
  235bfa1 fix(ingest): send PDF parser upload with explicit multipart payload
  0a9010a chore(edi-proxy): surface nested fetch cause details
  1471651 chore(edi-proxy): include upstream fetch error detail in 502 responses
  ec7dcb2 fix(integrations): keep EDI/Availity services bootable without creds
  4ebb151 fix(ingest): route PDF parsing through intake service in production
  0b313f2 fix(ingest): make PDF parse route build-compatible in production
  d0f9e0a fix(frontend): unblock dashboard docker builds by copying scripts before npm ci
  ee36225 fix(edi,stedi,render): production-ready Availity/Stedi wiring
  1ccf41e feat(ingest): optional Intake URL, pdf-parse fallback for live PDF ingest
  ```
- `git reflog | head`:
  ```
  23dc00d HEAD@{0}: commit: cursor: compose-first deploy docs, DB URL handling...
  d989339 HEAD@{1}: checkout: moving from main to cursor/compose-deployment-docs-db-hardening
  d989339 HEAD@{2}: commit: Retrigger dashboard build...
  30e33f7 HEAD@{3}: commit: Redesign sidebar into 4 collapsible sections
  ```

### 11.2 Other workspace clones on this laptop `[CONFIRMED]`

From the partial `find /Volumes /Users/adamstryker -maxdepth 4 -iname "*poseidon*" -type d` before the broader check job was killed:

```
/Volumes/WORKSPACE/cursor/projects/Volumes-WORKSPACE-poseidon-2
/Volumes/WORKSPACE/cursor/projects/Users-adamstryker-Library-CloudStorage-GoogleDrive-adam-stryker-gmail-com-My-Drive-1-Projects-1-OPS-Stack-2-Poseidon-OS
/Volumes/WORKSPACE/cursor/projects/Volumes-WORKSPACE-poseidon-os
/Volumes/WORKSPACE/cursor/projects/Users-adamstryker-poseidon-os
/Volumes/WORKSPACE/cursor/projects/Users-adamstryker-Library-CloudStorage-GoogleDrive-adam-stryker-gmail-com-My-Drive-1-Projects-1-OPS-Stack-2-Poseidon-OS-web-exec-dashboard
/Volumes/WORKSPACE/cursor/projects/Volumes-WORKSPACE-poseidon
/Volumes/WORKSPACE/poseidon 2
/Users/adamstryker/.cursor/projects/Volumes-WORKSPACE-poseidon-2
/Users/adamstryker/.claude/projects/-Volumes-WORKSPACE-poseidon-2
/Users/adamstryker/Desktop/poseidon
```

Several of these are Cursor/Claude project metadata paths (not full repo clones); `Desktop/poseidon` and the entries under `.../cursor/projects/...-poseidon-os` are candidates for being actual checkouts. Contents of each were not enumerated (out of time budget). Relevant because any of them may contain a differently-staged `.env` or different branch than this one.

### 11.3 Local Docker state `[CONFIRMED]`

`docker ps -a`, `docker volume ls`, `docker images | grep -iE "poseidon|core|trident|intake|availity|edi"`: all returned **empty**. The POSEIDON stack has never been built or run on this laptop in a way that left artifacts in the current Docker daemon, or Docker is installed but unused. From this laptop, there are **no POSEIDON containers, volumes, or images locally**.

### 11.4 Ancillary config files `[CONFIRMED]`

- `./vercel.json`: `{"rootDirectory": "frontend"}`
- `./frontend/vercel.json`: `{"framework":"nextjs","buildCommand":"npm run build","outputDirectory":".next","installCommand":"npm install --legacy-peer-deps","devCommand":"npm run dev"}`
- `./firebase.json`: Firebase Hosting config with `public: frontend`, SPA rewrites `**` → `/index.html`
- No `render.yaml` in the tree. **Render is not in use;** if historical services existed, they were not defined as IaC here. Prefer `poseidon-deploy.sh` / `scripts/verify_deploy_readiness.sh` and `PRODUCTION_HARDENING.md` for the current path. `[CONFIRMED]`
- `poseidon-deploy.sh` exists at the repo root (1,709 bytes, executable) and delegates to `scripts/verify_deploy_readiness.sh` per `PRODUCTION_HARDENING.md`.

---

## 12. Memory vs. reality (Phase 4) `[CONFIRMED]`

| Claimed | Actual from evidence | Verdict |
|---|---|---|
| "9 containers" | `docker-compose.yml` defines **11 services**: redis, minio, postgres, core, trident, intake, ml, edi, availity, dashboard, nginx | Wrong count. 11, not 9. |
| "edi on port 8005, availity on 8006" | `edi: PORT 8006, /health` (line 254, 291); `availity: PORT 8005, /live` (line 306, 314). `.env` line 93: `EDI_API_URL=http://edi:8006` | **Inverted.** edi=8006, availity=8005. |
| "No postgres container (Neon replaces it)" | `docker-compose.yml` lines 64–84 define a `postgres:16-alpine` service with volume `postgres_data` and init script `scripts/init.sql` | **A Postgres container is declared.** Whether the live production environment actually runs it is `[UNKNOWN]` from this vantage (see row below and §2 on the DATABASE_URL shadowing). |
| "DB is Neon in production" | `.env` line 22 has `DATABASE_URL=postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require`. Every compose service's `environment:` block forces `DATABASE_URL` back to the local postgres fallback unless `POSEIDON_DATABASE_URL` is set separately (which it is not in `.env` or `.env.template`). A historic public DNS snapshot pointed `api.` at a non-compose host; **current ops target the droplet/compose model**, not Render. | Partially supported: Neon is the stated target; live DB for production must be confirmed on the actual host (`POSEIDON_DATABASE_URL`). |
| "25+ tables" | `scripts/init.sql` declares **40 tables** in the primary schema; `services/availity/prisma/schema.prisma` declares **24 additional tables** in the same database namespace | Understated: reality is **64+** tables defined across both schemas. |
| "Nginx reverse proxy in front" | `docker-compose.yml` line 387 defines an `nginx:1.29.6-alpine` container binding `80:80`, `443:443` with config at `./nginx/nginx.conf` | Supported by the compose file. **Canonical production** uses this pattern on DO; a 2026-04-18 public DNS snapshot showed Cloudflare in front of other origins — update DNS to point to your droplet when following `STATUS.md`. |
| "MinIO on local disk" | Compose declares `minio` service with named volume `minio_data`. Where that volume actually lives is a function of the host. On this laptop there are no poseidon-related docker volumes. Whether MinIO is deployed on the **production droplet** is host-specific. | `[UNKNOWN]` without access to the live host; supported as a design in the compose file. |
| "19 payers configured in Trident" | No evidence seen in repo for a hardcoded 19-payer list. `services/trident/main.py` contains 24 routes; payer data is stored in the `payers` DB table (one of the 40 `init.sql` tables). A direct table count would require a Neon query, which is out of scope. | `[UNKNOWN]` without DB access. |
| "Frontend is Next.js on port 3000" | `frontend/package.json` → `next: ^16.2.1`, `react: ^19.2.4`. Compose `dashboard` service env `PORT: 3000`, healthcheck `/api/health`. A 2026-04-18 probe of `dashboard.strykefox.com/api/health` returned `{"status":"ok","service":"dashboard"}` with `x-powered-by: Next.js`. | Confirmed; deploy the dashboard as part of the compose stack on DO per `STATUS.md`, not on Render. |
| "EDI service uses asyncpg (others use psycopg)" | `services/edi/requirements.txt`: `asyncpg==0.29.0`. `services/core/requirements.txt` and the other three: `psycopg[binary,pool]==3.2.3`. | Confirmed. |
| "Intake has OCR" | `INTAKE_OCR_CONFIDENCE_THRESHOLD` env var is referenced in `services/intake/main.py` (line 9 per the earlier grep). `services/intake/main.py` includes `/api/v1/intake/parse-document`. However, no `pytesseract`, `tesseract`, `easyocr`, or `textract` Python imports were found in services. `pdf-parse` is present (in the availity service) and `pdf_ocr` as a string label was not found in Python. Intake PDF parsing uses `pdf-parse` (Node) or a service-side parser; dedicated image-OCR of scanned docs is not demonstrably present in code. | Partially supported: document parsing exists, classical image OCR via tesseract-family libraries does not appear to be wired in. |
| "DocuSign integration live" | `DROPBOX_SIGN_*` env vars are referenced and `services/core/main.py` has `POST /api/v1/webhooks/dropbox-sign` and `/webhooks/dropbox-sign/swo`. `DOCUSIGN_*` env vars in `.env` (lines 56–58) are blank. Grep for the `docusign` library returned `services/core/main.py` and `services/shared/base.py` only. | The signing integration is **Dropbox Sign (HelloSign)**, not DocuSign; DocuSign envs are blank. |
| "Availity SFTP credentials configured" | `.env` line 121: `AVAILITY_SFTP_PASS=` (empty). Line 120: `AVAILITY_SFTP_USER=Poseidon`. Line 96: `STEDI_API_KEY=PASTE_YOUR_STEDI_API_KEY_HERE`. Line 67–68: `AVAILITY_CLIENT_ID=`, `AVAILITY_CLIENT_SECRET=` (both empty). | **Not configured.** User is set, password/client-id/client-secret/STEDI key are blank. |
| "ISA15 is set to T (test)" | `.env` line 104: `ISA_TEST_INDICATOR=P`. `docker-compose.yml` line 270 default is also `P`. `P` indicates production in X12 ISA15, not test. | **False.** ISA_TEST_INDICATOR is set to `P` (production), not `T` (test). |
| "300+ payment records for ML training" | The `payment_outcomes` table is declared in `init.sql` and populated by routes in `services/core/main.py` (`/outcomes`) and `services/ml/main.py`. Row count requires Neon access, which is out of scope. | `[UNKNOWN]` without DB access. |

---

## 13. What cannot be known from here

Explicit list of open questions that require the surfaces this run had no access to:

1. Which `DATABASE_URL` the **live production host** (droplet/compose) reads at runtime — Neon, the bundled Compose Postgres, or something else. Needs access to that host’s env and logs (not Render; Render is not in use).
2. Whether the droplet at `157.230.145.247` is currently running any part of POSEIDON, and if so which services and with what env. Needs SSH.
3. What `nginx/1.18.0 (Ubuntu)` on the droplet is actually proxying to on port 80 (the FastAPI-shaped 404 body suggests a FastAPI app is behind it). Needs SSH or an authoritative URL that resolves there.
4. Row counts in every table, including `orders`, `patients`, `claim_submissions`, `eob_claims`, `denials`, `appeals`, `eligibility_checks`, `auth_requests`, `workflow_events`, `audit_log`, `payment_outcomes`. Needs Neon query access.
5. Whether RLS policies exist on any table, whether any table has `rowsecurity=true`. Needs Neon query access.
6. Neon plan tier (Free vs. Launch vs. Scale), PITR window, whether HIPAA is enabled on the project, whether a BAA has been executed with Neon. Needs Neon console / API.
7. DigitalOcean: whether a BAA is executed for the account, what services the account has, whether the droplet's block storage / volumes are encrypted. Needs DO console / API.
8. Cloudflare: zone plan tier (Free / Pro / Business / Enterprise), whether a BAA is executed. Needs Cloudflare dashboard.
9. (Removed — Render is not in use; use droplet/compose and DO for operational questions.)
10. MinIO: whether it is actually deployed on the production host, where its data volume lives, its bucket count, object count, total size, and SSE configuration. Needs SSH or DO access to the running host.
11. Whether GitHub Actions is configured on the `Stryke3/poseidon-os333` repo (given `ci.yml` is gitignored locally, the remote may have a different workflow). Needs GitHub API.
12. Whether any of the other local clones (`/Users/adamstryker/Desktop/poseidon`, the `cursor/projects/*-poseidon-os*` directories) contain a different `.env` with different live credentials. Needs directory-by-directory enumeration this run did not complete.
13. Whether any of the patient records in the DB are real patient data or synthetic (the `seed_neon.js` / `seed_real.js` scripts insert records shaped like real patient data — Medicare beneficiary IDs, names, DOBs, diagnosis codes — but whether those values were rewritten from actual CSVs or generated is not determinable from the seed script alone). Needs a comparison between the committed seed data and a source-of-truth dataset.

---

## 14. Final paragraph — plain prose, ~150 words

Given only what is accessible from this laptop, POSEIDON is a Docker-Compose-defined stack of eleven services (Postgres, Redis, MinIO, five FastAPI services in Python, a Node/Express Availity service with its own Prisma schema, a Next.js 16 dashboard, and nginx) whose schema spans roughly sixty-four tables across two parallel migration systems. **Production target is the DigitalOcean + compose + nginx model** in `STATUS.md` — **not Render.** A 2026-04-18 public snapshot (section 9) saw mixed health across `*.strykefox.com` and a droplet at `157.230.145.247` reachable on port 80; that snapshot is not a substitute for current cutover state. The largest follow-ups are: which `DATABASE_URL` the live droplet uses, what is actually running there after DNS/ops changes, and rotating any credentials that have appeared in history (e.g. Neon, Git `origin` URLs with embedded tokens).
