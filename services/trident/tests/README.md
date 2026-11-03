# TRIDENT learning integration checks

Run from the repository root with the TRIDENT runtime requirements plus pytest,
pytest-asyncio, and httpx installed in a Python virtual environment:

```bash
npm install --prefix services/trident/tests
TRIDENT_PGLITE_BRIDGE=services/trident/tests/pglite-bridge.cjs python -m pytest services/trident/tests -q
```

The tests use an isolated PostgreSQL engine (PGlite) and synthetic records.
They cover ingestion acknowledgments and deduplication, late source commits,
operator evidence versus outcome labels, persisted model reload, exact model
membership, weekly cadence, signed API authentication, organization isolation,
and insurance/HCPCS filtering. Production credentials are not required.

The application indexes source evidence every five minutes. Model training
defaults to `TRIDENT_LEARNING_MODE=weekly` and a seven-day interval. Scoring
and feedback capture never start training. An authenticated administrator can
request a backfill or a manual training run from the TRIDENT screen.

Source healthcare records and financial posting workflows are unchanged.
TRIDENT receipts acknowledge an exact source revision. Only adjudicated,
explicitly classified payer outcomes enter supervised training; appeals and
operator actions remain searchable evidence until an outcome is recorded.

Uploaded documents are discovered in order_documents, SPEAR SQL documents/artifacts, EOB claim/line records, and retained 835 batches/claim/line/adjustment records. The isolated PyMuPDF/Tesseract worker reads every page, saves extraction failures as explicit holds, and keeps text, SHA-256 and page receipts in PostgreSQL. A separate organization-scoped TF-IDF evidence model refreshes weekly after its initial backlog is extracted. Its exact file manifest is saved with the artifact and used by authenticated learning-file search. This does not create payer labels or alter the outcome model cadence.

For the document checks, install PyMuPDF from the pinned requirements and Tesseract from the operating system package manager. The tests include a four-page packet with a raster denial beneath a readable header; no external OCR or patient data is used.
