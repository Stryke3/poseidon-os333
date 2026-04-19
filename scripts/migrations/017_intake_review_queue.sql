-- =============================================================================
-- 017_intake_review_queue.sql
-- Formalize the intake review queue and add idempotency fingerprints.
--
-- This migration:
--   1. Creates `intake_review_queue` — the authoritative place for any intake
--      artifact that could not be auto-created because of missing fields or
--      low OCR confidence.
--   2. Adds an idempotency fingerprint column to `orders` (`source_fingerprint`)
--      so ingest pipelines can safely retry without duplicating work.
--   3. Adds explicit `intake_received` / `intake_parsed` / `intake_review` events
--      into the `workflow_events` enum surface via free-text (it is TEXT already).
--
-- Idempotent. Safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS intake_review_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL,
    source          TEXT NOT NULL,                 -- e.g. 'fax','email','batch_csv','public_inquiry','pdf_parse'
    source_id       TEXT,                          -- external reference (fax id, email msg id, file name)
    source_fingerprint TEXT,                       -- sha256 of normalized payload for idempotency
    patient_id      UUID REFERENCES patients(id) ON DELETE SET NULL,
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    artifact_type   TEXT NOT NULL,                 -- 'patient_intake','eob','denial','appeal','swo','fax','other'
    status          TEXT NOT NULL DEFAULT 'pending', -- 'pending','in_review','resolved','discarded'
    reason_code     TEXT NOT NULL,                 -- 'missing_fields','low_ocr_confidence','duplicate','parse_failed','payer_unknown'
    reason_detail   TEXT,
    parse_confidence NUMERIC(4,3),                 -- 0.000..1.000 when applicable
    missing_fields  TEXT[],                        -- e.g. ['dob','payer_id','hcpcs_codes']
    payload         JSONB,                         -- parsed/normalized artifact for reviewer
    raw_document_url TEXT,                         -- MinIO URL for the source document
    created_by      UUID,                          -- user id or NULL for automated
    assigned_to     UUID,
    resolved_by     UUID,
    resolved_at     TIMESTAMPTZ,
    resolved_action TEXT,                          -- 'patient_created','order_created','merged','discarded','manual_fix'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_intake_review_queue_org_status ON intake_review_queue(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_intake_review_queue_assigned ON intake_review_queue(assigned_to) WHERE status IN ('pending','in_review');
CREATE UNIQUE INDEX IF NOT EXISTS ux_intake_review_queue_fingerprint
    ON intake_review_queue(org_id, source, source_fingerprint)
    WHERE source_fingerprint IS NOT NULL;

CREATE OR REPLACE FUNCTION set_intake_review_queue_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_intake_review_queue_updated_at ON intake_review_queue;
CREATE TRIGGER trg_intake_review_queue_updated_at
    BEFORE UPDATE ON intake_review_queue
    FOR EACH ROW
    EXECUTE FUNCTION set_intake_review_queue_updated_at();

-- Idempotency fingerprint on orders. Null-safe: only populated rows are
-- compared. Ingest pipelines compute sha256 over (org_id, patient identity,
-- payer, sorted HCPCS, sorted ICD, DOS) and write it alongside the order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;
CREATE INDEX IF NOT EXISTS ix_orders_source_fingerprint
    ON orders(org_id, source_fingerprint)
    WHERE source_fingerprint IS NOT NULL;

-- Patients get an intake-source fingerprint too (email + normalized name
-- + DOB). This does NOT replace the identity index from migration 010; it
-- is strictly used to short-circuit retries from a single parsing run.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS intake_fingerprint TEXT;
CREATE INDEX IF NOT EXISTS ix_patients_intake_fingerprint
    ON patients(org_id, intake_fingerprint)
    WHERE intake_fingerprint IS NOT NULL;

-- Bump schema_version so Core startup does not warn about an older schema.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_version') THEN
        CREATE TABLE schema_version (
            id INT PRIMARY KEY,
            version INT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    END IF;
END $$;

INSERT INTO schema_version (id, version, updated_at)
VALUES (1, 17, NOW())
ON CONFLICT (id) DO UPDATE
    SET version = GREATEST(schema_version.version, EXCLUDED.version),
        updated_at = NOW();

COMMIT;
