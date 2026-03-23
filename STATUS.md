# POSEIDON Status

Last updated: 2026-03-22

## Current state (backend)

- Core exposes **`GET /worklist/protocols`** for outstanding-order protocol classification (implemented in `services/core/main.py`). Records include patient/payer, status, next action, days in stage, appeal deadline when present, predicted payment/window, and estimated collection probability.
- **`GET /worklist/protocols` requires authentication** (Bearer / session); unauthenticated calls return `{"error":"Not authenticated"}`.

## Current state (frontend)

- Dashboard is **Next.js App Router** under `frontend/src/app/` (e.g. `page.tsx` → `DashboardShell`).
- Live data is loaded server-side in **`frontend/src/lib/dashboard-data.ts`** via **`getLiveDashboardData()`**: authenticated fetches to Core **`/orders`** and **`/denials`** (plus communications/integrations with graceful fallback). No sample-data fallback when the API returns successfully with empty lists—empty DB → empty kanban and zeroed pipeline counts. Hard failures on the orders request (non-401/403) surface as errors (no silent sample deck).
- Client ingest: **`frontend/src/components/ingest/LiveIngestDropzone.tsx`** posts to **`/api/ingest/live`** for CSV → Core import.
- Production frontend deploy verified on **March 22, 2026** to `https://dashboard.strykefox.com`, including `/login`, `/api/health`, protected session issuance, and authenticated admin API access.
- Historical prompt credentials for `admin@strykefox.com` are no longer reliable documentation for production login. The live environment is using environment-managed accounts, and the verified production session path currently authenticates through the configured service account flow.

## Stack verification (this workspace)

- **`docker compose ps`**: postgres, redis, minio, core, trident, intake, ml, dashboard, nginx reported **up** with healthy checks where defined (snapshot 2026-03-21).
- **Through nginx (`http://localhost`)**: **`/api/health`** and **`/api/ready`** return OK for Core; use **`/trident-api/...`**, **`/intake-api/...`**, **`/ml-api/...`** for sibling services (see `nginx/nginx.conf`). Compose **does not publish 8001–8004 on the host** by default—use these paths or `docker compose exec <service> curl ...`.
- **`scripts/verify_deploy_readiness.sh`** no longer requires **`rg`**; it uses **`grep`** if ripgrep is missing.

## Spreadsheet assets present in repo

- `services/trident/Historical_Model_Data/` (AR reports, L-code detail xlsx, sample CSVs under `mybox-selected/`).

## LVCO ingest

- **Convention:** create **`data/lvco/`** locally and drop spreadsheets there (see **`docs/DATA_INGEST.md`**). Contents under `data/` are gitignored.
- **Still needed:** actual LVCO files on disk (or a symlink to their folder) before ingest can run.

## Not yet verified here

- Row-level SQL validation against production-like data volumes.
- External integrations (Availity, Stedi, Dropbox Sign, SMTP) with real credentials.
- Authenticated exercise of **`GET /worklist/protocols`** against a populated DB (endpoint behavior confirmed for auth gate only from CLI).
- Canonical human operator credentials and password-reset runbook have not yet been rewritten into a single definitive admin-facing document.

## Next actions

1. Populate **`data/lvco/`** (or supply absolute path) and run ingest into orders/denials.
2. Call **`GET /worklist/protocols`** with a valid token and confirm queue contents.
3. Publish a single production runbook for operator login and password rotation so prompts and docs stop drifting from live credentials.
