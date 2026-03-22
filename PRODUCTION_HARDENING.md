# POSEIDON OS - PRODUCTION HARDENING

Run these steps after a successful `bash poseidon-deploy.sh`.

## Deploy Root

The production web app lives in `frontend/`.
All Vercel linking, env vars, builds, and logs should target that directory.

## Step 1 - Link And Deploy The Correct App

Before any release, run the repo-level readiness check:

```bash
bash scripts/verify_deploy_readiness.sh --strict-env
bash scripts/backup_postgres.sh
bash scripts/backup_stateful_storage.sh
```

```bash
cd frontend
vercel link
vercel --prod
```

If `frontend/.vercel/project.json` already exists, the app is already linked.

## Step 2 - Custom Domain

Add your production domain to the linked Vercel project:

```bash
cd frontend
vercel domains add poseidon.strykefoxmedical.com
vercel domains inspect poseidon.strykefoxmedical.com
```

DNS records:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | poseidon | cname.vercel-dns.com | Auto |

If you use the apex/root domain instead of a subdomain:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | @ | 76.76.21.21 | Auto |

Verify propagation:

```bash
dig poseidon.strykefoxmedical.com CNAME +short
```

## Step 3 - Production Environment Variables

Add production variables against the `frontend/` Vercel project:

```bash
cd frontend
vercel env add NEXT_PUBLIC_APP_URL production
# value: https://poseidon.strykefoxmedical.com

vercel env add NEXT_PUBLIC_APP_ENV production
# value: production
```

If you want the frontend to call the hosted APIs directly on Vercel, also add:

```bash
cd frontend
vercel env add NEXT_PUBLIC_CORE_API_URL production
# value: https://api.strykefox.com

vercel env add NEXT_PUBLIC_TRIDENT_API_URL production
# value: https://trident.strykefox.com
```

Redeploy after changing env vars:

```bash
cd frontend
vercel --prod --yes
```

For the self-hosted services in this repo, complete `/.env` before go-live:

- `SECRET_KEY`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `CORE_API_EMAIL`
- `CORE_API_PASSWORD`
- `AVAILITY_CLIENT_ID`
- `AVAILITY_CLIENT_SECRET`
- `AVAILITY_TOKEN_URL`
- `AVAILITY_ELIGIBILITY_URL`
- `AVAILITY_CLAIMS_URL`
- `AVAILITY_DEFAULT_PROVIDER_NPI`
- `AVAILITY_BILLING_TIN`
- `DROPBOX_SIGN_REQUEST_URL`
- `DROPBOX_SIGN_API_KEY`
- `DROPBOX_SIGN_WEBHOOK_SECRET`
- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REFRESH_TOKEN`

## Step 4 - Security Hardening

Security headers are now defined in [frontend/next.config.js](/Volumes/WORKSPACE/poseidon%202/frontend/next.config.js).

Current hardening includes:

- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Content-Security-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`
- `Origin-Agent-Cluster`

The Vercel routing file at [frontend/vercel.json](/Volumes/WORKSPACE/poseidon%202/frontend/vercel.json) was also updated so Next.js handles app routing while API-prefixed paths can still proxy to the hosted backend services.

## Step 5 - Production Verification

```bash
cd frontend
vercel ls
vercel inspect <deployment-url>
vercel logs <deployment-url>
```

Manual checks:

- Page loads over HTTPS without redirect loops
- Security headers are present in the response
- No browser console errors
- Fonts render correctly
- Dark background styles load immediately
- `/api/*` resolves to Core
- `/trident-api/*`, `/intake-api/*`, and `/ml-api/*` resolve correctly if used

Header check example:

```bash
curl -I https://poseidon.strykefoxmedical.com
```

## Step 6 - Docker Stack Alignment

For the self-hosted stack in this repo:

- Dashboard container now runs Next.js on port `3000`
- Main nginx proxy now forwards dashboard traffic to `poseidon_dashboard:3000`
- nginx health checks should target `/healthz` so a future HTTP→HTTPS redirect does not break container health reporting

Relevant files:

- [frontend/Dockerfile](/Volumes/WORKSPACE/poseidon%202/frontend/Dockerfile)
- [nginx/nginx.conf](/Volumes/WORKSPACE/poseidon%202/nginx/nginx.conf)

If you deploy with Docker instead of Vercel:

```bash
docker compose build dashboard nginx
docker compose up -d dashboard nginx
```

## Step 6.5 - Database Migrations

Run all production schema migrations before or during cutover:

```bash
bash scripts/run_production_migrations.sh
```

That helper applies:

- `001_add_pod_document_id.sql`
- `002_email_workflow_assignment.sql`
- `003_workflow_automation.sql`
- `004_fulfillment_billing_workflow.sql`

Full stack restart after migrations:

```bash
docker compose up -d --build postgres redis minio core trident intake ml dashboard nginx
```

## Step 6.75 - Backup And Restore Discipline

Take a PostgreSQL backup before cutover, before migrations, and before any bulk import:

```bash
bash scripts/backup_postgres.sh
```

To restore a captured dump:

```bash
bash scripts/restore_postgres.sh backups/postgres/<file>.dump
```

Capture the rest of the platform state too before major changes:

```bash
bash scripts/backup_stateful_storage.sh
```

That snapshot includes:

- MinIO object data
- Redis persistence data
- Trident model artifacts

To restore one of those snapshots:

```bash
bash scripts/restore_stateful_storage.sh backups/stateful/<timestamp>
```

## Step 7 - Ongoing Redeploy

Use the root deploy script:

```bash
bash poseidon-deploy.sh
```

That script now:

- targets `frontend/` as the deploy root
- refuses to deploy with missing or placeholder frontend env values
- runs `scripts/verify_deploy_readiness.sh` before shipping
- validates the Next.js production build
- requires an explicit `frontend/.env.local`
- deploys from the already linked Vercel project when available
- uses the webpack production build path on Next.js 16 for deterministic CI and local verification

## Troubleshooting

If the site 404s on Vercel:

```bash
cd frontend
vercel ls
vercel alias set <deployment-url> poseidon.strykefoxmedical.com
```

If env vars are wrong:

```bash
cd frontend
vercel env ls
vercel env rm VARIABLE_NAME production
vercel env add VARIABLE_NAME production
vercel --prod --yes
```

If local works but Vercel build fails:

```bash
cd frontend
NODE_ENV=production npm run build
```

If the domain does not resolve:

```bash
dig poseidon.strykefoxmedical.com
nslookup poseidon.strykefoxmedical.com
```
