# TRIDENT learning integration checks

Run from the repository root with the TRIDENT runtime requirements plus pytest,
pytest-asyncio, and httpx installed in a Python virtual environment:

```bash
npm install --prefix services/trident/tests
TRIDENT_PGLITE_BRIDGE=services/trident/tests/pglite-bridge.cjs python -m pytest services/trident/tests/test_learning_pipeline.py -q
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
