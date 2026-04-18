# Data drop folders

The `data/` tree is **gitignored** (`data/*` in `.gitignore`) so PHI and local drops never land in git. Create these directories on each machine that runs the stack.

## Standard layout

| Path | Use |
|------|-----|
| `data/eobs/` | EOB PDFs, 835 / EDI |
| `data/denials/` | Denial CSV / spreadsheet exports |
| `data/appeals/` | Appeal documents |
| `data/spreadsheets/` | Open claims, batch intake CSVs |
| `data/lvco/` | **LVCO (or similar client) spreadsheets** — drop the latest exports here, then run your ingest path (API or dashboard upload) against these files |
| `data/processed/` | Archive / post-processing (optional) |

## LVCO

There is no magic filename; the blocker is **having files on disk**. Create `data/lvco/`, copy the spreadsheets in, and point ingestion at that folder (or upload via the dashboard intake flow). If files live outside the repo, symlink `data/lvco` to that path or document the absolute path in your runbook.

### One-command ingest (CLI)

From the repo root (after `.env` has real `INTERNAL_API_KEY` and ingest credentials):

```bash
bash scripts/ingest_lvco.sh --dry-run    # parse only
bash scripts/ingest_lvco.sh              # POST /orders/import for all *.csv / *.xlsx in data/lvco/
bash scripts/ingest_lvco.sh --file /path/to/file.csv
```

- **Auth:** set `POSEIDON_INGEST_EMAIL` / `POSEIDON_INGEST_PASSWORD`, or use `POSEIDON_ACCESS_TOKEN`. `CORE_API_EMAIL` / `CORE_API_PASSWORD` remain valid for automation-oriented flows, but they should not be treated as the default human dashboard login.
- **URL (`CORE_BASE_URL`) — must reach Core `/auth/login` and `/orders/import`, not NextAuth:**
  - **Local nginx in front of Core:** `http://localhost/api` → requests go to `.../api/auth/login` and `.../api/orders/import` (rewritten to Core).
  - **Direct Core:** `http://127.0.0.1:8001` → `.../auth/login`, `.../orders/import`.
  - **Dashboard Core proxy (same host as the UI):** when nginx sends `/api/` to Next.js, use the BFF prefix that forwards to Core, e.g. `CORE_BASE_URL=http://localhost/api/core` so login hits `/api/core/auth/login` (proxies to Core) instead of `/api/auth/*` (NextAuth).
- **XLSX:** install `openpyxl` once: `pip install openpyxl` (or `python3 -m pip install openpyxl`).

Column mapping matches the dashboard live ingest route (`frontend/src/app/api/ingest/live/route.ts`): patient name, payer, HCPCS/CPT, ICD, DOB, etc.

### Import deduplication (what it does / what it does not)

- **Within one request:** rows that match the same org + patient identity + payer + sorted HCPCS + sorted ICD list are collapsed; extra rows become `skipped_duplicate` in the API response.
- **Across requests:** a second ingest (re-run script, second file, dashboard upload) used to create **another** draft order because only the in-memory batch was deduped. Core now skips when a **draft** order already exists for the same org, patient, payer, HCPCS JSON, and diagnosis signature (`intake_payload._import_diag_sig`, or legacy match on `patients.diagnosis_codes`).
- **Database cleanup:** migration `006_cleanup_import_dedup.sql` removed many duplicate draft rows by `hcpcs_codes::text`, which can miss duplicates when the same codes appear in a different JSON array order. Run **`008_dedup_orders_sorted_hcpcs.sql`** (included in `scripts/run_production_migrations.sh` after 007) to delete remaining safe duplicate drafts using **sorted** HCPCS as the identity.

### LVCO remittance columns → patient tab & Kanban

Spreadsheet columns are normalized (see `scripts/ingest_lvco.py`). When present, values are sent on the import payload and Core writes **`orders.paid_amount` / `total_paid` / `denied_amount` / `total_billed`**, creates **`payment_outcomes`** and **`denials`** rows tagged `lvco_import`, and may set **`orders.status`** from **`claim_status`** (e.g. paid / denied / submitted). The **patient chart** shows per-order reimbursed, denied, and billed; the **intake Kanban** card flip uses the same chart API for reimbursement lines.

Recognized column aliases include:

| Concept | Header examples (case-insensitive, normalized) |
|--------|-----------------------------------------------|
| Paid | `paid_amount`, `amount_paid`, `paid`, `payment_amount`, `total_paid`, … |
| Reimbursed | `reimbursed`, `reimbursed_amount`, `reimbursement`, `net_paid`, … |
| Denied | `denied_amount`, `denial_amount`, `amount_denied`, … |
| Billed | `billed_amount`, `billed`, `charges`, `total_billed`, `claim_amount`, … |
| Claim status | `claim_status`, `current_claim_status`, `adjudication_status`, `payment_status` |

### Full “live” pipeline (ingest + Trident + PDFs)

After Core has **`TRIDENT_API_URL`** configured and you use an **admin** login (or `POSEIDON_ACCESS_TOKEN` for an admin user):

```bash
python3 scripts/lvco_live_pipeline.py
```

This runs **`scripts/ingest_lvco.sh`**, then **`POST /api/v1/admin/materialize-order-packages`** (Trident score JSON + SWO/CMS/POD PDFs when slots are empty). By default it also sets **`unlock_lvco_intake_gates=true`**, which marks **draft** rows from `lvco` / `import` as eligibility **eligible** and SWO **ingested** so Kanban moves are not blocked in replay environments. Use **`--no-unlock-gates`** for stricter gating.

## WHT workspace -> data room automated pulls

For recurring WHT data-room imports with duplicate review + chart doc consolidation:

```bash
python3 scripts/wht_data_room_pull.py --mode morning
python3 scripts/wht_data_room_pull.py --mode nightly
```

What it does:
- Parses `*.csv/*.xlsx` from `WHT_DATA_ROOM_DIR` (default `data/wht-workspace/data-room`) and posts to `POST /orders/import`
- Uses Core import dedup (`skipped_duplicate`) and writes review flags
- Scans document files (`pdf/doc/docx/txt/png/jpg/...`) and attempts to attach them to matched orders as `chart_notes`
- Writes a review queue report JSON under `data/processed/wht_review_queue_*.json`

Install cron (morning + nightly defaults):

```bash
bash scripts/setup_wht_pull_cron.sh
```

Override times if needed:

```bash
WHT_MORNING_CRON_SPEC="0 6 * * *" \
WHT_NIGHTLY_CRON_SPEC="0 21 * * *" \
bash scripts/setup_wht_pull_cron.sh
```

On macOS, launchd is preferred:

```bash
bash scripts/setup_wht_pull_launchd.sh
```
