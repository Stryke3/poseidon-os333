# POSEIDON — Operations Status (single-page ops map)

**Audience:** on-call operator / platform engineer during an incident.
**Goal:** find the right log, the right endpoint, and the right runbook in <2 minutes.

Canonical production runtime: **DigitalOcean droplet + `docker compose` + nginx**.

---

## 1. Service endpoints

Internal ports (only nginx is internet-facing; services bind to loopback on the droplet):

| Service | Container | Port | Health endpoint | Docker Compose name |
|---|---|---|---|---|
| nginx | `poseidon_nginx` | 80, 443 | `GET /healthz` | `nginx` |
| Core API | `poseidon_core` | 8001 | `GET /ready` | `core` |
| Trident | `poseidon_trident` | 8002 | `GET /ready` | `trident` |
| Intake | `poseidon_intake` | 8003 | `GET /ready` | `intake` |
| ML | `poseidon_ml` | 8004 | `GET /ready` | `ml` |
| Availity (Node) | `poseidon_availity` | 8005 | `GET /live` | `availity` |
| EDI | `poseidon_edi` | 8006 | `GET /health` | `edi` |
| Dashboard (Next.js) | `poseidon_dashboard` | 3000 | `GET /api/health` | `dashboard` |
| Postgres | `poseidon_postgres` | 5432 | `pg_isready` | `postgres` |
| Redis | `poseidon_redis` | 6379 | `redis-cli ping` | `redis` |
| MinIO | `poseidon_minio` | 9000 | `GET /minio/health/live` | `minio` |

Public DNS (after cutover):

- `https://dashboard.strykefox.com/` → `dashboard:3000` via nginx.
- `https://api.strykefox.com/` → `core:8001` via nginx.
- `https://trident.strykefox.com/` → `trident:8002` via nginx.
- `https://intake.strykefox.com/` → `intake:8003` via nginx.
- `https://ml.strykefox.com/` → `ml:8004` via nginx.
- `https://edi.strykefox.com/` → `edi:8006` via nginx.

All other hosts and CNAMEs are enforced by `scripts/audit_no_render_pointers.sh`.

---

## 2. Health state meanings

`GET /ready` on each Python service returns:

```json
{"status": "ready|degraded", "service": "...", "checks": {"database": "ok|error|not_configured", "redis": "ok|error|not_configured", "minio": "ok|error|not_configured"}}
```

| Status | Meaning | First action |
|---|---|---|
| `ready` | all deps ok | — |
| `degraded` + `database=error` | service cannot reach Postgres | `docker compose logs postgres | tail -n 100`; verify `POSEIDON_DATABASE_URL` matches the DB; check Neon plan state |
| `degraded` + `redis=error` | service cannot reach Redis | `docker compose logs redis`; verify `REDIS_PASSWORD` matches `REDIS_URL` |
| `degraded` + `minio=error` | MinIO unreachable | `docker compose logs minio`; verify `MINIO_ENDPOINT` |
| 503 from nginx with body `{"detail":"Not Found"}` | service not listening | `docker compose ps`; service may be unhealthy — `docker compose restart <service>` |
| Cutover script step `FAIL: probe …` | health probe timed out | inspect `docker compose logs <service>` |

---

## 3. Where to look when intake fails

| Symptom | First log | Second log | Runbook |
|---|---|---|---|
| A batch CSV ingest produced no rows | Core logs `docker compose logs core` filtered on `orders_import` | Check `intake_review_queue` for rows with `reason_code='missing_fields'` or `'parse_failed'` | `docs/DATA_INGEST.md` |
| A fax landed but no patient was created | Core logs filtered on `fax_inbound` | `intake_review_queue` with `source='fax'` and `reason_code='low_ocr_confidence'` | `docs/MANUAL.md` §18 Fax System |
| Email intake stopped polling | Intake logs `docker compose logs intake` filtered on `email-intake` | `intake_review_queue` with `source='email'` | `docs/SECRET_ROTATION_RUNBOOK.md` §2.6 |
| PDF parse returns `501` or `400` | Intake logs filtered on `parse-document` | Frontend BFF logs | `intake_pipeline_audit.evaluate_parse_confidence` |
| Public inquiry form 403 | Core logs filtered on `public-inquiry` | Check `PUBLIC_INQUIRY_ALLOWED_ORIGINS` includes the submitter origin | — |

**Canonical intake pipeline** (what must happen):
1. source lands → `INSERT workflow_events intake_received`
2. parse runs → `audit_log action='intake_parsed'` on success, `'intake_parse_failed'` on failure
3. `evaluate_parse_confidence` gates:
   - pass → create/update patient + order, `audit_log action='create' resource='patients'/'orders'`
   - fail → insert into `intake_review_queue`, `audit_log action='intake_review_queued'`
