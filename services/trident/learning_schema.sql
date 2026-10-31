-- Additive, idempotent TRIDENT ingestion receipts and model lineage.
CREATE TABLE IF NOT EXISTS trident_feedback_ingestion (
    source_key TEXT PRIMARY KEY,
    org_id UUID,
    order_id TEXT,
    claim_number TEXT,
    claim_version TEXT,
    payer_id TEXT,
    payer_name TEXT,
    record_kind TEXT NOT NULL,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    evidence JSONB NOT NULL,
    occurred_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trident_feedback_case_idx
    ON trident_feedback_ingestion(org_id, claim_number, order_id);
CREATE TABLE IF NOT EXISTS trident_model_artifacts (
    model_version TEXT PRIMARY KEY,
    training_run_id UUID NOT NULL UNIQUE,
    artifact BYTEA NOT NULL,
    metadata JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS trident_training_membership (
    training_run_id UUID NOT NULL,
    model_version TEXT NOT NULL,
    source_key TEXT NOT NULL,
    label TEXT NOT NULL,
    feature_hash TEXT NOT NULL,
    PRIMARY KEY(training_run_id, source_key)
);
CREATE INDEX IF NOT EXISTS trident_membership_source_idx
    ON trident_training_membership(source_key);
CREATE TABLE IF NOT EXISTS trident_learning_jobs (
    job_key TEXT PRIMARY KEY,
    last_success_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error TEXT,
    last_result JSONB
);
