-- =============================================================================
-- POSEIDON Platform Canonical Schema
-- Idempotent and backwards-compatible with the existing service layer.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- ORGANIZATIONS & USERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('dme','biologics','mobility','multi')),
    npi VARCHAR(20),
    tax_id VARCHAR(20),
    billing_address JSONB,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin','intake','rep','executive','billing','system')),
    territory_id VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PAYERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS payers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    timely_filing_days INTEGER NOT NULL DEFAULT 365,
    requires_cmn BOOLEAN NOT NULL DEFAULT false,
    requires_prior_auth JSONB NOT NULL DEFAULT '[]',
    baseline_denial_rate NUMERIC(5,4),
    active BOOLEAN NOT NULL DEFAULT true
);

-- =============================================================================
-- PATIENTS & INSURANCE
-- =============================================================================
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    mrn VARCHAR(50),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    dob DATE,
    gender VARCHAR(20),
    ssn_last4 VARCHAR(4),
    phone VARCHAR(30),
    email VARCHAR(255),
    address_line1 VARCHAR(500),
    address_line2 VARCHAR(255),
    city VARCHAR(255),
    state VARCHAR(10),
    zip_code VARCHAR(20),
    territory_id VARCHAR(100),
    insurance_id TEXT,
    payer_id TEXT,
    diagnosis_codes JSONB DEFAULT '[]',
    address JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, mrn)
);

CREATE TABLE IF NOT EXISTS patient_insurances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    payer_name VARCHAR(255) NOT NULL,
    payer_id VARCHAR(50),
    member_id VARCHAR(100),
    group_number VARCHAR(100),
    subscriber_name VARCHAR(255),
    subscriber_dob DATE,
    relationship VARCHAR(50) DEFAULT 'self',
    is_primary BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    eligibility_status VARCHAR(50),
    eligibility_checked_at TIMESTAMPTZ,
    eligibility_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PHYSICIANS & FACILITIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS physicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    npi VARCHAR(20) UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    specialty VARCHAR(255),
    phone VARCHAR(30),
    fax VARCHAR(30),
    facility_name VARCHAR(500),
    address JSONB,
    org_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ORDERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    order_number VARCHAR(50) UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients(id),
    physician_id UUID REFERENCES physicians(id),
    assigned_rep_id UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'intake' CHECK (status IN (
        'draft','authorized','appealed','write_off',
        'intake','eligibility_check','eligibility_failed','pending_auth',
        'auth_approved','auth_denied','documents_pending','physician_signature',
        'ready_to_submit','submitted','pending_payment','partial_payment',
        'denied','appeal_pending','appeal_submitted','paid','closed','cancelled'
    )),
    product_category VARCHAR(100),
    vertical VARCHAR(50) CHECK (vertical IN ('dme','biologics','mobility')),
    source VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'normal',
    territory_id VARCHAR(100),
    place_of_service VARCHAR(5) DEFAULT '12',
    clinical_notes TEXT,
    clinical_data JSONB DEFAULT '{}',
    total_billed NUMERIC(12,2),
    total_allowed NUMERIC(12,2),
    total_paid NUMERIC(12,2),
    date_of_service DATE,
    submitted_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    hcpcs_codes JSONB DEFAULT '[]',
    referring_physician_npi TEXT,
    payer_id TEXT,
    insurance_auth_number TEXT,
    denial_category TEXT,
    denied_amount NUMERIC(12,2),
    denial_date DATE,
    paid_amount NUMERIC(12,2),
    payment_date DATE,
    denial_risk_score NUMERIC(5,4),
    risk_tier TEXT,
    trident_flags JSONB DEFAULT '[]',
    swo_document_id TEXT,
    cms1500_document_id TEXT,
    pod_document_id TEXT,
    invoice_document_id TEXT,
    packing_sheet_document_id TEXT,
    source_channel TEXT DEFAULT 'manual',
    source_reference TEXT,
    intake_payload JSONB DEFAULT '{}',
    eligibility_status TEXT DEFAULT 'pending',
    eligibility_summary JSONB DEFAULT '{}',
    swo_status TEXT DEFAULT 'not_requested',
    swo_request_id TEXT,
    swo_sign_url TEXT,
    fulfillment_status TEXT DEFAULT 'draft',
    tracking_number TEXT,
    tracking_carrier TEXT,
    tracking_status TEXT,
    tracking_url TEXT,
    delivered_at TIMESTAMPTZ,
    pod_status TEXT DEFAULT 'not_scheduled',
    pod_sent_at TIMESTAMPTZ,
    pod_received_at TIMESTAMPTZ,
    billing_status TEXT DEFAULT 'not_ready',
    billing_ready_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    icd10_code VARCHAR(20) NOT NULL,
    description TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    sequence INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS order_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    hcpcs_code VARCHAR(20) NOT NULL,
    modifier VARCHAR(10),
    description TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price NUMERIC(10,2),
    billed_amount NUMERIC(10,2),
    allowed_amount NUMERIC(10,2),
    paid_amount NUMERIC(10,2),
    is_billable BOOLEAN DEFAULT TRUE,
    requires_abn BOOLEAN DEFAULT FALSE
);

