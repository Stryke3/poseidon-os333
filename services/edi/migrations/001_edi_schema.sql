-- ============================================================
-- POSEIDON EDI Service Schema
-- 837P Outbound Claims + 835 Inbound Remittance
-- Idempotent — safe to re-run
-- Aligned with POSEIDON canonical schema (UUID PKs)
-- ============================================================

-- ─── ICN SEQUENCE ───────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS edi_icn_seq START 100000 INCREMENT 1 MAXVALUE 999999999 CYCLE;

-- ─── 837P: CLAIM SUBMISSIONS (OUTBOUND) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_submissions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                    UUID NOT NULL REFERENCES orders(id),
    org_id                      UUID NOT NULL REFERENCES organizations(id),
    payer_id                    TEXT,
    claim_number                VARCHAR(50),
    interchange_control_number  VARCHAR(20) NOT NULL,
    stedi_transaction_id        VARCHAR(100),

    -- Submission config
    submission_type             VARCHAR(20) NOT NULL DEFAULT '837P',
    submission_method           VARCHAR(20) NOT NULL DEFAULT 'stedi_api',
    clearinghouse               VARCHAR(50) DEFAULT 'stedi',

    -- Payloads
    submission_payload          JSONB,
    acknowledgment_payload      JSONB,
    raw_x12_outbound            TEXT,

    -- Lifecycle: draft → validated → submitted → accepted → rejected → corrected → resubmitted
    status                      VARCHAR(30) NOT NULL DEFAULT 'draft',
    failure_reason              TEXT,
    rejection_codes             JSONB,

    -- Tracking
    triggered_by                UUID,
    batch_id                    VARCHAR(50),
    submission_count            INTEGER DEFAULT 1,
    parent_submission_id        UUID REFERENCES claim_submissions(id),

    -- Timestamps
    validated_at                TIMESTAMPTZ,
    submitted_at                TIMESTAMPTZ,
    acknowledged_at             TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cs_order      ON claim_submissions(order_id);
