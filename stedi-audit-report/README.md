# POSEIDON Platform — Stedi Integration Audit Report

Generated for Stedi engineering review. This package contains:

1. **service-health/** — Health check responses from running services
2. **api-surface/** — OpenAPI specs (FastAPI services) and EDI endpoint summary
3. **edi-samples/** — EDI file discovery, container env snapshot (redact secrets before sharing), claim_submissions X12 metadata
4. **db-schema/** — EDI-relevant table structures (`\d+`) and aggregate queries (no row content from PHI tables)
5. **claim-lifecycle/** — Status distributions and optional codebase grep hints
6. **platform-summary.json** — Machine-readable platform capabilities manifest

## What We're Looking For From Stedi
- Direct API integration replacing/supplementing Availity SFTP for 837P submission
- 835 ERA ingestion via Stedi webhook or pull
- Real-time 276/277 claim status queries
- 270/271 eligibility verification (currently via Availity API)
- TA1/999 acknowledgment processing

## Current EDI Stack (verify on host)
- **Outbound 837P:** In-platform X12 → Availity SFTP and/or Stedi API (see `SUBMISSION_METHOD` / `EDI_DRY_RUN` in EDI container env)
- **Inbound 835:** Parsed into `remittance_*` tables and related posting; Stedi import IDs in `stedi_835_import_ids`
- **Enrollment ISA/GS/NPI:** See `edi-samples/edi-config.txt` (from `poseidon_edi` env) — values differ by environment
- **Payers:** Canonical list in `payers` table (Availity trading partner ids where configured)

## This run

`--skip-files` was used: no filesystem search or copy of raw `.x12` / `.837` / `.835` / `.edi` files into this bundle.

