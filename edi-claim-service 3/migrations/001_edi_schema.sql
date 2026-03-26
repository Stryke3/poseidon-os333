-- ============================================================
-- POSEIDON EDI Service Schema
-- 837P Outbound Claims + 835 Inbound Remittance
-- Idempotent — safe to re-run
-- ============================================================

-- ─── ICN SEQUENCE ───────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS edi_icn_seq START 100000 INCREMENT 1 MAXVALUE 999999999 CYCLE;

-- ─── 837P: CLAIM SUBMISSIONS (OUTBOUND) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_submissions (
    id                          SERIAL PRIMARY KEY,
    order_id                    INTEGER NOT NULL,
    org_id                      INTEGER NOT NULL,
    payer_id                    INTEGER,
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
    triggered_by                INTEGER,
    batch_id                    VARCHAR(50),
    submission_count            INTEGER DEFAULT 1,
    parent_submission_id        INTEGER REFERENCES claim_submissions(id),

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
    id                      SERIAL PRIMARY KEY,
    org_id                  INTEGER NOT NULL,
    filename                VARCHAR(255),
    source                  VARCHAR(50) NOT NULL DEFAULT 'clearinghouse',  -- clearinghouse, manual_upload, sftp_poll
    file_format             VARCHAR(10) NOT NULL DEFAULT '835',            -- 835, pdf, csv
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
    status                  VARCHAR(30) DEFAULT 'received',  -- received → parsing → parsed → posted → failed
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
    id                      SERIAL PRIMARY KEY,
    batch_id                INTEGER NOT NULL REFERENCES remittance_batches(id) ON DELETE CASCADE,
    org_id                  INTEGER NOT NULL,

    -- Claim identification
    patient_control_number  VARCHAR(50),       -- CLP01 — maps back to our order
    order_id                INTEGER,           -- resolved from patient_control_number
    claim_submission_id     INTEGER REFERENCES claim_submissions(id),
    payer_claim_number      VARCHAR(50),       -- CLP07 — payer's internal claim ID

    -- Amounts (CLP segment)
    claim_status_code       VARCHAR(5),        -- CLP02: 1=processed primary, 2=processed secondary, 4=denied, 22=reversal
    billed_amount           DECIMAL(10,2),     -- CLP03
    paid_amount             DECIMAL(10,2),     -- CLP04
    patient_responsibility  DECIMAL(10,2),     -- CLP05
    filing_indicator        VARCHAR(5),        -- CLP06

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
    id                      SERIAL PRIMARY KEY,
    remittance_claim_id     INTEGER NOT NULL REFERENCES remittance_claims(id) ON DELETE CASCADE,

    -- CAS segment fields
    adjustment_group        VARCHAR(5) NOT NULL,   -- CO, PR, OA, PI, CR
    carc_code               VARCHAR(10) NOT NULL,  -- Claim Adjustment Reason Code
    carc_description        TEXT,
    rarc_code               VARCHAR(10),           -- Remittance Advice Remark Code (from PLB/LQ)
    rarc_description        TEXT,
    adjustment_amount       DECIMAL(10,2),
    adjustment_quantity     INTEGER,

    -- Classification
    denial_category         VARCHAR(50),   -- eligibility, medical_necessity, authorization, coding, timely_filing, duplicate, coordination
    is_actionable           BOOLEAN DEFAULT TRUE,
    suggested_action        VARCHAR(100),  -- appeal, resubmit_corrected, write_off, patient_bill, secondary_submit

    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ra_claim ON remittance_adjustments(remittance_claim_id);
CREATE INDEX IF NOT EXISTS idx_ra_carc  ON remittance_adjustments(carc_code);
CREATE INDEX IF NOT EXISTS idx_ra_cat   ON remittance_adjustments(denial_category);

-- ─── 835: REMITTANCE SERVICE LINES (parsed from SVC segments) ──────────────
CREATE TABLE IF NOT EXISTS remittance_service_lines (
    id                      SERIAL PRIMARY KEY,
    remittance_claim_id     INTEGER NOT NULL REFERENCES remittance_claims(id) ON DELETE CASCADE,
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
    id              SERIAL PRIMARY KEY,
    entity_type     VARCHAR(30) NOT NULL,  -- claim_submission, remittance_batch, remittance_claim
    entity_id       INTEGER NOT NULL,
    action          VARCHAR(50) NOT NULL,
    old_status      VARCHAR(30),
    new_status      VARCHAR(30),
    details         JSONB,
    performed_by    INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eal_entity ON edi_audit_log(entity_type, entity_id);

-- ─── ENSURE ORDERS TABLE HAS REQUIRED COLUMNS ──────────────────────────────
DO $$ BEGIN
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS modifier          VARCHAR(10);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS place_of_service  VARCHAR(5) DEFAULT '12';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS npi_billing       VARCHAR(20);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS prior_auth_number VARCHAR(50);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS claim_status      VARCHAR(30) DEFAULT 'pending';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_submitted_at TIMESTAMPTZ;
END $$;

-- ─── ORDER LINE ITEMS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_line_items (
    id              SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line_number     INTEGER NOT NULL DEFAULT 1,
    hcpcs_code      VARCHAR(10) NOT NULL,
    modifier        VARCHAR(10),
    units           INTEGER NOT NULL DEFAULT 1,
    charge_amount   DECIMAL(10,2) NOT NULL,
    dos_start       DATE,
    dos_end         DATE,
    diagnosis_pointers VARCHAR(20) DEFAULT '1',
    place_of_service VARCHAR(2) DEFAULT '12',
    rendering_npi   VARCHAR(10),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oli_order ON order_line_items(order_id);

-- ─── ORDER DIAGNOSES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_diagnoses (
    id              SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    icd10_code      VARCHAR(10) NOT NULL,
    sequence        INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id, icd10_code)
);

CREATE INDEX IF NOT EXISTS idx_od_order ON order_diagnoses(order_id);