4. no silent drops

**Query to inspect the review queue right now:**
```sql
SELECT id, source, reason_code, parse_confidence, missing_fields, created_at
FROM intake_review_queue
WHERE org_id = '00000000-0000-0000-0000-000000000001'
  AND status = 'pending'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 4. Where to look when Trident learning fails

| Symptom | First log | Second log | Runbook |
|---|---|---|---|
| Bootstrap run sticks on `running` | `trident_history_bootstrap_runs` — look for the newest row in that state | Trident logs `docker compose logs trident` | `scripts/bootstrap_trident_from_history.py` |
| Scoring returns `learned_adjustment = 0` and `features_used = []` for every payer | `trident_learned_aggregates_current` view has zero rows → bootstrap never ran | Confirm migration 018 applied: `SELECT * FROM schema_version;` should be `>= 18` | `docs/SCHEMA_OWNERSHIP.md` |
| Continuous-learning refresh never runs | `redis-cli -a "$REDIS_PASSWORD" GET "trident:learning:last_started_at"` | Confirm `TRIDENT_LEARNING_MODE=continuous` in `.env` | — |
| New `payment_outcomes` not reflected | Call `POST /api/v1/trident/learning-sync` with admin token | `learned_rates.last_updated` timestamp is latest | — |
| Auto-retrain never triggers | `MIN_TRAINING_RECORDS` threshold not reached yet | Read `POST /api/v1/trident/forecast` which confirms fallback-to-baseline | — |

**Query to inspect the most recent bootstrap run:**
```sql
SELECT run_id, status, records_written, started_at, completed_at, error_detail
FROM trident_history_bootstrap_runs
ORDER BY started_at DESC
LIMIT 5;
```

**Confirm scoring is using learned data for a specific (payer, hcpcs):**
```sql
SELECT feature_scope, payer_id, hcpcs_code, sample_count, denial_rate, avg_paid, collection_probability
FROM trident_learned_aggregates_current
WHERE payer_id = 'MEDICARE_DMERC' AND hcpcs_code = 'L1833';
```

---

## 5. Where to look when patient creation fails

| Symptom | First log | Second log | Runbook |
|---|---|---|---|
| `POST /patients` returns 500 | Core logs filtered on `patients` + request_id from `X-Request-ID` response header | `audit_log` last 15 minutes for `action='create' resource='patients'` | — |
| Duplicate-detection seems broken | Inspect `patients.intake_fingerprint` and `orders.source_fingerprint` | See migration 017 for the idempotency model | — |
| NextAuth session rejects login | `docker compose logs dashboard` filtered on `nextauth` | Confirm `NEXTAUTH_SECRET` and `NEXTAUTH_URL` match the browser URL | — |

---

## 6. Quick command palette

```bash
# Full cutover / redeploy on the droplet
cd /opt/poseidon && git pull
bash scripts/do_prod_cutover_do_only.sh

# Inspect a specific service
docker compose logs -f core            # or trident, intake, ml, edi, availity, dashboard, nginx
docker compose ps
docker compose restart core

# Health probe each service from the droplet
curl -fsS -H "Host: api.strykefox.com" http://127.0.0.1:8001/ready | jq
curl -fsS -H "Host: trident.strykefox.com" http://127.0.0.1:8002/ready | jq
curl -fsS -H "Host: intake.strykefox.com" http://127.0.0.1:8003/ready | jq
curl -fsS -H "Host: ml.strykefox.com" http://127.0.0.1:8004/ready | jq
curl -fsS http://127.0.0.1:8005/live | jq
curl -fsS http://127.0.0.1:8006/health | jq
curl -fsS http://127.0.0.1/healthz

# Trident history bootstrap (CLI)
POSEIDON_DATABASE_URL=$POSEIDON_DATABASE_URL \
  python3 scripts/bootstrap_trident_from_history.py --dry-run
python3 scripts/bootstrap_trident_from_history.py --triggered-by "$(whoami)"

# Backups
bash scripts/backup_postgres.sh
bash scripts/backup_stateful_storage.sh
```

---

## 7. Recent incidents

| Date | Summary | Resolution | Runbook used |
|---|---|---|---|
| 2026-04-18 | Hardening sprint executed | Compose-only prod; Render references removed; secrets rotation runbook published | `PLAN.md`, `PRODUCTION_HARDENING.md` |

When you resolve an incident, append a row. Keep this honest — if something still hurts, mark it so the next on-call has the context.
