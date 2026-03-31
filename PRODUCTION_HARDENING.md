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

# If the dashboard is on Vercel but Availity runs behind your nginx path proxy, point the browser at that path:
vercel env add NEXT_PUBLIC_AVAILITY_SERVICE_URL production
# value: https://dashboard.strykefox.com/availity-api
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

Credential guidance:

- Treat `CORE_API_EMAIL` / `CORE_API_PASSWORD` as automation credentials for ingest and service workflows.
- Do not publish fixed human login passwords in deployment prompts or runbooks. Production operator credentials should be managed separately and rotated without requiring doc edits.
- If an older prompt still references `admin@strykefox.com` with a static password, consider that guidance stale until the live environment is revalidated.

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

## Step 6 - Render Alignment

Production is GitHub + Render first.

- Keep [render.yaml](/Volumes/WORKSPACE/poseidon%202/render.yaml) as the canonical deployment definition.
- Keep backend `DATABASE_URL` values in Render service settings, since they are intentionally marked `sync: false` in the blueprint.
- Use Render service health, logs, and deploy history for runtime verification instead of older local Docker assumptions.

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

After migrations, trigger or confirm fresh deploys for the affected Render services instead of relying on a full local Compose restart.

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

Preferred production flow:

- targets `frontend/` as the deploy root
- validates the repo before shipping
- runs `scripts/verify_deploy_readiness.sh` before shipping
- validates the Next.js production build
- requires an explicit `frontend/.env.local`
- deploys from the already linked frontend project when available
- uses the webpack production build path on Next.js 16 for deterministic CI and local verification
- leaves backend runtime ownership to Render instead of trying to rebuild a local Docker production clone

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
