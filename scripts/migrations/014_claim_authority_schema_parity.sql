-- Single claim authority (AVAILITY vs EDI), schema parity, version gate support.

-- 1) orders.claim_strategy — must be set before any claim submission (application-enforced).
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS claim_strategy TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_claim_strategy_check;
ALTER TABLE orders ADD CONSTRAINT orders_claim_strategy_check
    CHECK (claim_strategy IS NULL OR claim_strategy IN ('AVAILITY', 'EDI'));

CREATE INDEX IF NOT EXISTS idx_orders_org_claim_strategy ON orders (org_id, claim_strategy)
    WHERE claim_strategy IS NOT NULL;

-- 2) claim_submissions.submission_format — Core Availity persistence (parity with services/core/main.py).
ALTER TABLE claim_submissions
    ADD COLUMN IF NOT EXISTS submission_format VARCHAR(32);

-- 3) schema_version — application expects a single row with id = 1.
CREATE TABLE IF NOT EXISTS schema_version (
    id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    version    INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_version (id, version, updated_at)
VALUES (1, 14, NOW())
ON CONFLICT (id) DO NOTHING;

UPDATE schema_version SET version = GREATEST(version, 14), updated_at = NOW() WHERE id = 1;
