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

-- Original bytes stay in SPEAR. These are revisioned, organization-scoped
-- extraction receipts and a durable text corpus, never financial postings.
CREATE TABLE IF NOT EXISTS trident_learning_documents (
    source_key TEXT PRIMARY KEY,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_revision TEXT NOT NULL,
    content_token TEXT,
    org_id UUID,
    order_id TEXT,
    case_id TEXT,
    payer_id TEXT,
    payer_name TEXT,
    filename TEXT NOT NULL,
    document_kind TEXT NOT NULL,
    mime_type TEXT,
    content_sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    page_count INTEGER,
    extracted_pages INTEGER,
    ocr_pages INTEGER,
    text_content TEXT,
    hcpcs TEXT[] NOT NULL DEFAULT '{}',
    last_error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    extracted_at TIMESTAMPTZ,
    UNIQUE(source_table,source_id,source_revision)
);
CREATE INDEX IF NOT EXISTS trident_documents_queue_idx
    ON trident_learning_documents(status,next_attempt_at) WHERE active;
CREATE INDEX IF NOT EXISTS trident_documents_org_idx
    ON trident_learning_documents(org_id,source_table,source_id);
CREATE TABLE IF NOT EXISTS trident_document_models (
    model_version TEXT PRIMARY KEY,
    org_id UUID NOT NULL,
    artifact BYTEA NOT NULL,
    source_manifest JSONB NOT NULL,
    document_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
