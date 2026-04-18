-- Idempotent Stedi 835 imports (one batch per Stedi transaction id)
CREATE TABLE IF NOT EXISTS stedi_835_import_ids (
    stedi_transaction_id TEXT PRIMARY KEY,
    batch_id            UUID NOT NULL REFERENCES remittance_batches(id) ON DELETE CASCADE,
    imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stedi_835_import_batch ON stedi_835_import_ids(batch_id);
