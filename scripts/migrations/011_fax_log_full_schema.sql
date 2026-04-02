-- Align fax_log with services/core usage (replaces legacy runtime DDL in the API).

ALTER TABLE fax_log ADD COLUMN IF NOT EXISTS patient_id UUID;
ALTER TABLE fax_log ADD COLUMN IF NOT EXISTS order_id UUID;
ALTER TABLE fax_log ADD COLUMN IF NOT EXISTS related_fax_id UUID;
ALTER TABLE fax_log ADD COLUMN IF NOT EXISTS review_status VARCHAR(64);
ALTER TABLE fax_log ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE fax_log ADD COLUMN IF NOT EXISTS external_fax_id VARCHAR(255);
ALTER TABLE fax_log ADD COLUMN IF NOT EXISTS document_hash VARCHAR(128);
ALTER TABLE fax_log ADD COLUMN IF NOT EXISTS intake_status VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_fax_log_patient_created_at ON fax_log (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fax_log_order_created_at ON fax_log (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fax_log_related_fax_id ON fax_log (related_fax_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fax_log_inbound_external_fax_id
    ON fax_log (external_fax_id)
    WHERE direction = 'inbound' AND external_fax_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fax_log_inbound_document_hash
    ON fax_log (document_hash)
    WHERE direction = 'inbound' AND document_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fax_log_inbound_intake_status ON fax_log (intake_status) WHERE direction = 'inbound';
