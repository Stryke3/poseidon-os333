# POSEIDON — Production hardening

**Canonical production:** self-hosted **Docker Compose** on a server or VM ([docker-compose.yml](docker-compose.yml)), with **nginx** as the HTTPS front door and the **Next.js dashboard** served from the `dashboard` service (or built into that image). See [README.md](README.md) for architecture and ports.

Optional: host only the **dashboard** on Vercel or another static/edge host while APIs run on your box — see [Optional: edge-hosted dashboard](#optional-edge-hosted-dashboard) below.

Run preflight before any release:

```bash
bash poseidon-deploy.sh
```

That runs `scripts/verify_deploy_readiness.sh` and reminds you how to bring the stack up.

---

## 1 — Readiness, backups, migrations

Before go-live or cutover:

```bash
bash scripts/verify_deploy_readiness.sh --strict-env
bash scripts/backup_postgres.sh
bash scripts/backup_stateful_storage.sh
```

Apply production schema migrations (adjust if your runbook differs):

```bash
bash scripts/run_production_migrations.sh
```

After migrations, rebuild or restart affected services, e.g.:

```bash
docker compose up -d --build
```

---

## 2 — Self-hosted Compose (primary path)

1. Copy [.env.template](.env.template) to `.env` at the **repo root** and fill real secrets. Never commit `.env`.
2. On the target host:

   ```bash
   bash scripts/docker-up.sh
   # or: docker compose up -d --build
   ```

3. Verify:

   - `docker compose ps`
   - `curl -fsS http://127.0.0.1:8001/ready` (Core — JSON should show `checks.database`, `checks.redis`, etc. as `ok` when wired correctly)
   - Open the dashboard via nginx (e.g. `http://localhost/` locally, or your public hostname with TLS terminated at nginx or a reverse proxy).

4. Keep backend URLs consistent with where services actually listen:

   - Root `.env`: `POSEIDON_DATABASE_URL` or `DATABASE_URL`, `REDIS_URL`, `INTERNAL_API_KEY`, MinIO vars, Core/JWT secrets, etc.
   - Dashboard container env: `POSEIDON_API_URL` / `CORE_API_URL` must point at the **Core** base URL as seen from that container (typically `http://core:8001` inside Compose).

Credential notes:

- Treat `CORE_API_EMAIL` / `CORE_API_PASSWORD` as **automation** credentials for ingest and service workflows.
- Do not publish fixed human login passwords in runbooks. Operator accounts should be managed in your environment and rotated without doc edits.

---

## 3 — Security headers and Next.js config

Security headers are defined in [frontend/next.config.js](frontend/next.config.js). They apply to any production build of the dashboard (Compose image or optional Vercel deploy).

[frontend/vercel.json](frontend/vercel.json) is for **optional** Vercel rewrites (e.g. `/api/*` → Core). On Compose + nginx, routing is usually defined in [nginx/nginx.conf](nginx/nginx.conf).

---

## 4 — Backup and restore discipline

PostgreSQL before cutover, migrations, or bulk import:

```bash
bash scripts/backup_postgres.sh
bash scripts/restore_postgres.sh backups/postgres/<file>.dump
```

Stateful platform snapshot (MinIO, Redis persistence, Trident artifacts, etc.):

```bash
bash scripts/backup_stateful_storage.sh
bash scripts/restore_stateful_storage.sh backups/stateful/<timestamp>
```

---

## 5 — Ongoing redeploy

```bash
bash poseidon-deploy.sh
```

Preferred flow:

1. `bash scripts/verify_deploy_readiness.sh` (add `--strict-env` when enforcing production gates).
2. `docker compose up -d --build` on the target host with a real `.env`.
3. Local dev: `frontend/.env.local` with `CORE_API_URL=http://127.0.0.1:8001` when Core is in Compose with ports published.

---

## Optional: edge-hosted dashboard

Use this only if you intentionally split **dashboard** (Vercel / edge) from **APIs** (your Compose host or public API URLs).

The deployable Next app still lives under **`frontend/`**. Linking, env vars, builds, and logs target that directory.

### Link and deploy (Vercel CLI)

```bash
cd frontend
vercel link
vercel --prod
```

If `frontend/.vercel/project.json` already exists, the project is linked.

### Custom domain (example)

```bash
cd frontend
vercel domains add poseidon.strykefoxmedical.com
vercel domains inspect poseidon.strykefoxmedical.com
```

Example DNS (subdomain):

| Type  | Name   | Value               | TTL  |
| ----- | ------ | ------------------- | ---- |
| CNAME | poseidon | cname.vercel-dns.com | Auto |

Verify:

```bash
dig poseidon.strykefoxmedical.com CNAME +short
```

### Environment variables (Vercel)

```bash
cd frontend
vercel env add NEXT_PUBLIC_APP_URL production
# e.g. https://poseidon.strykefoxmedical.com

vercel env add NEXT_PUBLIC_APP_ENV production
# production

vercel env add NEXT_PUBLIC_CORE_API_URL production
# e.g. https://api.strykefox.com

vercel env add NEXT_PUBLIC_TRIDENT_API_URL production
# e.g. https://trident.strykefox.com

# If Availity is proxied behind your nginx path on another host:
# vercel env add NEXT_PUBLIC_AVAILITY_SERVICE_URL production
# e.g. https://dashboard.example.com/availity-api
```

Redeploy after env changes:

```bash
cd frontend
vercel --prod --yes
```

### Full self-hosted secret checklist (Compose `.env`)

Complete root `.env` for services whether or not the dashboard is on Vercel, including where applicable:

- `SECRET_KEY`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
- `CORE_API_EMAIL`, `CORE_API_PASSWORD`
- `AVAILITY_CLIENT_ID`, `AVAILITY_CLIENT_SECRET`, `AVAILITY_TOKEN_URL`, `AVAILITY_ELIGIBILITY_URL`, `AVAILITY_CLAIMS_URL`, `AVAILITY_DEFAULT_PROVIDER_NPI`, `AVAILITY_BILLING_TIN`
- `DROPBOX_SIGN_*`, `GMAIL_OAUTH_*` if used

### Manual checks (any dashboard host)

- HTTPS without redirect loops; security headers present (`curl -I https://your-dashboard-host`)
- No critical console errors; styles load
- `/api/*` and other BFF routes resolve (Compose via nginx; Vercel via `vercel.json` rewrites)

---

## Troubleshooting

**Compose / Core**

- `curl http://127.0.0.1:8001/ready` — fix `DATABASE_URL` / `REDIS_URL` / MinIO until checks are `ok`.
- `docker compose logs core`, `docker compose logs dashboard`, `docker compose logs nginx`.

**Vercel-only (edge dashboard)**

- 404 or wrong domain: `cd frontend && vercel ls` and `vercel alias set <deployment-url> <your-domain>`.
- Wrong env: `vercel env ls`, remove/re-add, then `vercel --prod --yes`.
- Build fails locally: `cd frontend && NODE_ENV=production npm run build`.

**DNS**

```bash
dig your-dashboard-host.example.com
nslookup your-dashboard-host.example.com
```