-- =============================================================================
-- DOCUMENTS & FILE TRACKING
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN (
        'swo','pod','cms1500','patient_id','doctors_notes','addendum',
        'prescription','chart_notes','appeal_letter','eob','denial_letter',
        'prior_auth','eligibility_response','signed_swo',
        'tracking_confirmation','other'
    )),
    file_name VARCHAR(500),
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    storage_bucket VARCHAR(100) DEFAULT 'poseidon-docs',
    storage_key VARCHAR(500),
    version INTEGER DEFAULT 1,
    status VARCHAR(30) DEFAULT 'draft',
    signed_at TIMESTAMPTZ,
    signed_by VARCHAR(255),
    esign_request_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ELIGIBILITY & PRIOR AUTH
-- =============================================================================
CREATE TABLE IF NOT EXISTS eligibility_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    insurance_id UUID REFERENCES patient_insurances(id),
    payer_id VARCHAR(50),
    status VARCHAR(30) DEFAULT 'pending',
    is_eligible BOOLEAN,
    coverage_details JSONB,
    raw_response JSONB,
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    org_id UUID NOT NULL,
    payer_id VARCHAR(50),
    auth_number VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending',
    hcpcs_codes TEXT[],
    icd10_codes TEXT[],
    requested_units INTEGER,
    approved_units INTEGER,
    effective_date DATE,
    expiration_date DATE,
    raw_response JSONB,
    notes TEXT,
    submitted_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payer_auth_requirements (
    id SERIAL PRIMARY KEY,
    payer_id VARCHAR(50) NOT NULL,
    payer_name VARCHAR(200),
    hcpcs_code VARCHAR(20) NOT NULL,
    requires_auth BOOLEAN DEFAULT TRUE,
    required_documents TEXT[] DEFAULT ARRAY['doctors_notes','chart_notes'],
    effective_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    UNIQUE(payer_id, hcpcs_code, effective_date)
);

-- =============================================================================
-- EOB / PAYMENT / DENIALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS eob_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,
    claim_number VARCHAR(100) NOT NULL,
    order_id UUID REFERENCES orders(id),
    patient_name VARCHAR(255),
    patient_dob DATE,
    member_id VARCHAR(100),
    payer_name VARCHAR(255),
    payer_id VARCHAR(50),
    provider_npi VARCHAR(20),
    date_of_service DATE,
    date_of_remittance DATE,
    total_billed NUMERIC(12,2),
    total_allowed NUMERIC(12,2),
    total_paid NUMERIC(12,2),
    total_patient_responsibility NUMERIC(12,2),
    balance_due NUMERIC(12,2) GENERATED ALWAYS AS (COALESCE(total_billed,0) - COALESCE(total_paid,0)) STORED,
    claim_status VARCHAR(50),
    denial_reason TEXT,
    carc_code VARCHAR(20),
    rarc_code VARCHAR(20),
    denial_category VARCHAR(50),
    suggested_action VARCHAR(100),
    is_appealable BOOLEAN DEFAULT TRUE,
    appeal_deadline DATE,
    raw_source TEXT,
    ingest_batch_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(claim_number)
);

