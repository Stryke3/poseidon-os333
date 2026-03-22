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

- **Auth:** set `POSEIDON_INGEST_EMAIL` / `POSEIDON_INGEST_PASSWORD` (or reuse `CORE_API_EMAIL` / `CORE_API_PASSWORD`), or `POSEIDON_ACCESS_TOKEN`.
- **URL:** `CORE_BASE_URL` defaults to `http://localhost/api` (nginx on the host). For `docker compose exec` from a container that talks to Core directly, use e.g. `CORE_BASE_URL=http://poseidon_core:8001` (no `/api` prefix).
- **XLSX:** install `openpyxl` once: `pip install openpyxl` (or `python3 -m pip install openpyxl`).

Column mapping matches the dashboard live ingest route (`frontend/src/app/api/ingest/live/route.ts`): patient name, payer, HCPCS/CPT, ICD, DOB, etc.