CREATE INDEX IF NOT EXISTS idx_cs_org        ON claim_submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_cs_status     ON claim_submissions(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_icn        ON claim_submissions(interchange_control_number);
CREATE INDEX IF NOT EXISTS idx_cs_stedi      ON claim_submissions(stedi_transaction_id);
CREATE INDEX IF NOT EXISTS idx_cs_batch      ON claim_submissions(batch_id);

-- ─── 835: REMITTANCE BATCHES (INBOUND) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS remittance_batches (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id),
    filename                VARCHAR(255),
    source                  VARCHAR(50) NOT NULL DEFAULT 'clearinghouse',
    file_format             VARCHAR(10) NOT NULL DEFAULT '835',
    raw_content             TEXT,
    raw_x12_inbound         TEXT,

    -- Header info from ISA/GS
    interchange_control_num VARCHAR(20),
    payer_name              VARCHAR(255),
    payer_id_code           VARCHAR(50),
    check_number            VARCHAR(50),
    check_date              DATE,
    total_paid              DECIMAL(12,2),

    -- Processing
    status                  VARCHAR(30) DEFAULT 'received',
    claim_count             INTEGER DEFAULT 0,
    error_message           TEXT,

    -- Timestamps
    received_at             TIMESTAMPTZ DEFAULT NOW(),
    parsed_at               TIMESTAMPTZ,
    posted_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rb_org    ON remittance_batches(org_id);
CREATE INDEX IF NOT EXISTS idx_rb_status ON remittance_batches(status);
CREATE INDEX IF NOT EXISTS idx_rb_payer  ON remittance_batches(payer_name);

-- ─── 835: REMITTANCE CLAIMS (parsed from 835 CLP segments) ─────────────────
CREATE TABLE IF NOT EXISTS remittance_claims (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id                UUID NOT NULL REFERENCES remittance_batches(id) ON DELETE CASCADE,
    org_id                  UUID NOT NULL,

    -- Claim identification
    patient_control_number  VARCHAR(50),
    order_id                UUID,
    claim_submission_id     UUID REFERENCES claim_submissions(id),
    payer_claim_number      VARCHAR(50),

    -- Amounts (CLP segment)
    claim_status_code       VARCHAR(5),
    billed_amount           DECIMAL(10,2),
    paid_amount             DECIMAL(10,2),
    patient_responsibility  DECIMAL(10,2),
    filing_indicator        VARCHAR(5),

    -- Patient info (NM1 QC)
    patient_last_name       VARCHAR(100),
    patient_first_name      VARCHAR(100),
    patient_member_id       VARCHAR(50),

    -- Provider info (NM1 82)
    rendering_npi           VARCHAR(10),

    -- Dates
    service_date_start      DATE,
    service_date_end        DATE,

    -- Status
    is_denial               BOOLEAN DEFAULT FALSE,
    is_partial_pay          BOOLEAN DEFAULT FALSE,
    is_reversal             BOOLEAN DEFAULT FALSE,
    auto_posted             BOOLEAN DEFAULT FALSE,

    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rc_batch   ON remittance_claims(batch_id);
CREATE INDEX IF NOT EXISTS idx_rc_order   ON remittance_claims(order_id);
CREATE INDEX IF NOT EXISTS idx_rc_pcn     ON remittance_claims(patient_control_number);
CREATE INDEX IF NOT EXISTS idx_rc_denial  ON remittance_claims(is_denial) WHERE is_denial = TRUE;

-- ─── 835: REMITTANCE ADJUSTMENTS (parsed from CAS segments) ────────────────
CREATE TABLE IF NOT EXISTS remittance_adjustments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remittance_claim_id     UUID NOT NULL REFERENCES remittance_claims(id) ON DELETE CASCADE,

    -- CAS segment fields
    adjustment_group        VARCHAR(5) NOT NULL,
    carc_code               VARCHAR(10) NOT NULL,
    carc_description        TEXT,
    rarc_code               VARCHAR(10),
    rarc_description        TEXT,
    adjustment_amount       DECIMAL(10,2),
    adjustment_quantity     INTEGER,

    -- Classification
    denial_category         VARCHAR(50),
    is_actionable           BOOLEAN DEFAULT TRUE,
    suggested_action        VARCHAR(100),

    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ra_claim ON remittance_adjustments(remittance_claim_id);
CREATE INDEX IF NOT EXISTS idx_ra_carc  ON remittance_adjustments(carc_code);
CREATE INDEX IF NOT EXISTS idx_ra_cat   ON remittance_adjustments(denial_category);

-- ─── 835: REMITTANCE SERVICE LINES (parsed from SVC segments) ──────────────
CREATE TABLE IF NOT EXISTS remittance_service_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remittance_claim_id     UUID NOT NULL REFERENCES remittance_claims(id) ON DELETE CASCADE,
    hcpcs_code              VARCHAR(10),
    modifier                VARCHAR(10),
    billed_amount           DECIMAL(10,2),
    paid_amount             DECIMAL(10,2),
    allowed_amount          DECIMAL(10,2),
    deductible              DECIMAL(10,2),
    coinsurance             DECIMAL(10,2),
    copay                   DECIMAL(10,2),
    units_billed            INTEGER,
    units_paid              INTEGER,
    service_date            DATE,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsl_claim ON remittance_service_lines(remittance_claim_id);
CREATE INDEX IF NOT EXISTS idx_rsl_hcpcs ON remittance_service_lines(hcpcs_code);

-- ─── SUBMISSION AUDIT LOG ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS edi_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       UUID NOT NULL,
    action          VARCHAR(50) NOT NULL,
    old_status      VARCHAR(30),
    new_status      VARCHAR(30),
    details         JSONB,
    performed_by    UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eal_entity ON edi_audit_log(entity_type, entity_id);

-- ─── ENSURE ORDERS TABLE HAS EDI COLUMNS ─────────────────────────────────
-- place_of_service already exists in canonical schema
DO $$ BEGIN
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS modifier          VARCHAR(10);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS npi_billing       VARCHAR(20);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS prior_auth_number VARCHAR(50);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS claim_status      VARCHAR(30) DEFAULT 'pending';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_submitted_at TIMESTAMPTZ;
END $$;

-- ─── ENSURE payment_outcomes HAS EDI COLUMNS ─────────────────────────────
DO $$ BEGIN
    ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS source VARCHAR(50);
    ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS service_date DATE;
    ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30);
END $$;
