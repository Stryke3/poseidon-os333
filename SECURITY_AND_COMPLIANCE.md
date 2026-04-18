# POSEIDON — Security, Compliance & Performance

Focused on **compliance**, **security**, and **speed** in production.
This document reflects the current repository state plus the minimum hardening still required before handling production healthcare workloads.

---

## Compliance (HIPAA / healthcare)

### In place

- **PHI in logs**: `PHI_IN_LOGS` (default `false`) — keep it false. Application logs use IDs and org only; do not log patient names, DOB, or full identifiers in log messages.
- **Audit trail**: `audit_log` table records who did what and when (no PHI in the log):
  - **Logged**: login, user create, patient create, order create, denial create, payment outcome create.
  - **Fields**: org_id, user_id, action, resource, resource_id, ip_address, created_at.
- **Access control**: Role-based (admin, billing, intake, rep, executive); JWT with expiry; org-scoped data so tenants only see their own records.
- **Password storage**: Bcrypt (cost 12) for new and updated passwords; legacy SHA256 hashes are opportunistically upgraded to bcrypt on successful login.

### You should

- Use **TLS in production** (see Security below).
- Enforce **BAs with any Business Associate** (e.g. Availity, hosting provider) if you are a Covered Entity or BA.
- Define **retention** for `audit_log` and other tables; archive or purge per policy.
- Keep **SECRET_KEY**, DB, and Redis credentials in a secrets manager or secure env; never commit them.

---

## Security

### In place

- **Passwords**: Bcrypt, with successful legacy SHA256 logins automatically rehashed to bcrypt.
- **API**: JWT bearer auth; no session storage of passwords; docs disabled in production (`/docs` only when `ENVIRONMENT != production`).
- **Errors**: No stack traces are returned to the client. Production responses now return a generic marker instead of raw exception text.
- **CORS**: Controlled by `CORS_ALLOW_ORIGINS`; defaults to production dashboard plus localhost origins.
- **Host validation**: Controlled by `TRUSTED_HOSTS` and enforced in FastAPI middleware.
- **Headers** (nginx): `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`.
- **Rate limiting** (nginx): 60 req/min baseline for API traffic, with per-route bursts configured in nginx; 10 req/min (burst 5) for upload traffic.
- **Secrets**: From environment (`.env`); production startup now rejects placeholder secrets for backend services and `NEXTAUTH_SECRET` is required for dashboard production auth.
- **Readiness checks**: `/ready` now validates DB and Redis connectivity before marking services healthy.
- **Environment validation**: `scripts/validate_production_env.sh` enforces required production secrets, HTTPS NextAuth config, and PHI logging settings before cutover.
- **Database recovery**: `scripts/backup_postgres.sh` and `scripts/restore_postgres.sh` provide a basic PostgreSQL backup and restore path for release safety.
- **Stateful-service recovery**: `scripts/backup_stateful_storage.sh` and `scripts/restore_stateful_storage.sh` capture and restore MinIO data, Redis persistence, and Trident model artifacts.
- **Public inquiry controls**: The public inquiry endpoint now enforces origin allowlisting and basic per-IP rate limiting; it still needs stronger anti-spam measures such as CAPTCHA for internet-facing use.
- **Public inquiry validation**: Submissions now reject populated honeypot fields, malformed emails and phone numbers, and suspicious link-heavy content.
- **Live ingest auditability**: Production live ingest now requires the signed-in operator session rather than silently falling back to a shared service account.
- **Service-to-service protection**: Intake-triggered Core import and workflow-advance routes now require `X-Internal-API-Key` in addition to the authenticated bearer token.

### You must do for production

1. **TLS everywhere**
   - Terminate HTTPS at nginx. In `nginx/nginx.conf` uncomment the `listen 443 ssl http2` block and set:
     - `ssl_certificate` / `ssl_certificate_key` (e.g. Let’s Encrypt).
   - Uncomment `Strict-Transport-Security`.
   - Add a port-80 server that redirects to `https://`.
   - Keep container health checks on a dedicated local endpoint such as `/healthz` so redirects do not interfere with readiness reporting.

2. **Strong secrets**
   - `SECRET_KEY`: e.g. `openssl rand -hex 32`.
   - `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY`: unique, long, random.
   - Rotate Availity and other API credentials per policy.
   - Replace every `.env.template` placeholder such as `change_me` before deployment.

3. **Network**
   - Backend services (Postgres, Redis, MinIO, app containers) only on internal network; only nginx exposed on 80/443 (or your load balancer).

4. **Updates**
   - Keep base images and dependencies (Python, Node, nginx, Postgres, Redis) patched.

5. **Release gating**
   - Run `bash scripts/verify_deploy_readiness.sh --strict-env` before every production cutover.
   - Run `bash scripts/backup_postgres.sh` before migrations, bulk imports, or cutover.
   - Keep CI green so frontend builds, Python syntax checks, and `docker compose config` validation stay green before merge.

---

## Speed (performance)

### In place

- **DB**: Connection pooling (configurable size + overflow); indexed lookups (org_id, status, created_at, etc.).
- **APIs**: Async I/O (FastAPI/uvicorn); no blocking calls in request path.
- **Transport**: Gzip for JSON and text in nginx; `X-Response-Time-Ms` header for latency visibility.
- **Uploads**: `client_max_body_size 50M`; upload rate limit to protect the server.

### Tuning if needed

- **DB**: Increase `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` under load; add indexes for new hot queries.
- **Redis**: Use for caching (e.g. KPI or heavy reads) if you add cache layers.
- **Workers**: Increase uvicorn `--workers` per service on multi-core hosts.
- **Nginx**: Adjust `worker_connections`, `keepalive_timeout`, and upstream timeouts if you have long-running or high-concurrency traffic.

---

## Quick checklist (production)

- [ ] TLS on nginx; HSTS header on.
- [ ] All secrets from env; no `change_me` or defaults.
- [ ] `PHI_IN_LOGS=false`; no PHI in log content.
- [ ] Client error responses do not expose raw exception text.
- [ ] Audit log retention and access defined.
- [ ] Backend not exposed to internet; only nginx (or LB) public.
- [ ] BAs and integrations documented and under agreement where required.
- [ ] Tested PostgreSQL backup and restore procedure.
- [ ] Tested stateful-storage backup and restore procedure.
