# POSEIDON Status

Last updated: 2026-04-10

## Current state (backend)

- Core exposes **`GET /worklist/protocols`** for outstanding-order protocol classification (implemented in `services/core/main.py`). Records include patient/payer, status, next action, days in stage, appeal deadline when present, predicted payment/window, and estimated collection probability.
- **`GET /worklist/protocols` requires authentication** (Bearer / session); unauthenticated calls return `{"error":"Not authenticated"}`.

## Current state (frontend)

- Dashboard is **Next.js App Router** under `frontend/src/app/` (e.g. `page.tsx` → `DashboardShell`).
- Live data is loaded server-side in **`frontend/src/lib/dashboard-data.ts`** via **`getLiveDashboardData()`**: authenticated fetches to Core **`/orders`** and **`/denials`** (plus communications/integrations with graceful fallback). No sample-data fallback when the API returns successfully with empty lists—empty DB → empty kanban and zeroed pipeline counts. Hard failures on the orders request (non-401/403) surface as errors (no silent sample deck).
- Client ingest: **`frontend/src/components/ingest/LiveIngestDropzone.tsx`** posts to **`/api/ingest/live`** for CSV → Core import.

## Stack verification (this workspace)

- **Canonical runtime:** **Docker Compose** at repo root (`docker-compose.yml`): Postgres, Redis, MinIO, Python services, Node dashboard, nginx.
- **`DATABASE_URL`**, **`REDIS_URL`**, **`NEXTAUTH_SECRET`**, and other secrets are supplied via **`.env`** (from `.env.template`); Compose wires service DNS names (`postgres`, `core`, `redis`, etc.).
- `scripts/verify_deploy_readiness.sh` validates the **Next.js production build**, Python `compileall`, **pinned container images**, and **`docker compose config`**.

## Spreadsheet assets present in repo

- `services/trident/Historical_Model_Data/` (AR reports, L-code detail xlsx, sample CSVs under `mybox-selected/`).

## LVCO ingest

- **Convention:** create **`data/lvco/`** locally and drop spreadsheets there (see **`docs/DATA_INGEST.md`**). Contents under `data/` are gitignored.
- **Still needed:** actual LVCO files on disk (or a symlink to their folder) before ingest can run.

## Not yet verified here

- Row-level SQL validation against production-like data volumes.
- External integrations (Availity, Stedi, Dropbox Sign, SMTP) with real credentials.
- Authenticated exercise of **`GET /worklist/protocols`** against a populated DB (endpoint behavior confirmed for auth gate only from CLI).

## Next actions

1. Populate **`data/lvco/`** (or supply absolute path) and run ingest into orders/denials.
2. Call **`GET /worklist/protocols`** with a valid token and confirm queue contents.
3. Keep **`.env`** aligned with wherever Postgres actually runs (Compose default vs external URL + `sslmode=require`).