CREATE TABLE IF NOT EXISTS eob_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES eob_claims(id) ON DELETE CASCADE,
    hcpcs_code VARCHAR(20),
    modifier VARCHAR(10),
    service_date DATE,
    billed_amount NUMERIC(10,2),
    allowed_amount NUMERIC(10,2),
    paid_amount NUMERIC(10,2),
    patient_responsibility NUMERIC(10,2),
    adjustment_reason_code VARCHAR(20),
    remark_code VARCHAR(20),
    units INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS payment_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,
    order_id UUID REFERENCES orders(id),
    claim_number VARCHAR(100),
    payer_id VARCHAR(50),
    payer_name VARCHAR(200),
    hcpcs_code VARCHAR(20),
    icd10_code VARCHAR(20),
    diagnosis_codes TEXT,
    billed_amount NUMERIC(10,2),
    paid_amount NUMERIC(10,2),
    is_denial BOOLEAN,
    denial_reason VARCHAR(500),
    carc_code VARCHAR(20),
    rarc_code VARCHAR(20),
    date_of_service DATE,
    adjudicated_at TIMESTAMPTZ,
    external_claim_number VARCHAR(100),
    payment_date DATE,
    eob_reference TEXT,
    adjustment_codes JSONB DEFAULT '[]',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eob_worklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES eob_claims(id),
    assigned_to UUID REFERENCES users(id),
    status VARCHAR(30) DEFAULT 'open',
    action_type VARCHAR(50),
    notes TEXT,
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- DENIALS & APPEALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS denials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    org_id UUID NOT NULL,
    claim_id UUID REFERENCES eob_claims(id),
    payer_id VARCHAR(50),
    payer_name VARCHAR(200),
    carc_code VARCHAR(20),
    rarc_code VARCHAR(20),
    denial_category VARCHAR(50),
    denial_reason TEXT,
    billed_amount NUMERIC(10,2),
    denied_amount NUMERIC(12,2),
    denial_date DATE,
    payer_claim_number TEXT,
    appeal_deadline DATE,
    status VARCHAR(30) DEFAULT 'new',
    appeal_status TEXT DEFAULT 'pending',
    assigned_to UUID REFERENCES users(id),
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appeals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    denial_id UUID NOT NULL REFERENCES denials(id),
    order_id UUID REFERENCES orders(id),
    org_id UUID NOT NULL,
    appeal_level INTEGER DEFAULT 1,
    letter_storage_key VARCHAR(500),
    supporting_docs TEXT[],
    status VARCHAR(30) DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    response_received_at TIMESTAMPTZ,
    outcome VARCHAR(30),
    outcome_amount NUMERIC(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TRIDENT ML TABLES
-- =============================================================================
CREATE TABLE IF NOT EXISTS trident_rules (
    id SERIAL PRIMARY KEY,
    payer_id VARCHAR(50) NOT NULL,
    hcpcs_code VARCHAR(20) NOT NULL,
    icd10_code VARCHAR(20),
    rule_type VARCHAR(50),
    weight NUMERIC(8,4) DEFAULT 1.0,
    denial_probability NUMERIC(5,4),
    avg_reimbursement NUMERIC(10,2),
    sample_count INTEGER DEFAULT 0,
    modifier_recommendation VARCHAR(20),
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trident_training_ledger (
    id BIGSERIAL PRIMARY KEY,
    training_run_id UUID DEFAULT gen_random_uuid(),
    trigger_type VARCHAR(50) NOT NULL,
    records_ingested INTEGER NOT NULL,
    records_labeled INTEGER NOT NULL,
    model_version VARCHAR(50),
    accuracy_before NUMERIC(8,6),
    accuracy_after NUMERIC(8,6),
    accuracy_delta NUMERIC(8,6),
    feature_weights JSONB,
    payer_breakdown JSONB,
    status VARCHAR(30) DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS learned_rates (
    id SERIAL PRIMARY KEY,
    org_id UUID,
    payer_id VARCHAR(50) NOT NULL,
    hcpcs_code VARCHAR(20) NOT NULL,
    avg_paid NUMERIC(10,2),
    median_paid NUMERIC(10,2),
    min_paid NUMERIC(10,2),
    max_paid NUMERIC(10,2),
    denial_rate NUMERIC(5,4),
    sample_count INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, payer_id, hcpcs_code)
);

-- =============================================================================
-- TIMELY FILING & CMN TRACKING
-- =============================================================================
CREATE TABLE IF NOT EXISTS timely_filing_windows (
    id SERIAL PRIMARY KEY,
    payer_id VARCHAR(50) NOT NULL,
    payer_name VARCHAR(200),
    window_days INTEGER NOT NULL,
    window_type VARCHAR(50) DEFAULT 'from_dos',
    notes TEXT,
    effective_date DATE DEFAULT CURRENT_DATE,
    UNIQUE(payer_id, effective_date)
);

CREATE TABLE IF NOT EXISTS cmn_tracker (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    cmn_type VARCHAR(20) DEFAULT 'CMN',
    physician_id UUID,
    issue_date DATE,
    expiration_date DATE,
    status VARCHAR(30) DEFAULT 'pending',
    document_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SHIPPING & TRACKING
-- =============================================================================
CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    org_id UUID NOT NULL,
    carrier VARCHAR(50) NOT NULL CHECK (carrier IN ('fedex','ups','usps','courier','other')),
    tracking_number VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'label_created',
    ship_date DATE,
    estimated_delivery DATE,
    actual_delivery DATE,
    recipient_name VARCHAR(255),
    destination_address JSONB,
    items JSONB,
    events JSONB DEFAULT '[]',
    pod_confirmed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(carrier, tracking_number)
);

-- =============================================================================
-- WORKFLOW & AUDIT
-- =============================================================================
CREATE TABLE IF NOT EXISTS workflow_events (
    id BIGSERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    order_id UUID,
    user_id UUID,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    org_id UUID,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    resource VARCHAR(50),
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    order_id UUID REFERENCES orders(id),
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communications_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    order_id UUID REFERENCES orders(id),
    channel VARCHAR(50) NOT NULL DEFAULT 'ops',
    message_type VARCHAR(30) NOT NULL DEFAULT 'note',
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PATIENT CONTACT NOTES
-- =============================================================================
CREATE TABLE IF NOT EXISTS patient_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    author_id UUID NOT NULL REFERENCES users(id),
    author_name VARCHAR(200),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patient_notes_patient ON patient_notes(patient_id);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_patients_org ON patients(org_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients USING gin(to_tsvector('english', coalesce(first_name,'') || ' ' || coalesce(last_name,'')));
CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(org_id);
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'status'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'assigned_rep_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_rep ON orders(assigned_rep_id)';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'assigned_to'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to)';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_outcomes' AND column_name = 'payer_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_outcomes' AND column_name = 'hcpcs_code'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_outcomes' AND column_name = 'is_denial'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_po_training ON payment_outcomes(payer_id, hcpcs_code, is_denial)';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'denials' AND column_name = 'status'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'denials' AND column_name = 'appeal_deadline'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_denials_status ON denials(status, appeal_deadline)';
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_orders_patient ON orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_docs_order ON order_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_docs_type ON order_documents(doc_type, status);
CREATE INDEX IF NOT EXISTS idx_eob_payer ON eob_claims(payer_id);
CREATE INDEX IF NOT EXISTS idx_eob_status ON eob_claims(claim_status);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_workflow_order ON workflow_events(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_org_idx ON notifications(org_id);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS communications_messages_org_idx ON communications_messages(org_id, created_at DESC);

-- =============================================================================
-- COMPATIBILITY NORMALIZATION
-- =============================================================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS npi VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tax_id VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_address JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS territory_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS mrn VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address JSONB DEFAULT '{}';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS diagnosis_codes JSONB DEFAULT '[]';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_id TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS payer_id TEXT;
UPDATE patients SET date_of_birth = COALESCE(date_of_birth, dob) WHERE date_of_birth IS NULL;
UPDATE patients SET dob = COALESCE(dob, date_of_birth) WHERE dob IS NULL;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'address_line1'
    ) THEN
        EXECUTE $sql$
            UPDATE patients
            SET address = jsonb_strip_nulls(jsonb_build_object(
                'line1', address_line1,
                'line2', address_line2,
                'city', city,
                'state', state,
                'zip', zip_code
            ))
            WHERE address = '{}'::jsonb
        $sql$;
    END IF;
END $$;

ALTER TABLE physicians ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE physicians ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE physicians ADD COLUMN IF NOT EXISTS fax VARCHAR(30);
ALTER TABLE physicians ADD COLUMN IF NOT EXISTS facility_name VARCHAR(500);
ALTER TABLE physicians ADD COLUMN IF NOT EXISTS address JSONB;
ALTER TABLE physicians ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS physician_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_rep_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_category VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vertical VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS territory_id VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS place_of_service VARCHAR(5) DEFAULT '12';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS clinical_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS clinical_data JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_billed NUMERIC(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_allowed NUMERIC(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_paid NUMERIC(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS date_of_service DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
UPDATE orders
SET assigned_rep_id = COALESCE(assigned_rep_id, assigned_to),
    clinical_notes = COALESCE(clinical_notes, notes),
    source = COALESCE(source, source_channel),
    total_paid = COALESCE(total_paid, paid_amount),
    paid_at = COALESCE(paid_at, payment_date::timestamptz),
    submitted_at = COALESCE(submitted_at, CASE WHEN status = 'submitted' THEN updated_at ELSE NULL END);

ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS claim_number VARCHAR(100);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS payer_id VARCHAR(50);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS payer_name VARCHAR(200);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS hcpcs_code VARCHAR(20);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS icd10_code VARCHAR(20);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS diagnosis_codes TEXT;
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS billed_amount NUMERIC(10,2);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS is_denial BOOLEAN;
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS denial_reason VARCHAR(500);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS carc_code VARCHAR(20);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS rarc_code VARCHAR(20);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS date_of_service DATE;
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS adjudicated_at TIMESTAMPTZ;
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS external_claim_number VARCHAR(100);
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS eob_reference TEXT;
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS adjustment_codes JSONB DEFAULT '[]';
ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS created_by UUID;

-- =============================================================================
-- SEED DATA
-- =============================================================================
INSERT INTO organizations (id, name, slug, entity_type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'StrykeFox Medical', 'strykefox-medical', 'multi')
ON CONFLICT DO NOTHING;

INSERT INTO timely_filing_windows (payer_id, payer_name, window_days, window_type) VALUES
  ('medicare_dmerc','Medicare DMERC',365,'from_dos'),
  ('uhc','UnitedHealthCare',180,'from_dos'),
  ('aetna','Aetna',180,'from_dos'),
  ('bcbs','BCBS',180,'from_dos'),
  ('cigna','Cigna',180,'from_dos'),
  ('humana','Humana',180,'from_dos'),
  ('molina','Molina',365,'from_dos'),
  ('medicaid','Medicaid',365,'from_dos')
ON CONFLICT DO NOTHING;

INSERT INTO payers (id, name, timely_filing_days, requires_cmn, requires_prior_auth, baseline_denial_rate, active) VALUES
  ('MEDICARE_DMERC', 'Medicare DMERC', 365, true, '["E0601","E1399","K0001","K0002","K0003","K0004","K0005","K0333"]', 0.9050, true),
  ('UHC', 'UnitedHealthcare', 180, false, '["E0601","K0001","K0004","K0005","K0333"]', 0.3200, true),
  ('AETNA', 'Aetna', 180, false, '["E0601","K0001","K0333"]', 0.2800, true),
  ('BCBS', 'Blue Cross Blue Shield', 365, false, '["E0601","K0001","K0004","K0333"]', 0.2500, true),
  ('CIGNA', 'Cigna', 180, false, '["E0601","K0333"]', 0.2700, true),
  ('HUMANA', 'Humana', 365, true, '["E0601","K0001","K0004","K0005","K0333"]', 0.3500, true),
  ('MEDICAID', 'Medicaid', 365, true, '[]', 0.4000, true),
  ('ANTHEM', 'Anthem', 180, false, '["E0601"]', 0.2600, true),
  ('MOLINA', 'Molina Healthcare', 365, false, '[]', 0.3800, true),
  ('CENTENE', 'Centene', 180, false, '[]', 0.3300, true),
  ('WELLCARE', 'WellCare', 180, false, '[]', 0.3600, true),
  ('CARESOURCE', 'CareSource', 365, false, '[]', 0.3400, true),
  ('OSCAR', 'Oscar Health', 180, false, '[]', 0.2200, true),
  ('AMBETTER', 'Ambetter', 180, false, '[]', 0.3000, true),
  ('TRICARE', 'TRICARE', 365, false, '["E0601"]', 0.1800, true),
  ('VA', 'Veterans Affairs', 365, false, '[]', 0.1500, true),
  ('KAISER', 'Kaiser Permanente', 180, false, '[]', 0.1200, true),
  ('MAGELLAN', 'Magellan Health', 180, false, '[]', 0.2900, true),
  ('CHAMP_VA', 'ChampVA', 365, false, '[]', 0.1600, true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- EDI SERVICE TABLES (837P Outbound / 835 Inbound)
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS edi_icn_seq START 100000 INCREMENT 1 MAXVALUE 999999999 CYCLE;

CREATE TABLE IF NOT EXISTS claim_submissions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                    UUID NOT NULL REFERENCES orders(id),
    org_id                      UUID NOT NULL REFERENCES organizations(id),
    payer_id                    TEXT,
    claim_number                VARCHAR(50),
    interchange_control_number  VARCHAR(20) NOT NULL,
    stedi_transaction_id        VARCHAR(100),
    submission_type             VARCHAR(20) NOT NULL DEFAULT '837P',
    submission_method           VARCHAR(20) NOT NULL DEFAULT 'stedi_api',
    clearinghouse               VARCHAR(50) DEFAULT 'stedi',
    submission_payload          JSONB,
    acknowledgment_payload      JSONB,
    raw_x12_outbound            TEXT,
    status                      VARCHAR(30) NOT NULL DEFAULT 'draft',
    failure_reason              TEXT,
    rejection_codes             JSONB,
    triggered_by                UUID,
    batch_id                    VARCHAR(50),
    submission_count            INTEGER DEFAULT 1,
    parent_submission_id        UUID REFERENCES claim_submissions(id),
    validated_at                TIMESTAMPTZ,
    submitted_at                TIMESTAMPTZ,
    acknowledged_at             TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cs_order  ON claim_submissions(order_id);
CREATE INDEX IF NOT EXISTS idx_cs_org    ON claim_submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_cs_status ON claim_submissions(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_icn    ON claim_submissions(interchange_control_number);
CREATE INDEX IF NOT EXISTS idx_cs_stedi  ON claim_submissions(stedi_transaction_id);
CREATE INDEX IF NOT EXISTS idx_cs_batch  ON claim_submissions(batch_id);

ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS icn VARCHAR(50);
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS edi_filename VARCHAR(500);
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS edi_content TEXT;
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS isa_control_number VARCHAR(20);
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS gs_control_number VARCHAR(20);
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS clearinghouse_response JSONB;
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS ack_type VARCHAR(20);
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS ack_errors JSONB;
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2);
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS adjustment_amount NUMERIC(12,2);
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS dry_run BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS remittance_batches (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id),
    filename                VARCHAR(255),
    source                  VARCHAR(50) NOT NULL DEFAULT 'clearinghouse',
    file_format             VARCHAR(10) NOT NULL DEFAULT '835',
    raw_content             TEXT,
    raw_x12_inbound         TEXT,
    interchange_control_num VARCHAR(20),
    payer_name              VARCHAR(255),
    payer_id_code           VARCHAR(50),
    check_number            VARCHAR(50),
    check_date              DATE,
    total_paid              DECIMAL(12,2),
    status                  VARCHAR(30) DEFAULT 'received',
    claim_count             INTEGER DEFAULT 0,
    error_message           TEXT,
    received_at             TIMESTAMPTZ DEFAULT NOW(),
    parsed_at               TIMESTAMPTZ,
    posted_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rb_org    ON remittance_batches(org_id);
CREATE INDEX IF NOT EXISTS idx_rb_status ON remittance_batches(status);
CREATE INDEX IF NOT EXISTS idx_rb_payer  ON remittance_batches(payer_name);

CREATE TABLE IF NOT EXISTS remittance_claims (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id                UUID NOT NULL REFERENCES remittance_batches(id) ON DELETE CASCADE,
    org_id                  UUID NOT NULL,
    patient_control_number  VARCHAR(50),
    order_id                UUID,
    claim_submission_id     UUID REFERENCES claim_submissions(id),
    payer_claim_number      VARCHAR(50),
    claim_status_code       VARCHAR(5),
    billed_amount           DECIMAL(10,2),
    paid_amount             DECIMAL(10,2),
    patient_responsibility  DECIMAL(10,2),
    filing_indicator        VARCHAR(5),
    patient_last_name       VARCHAR(100),
    patient_first_name      VARCHAR(100),
    patient_member_id       VARCHAR(50),
    rendering_npi           VARCHAR(10),
    service_date_start      DATE,
    service_date_end        DATE,
    is_denial               BOOLEAN DEFAULT FALSE,
    is_partial_pay          BOOLEAN DEFAULT FALSE,
    is_reversal             BOOLEAN DEFAULT FALSE,
    auto_posted             BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rc_batch  ON remittance_claims(batch_id);
CREATE INDEX IF NOT EXISTS idx_rc_order  ON remittance_claims(order_id);
CREATE INDEX IF NOT EXISTS idx_rc_pcn    ON remittance_claims(patient_control_number);
CREATE INDEX IF NOT EXISTS idx_rc_denial ON remittance_claims(is_denial) WHERE is_denial = TRUE;

CREATE TABLE IF NOT EXISTS remittance_adjustments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remittance_claim_id     UUID NOT NULL REFERENCES remittance_claims(id) ON DELETE CASCADE,
    adjustment_group        VARCHAR(5) NOT NULL,
    carc_code               VARCHAR(10) NOT NULL,
    carc_description        TEXT,
    rarc_code               VARCHAR(10),
    rarc_description        TEXT,
    adjustment_amount       DECIMAL(10,2),
    adjustment_quantity     INTEGER,
    denial_category         VARCHAR(50),
    is_actionable           BOOLEAN DEFAULT TRUE,
    suggested_action        VARCHAR(100),
    created_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ra_claim ON remittance_adjustments(remittance_claim_id);
CREATE INDEX IF NOT EXISTS idx_ra_carc  ON remittance_adjustments(carc_code);
CREATE INDEX IF NOT EXISTS idx_ra_cat   ON remittance_adjustments(denial_category);

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

-- EDI columns on orders
DO $$ BEGIN
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS modifier          VARCHAR(10);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS npi_billing       VARCHAR(20);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS prior_auth_number VARCHAR(50);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS claim_status      VARCHAR(30) DEFAULT 'pending';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_submitted_at TIMESTAMPTZ;
END $$;

DO $$ BEGIN
    ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS source VARCHAR(50);
    ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS service_date DATE;
    ALTER TABLE payment_outcomes ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30);
END $$;

-- =============================================================================
-- PASSWORD RESET TOKENS
-- =============================================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user  ON password_reset_tokens(user_id);

-- =============================================================================
-- SEED: Default admin user
-- Password: Poseidon!2026  (change immediately after first login)
-- =============================================================================
INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role, active, is_active, permissions)
VALUES (
    '00000000-0000-0000-0000-000000000099',
    '00000000-0000-0000-0000-000000000001',
    'admin@strykefox.com',
    '$2b$12$Q6fcSVopF05evYvpk76v7eVTnxsbOD5doYGQj8u7sXWo81IKF2DbS',
    'Adam', 'Stryker', 'admin', true, true,
    '{"grant":["manage_users","reset_passwords","view_reports","manage_fulfillment"]}'::jsonb
) ON CONFLICT (email) DO NOTHING;
