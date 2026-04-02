CREATE TABLE IF NOT EXISTS icd10_master (
  code VARCHAR(10) PRIMARY KEY,
  short_description VARCHAR(255) NOT NULL,
  long_description TEXT,
  chapter VARCHAR(50),
  category VARCHAR(50),
  billable_flag BOOLEAN NOT NULL DEFAULT TRUE,
  laterality_required_flag BOOLEAN NOT NULL DEFAULT FALSE,
  postop_flag BOOLEAN NOT NULL DEFAULT FALSE,
  chronic_flag BOOLEAN NOT NULL DEFAULT FALSE,
  surgical_episode_flag BOOLEAN NOT NULL DEFAULT FALSE,
  effective_date DATE NOT NULL,
  termination_date DATE,
  version_year INT NOT NULL,
  status_active_flag BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS hcpcs_master (
  hcpcs_code VARCHAR(10) PRIMARY KEY,
  short_description VARCHAR(255) NOT NULL,
  long_description TEXT,
  code_type VARCHAR(5) NOT NULL,
  dmepos_flag BOOLEAN NOT NULL DEFAULT TRUE,
  orthotics_flag BOOLEAN NOT NULL DEFAULT FALSE,
  cold_therapy_flag BOOLEAN NOT NULL DEFAULT FALSE,
  compression_flag BOOLEAN NOT NULL DEFAULT FALSE,
  mobility_flag BOOLEAN NOT NULL DEFAULT FALSE,
  supply_flag BOOLEAN NOT NULL DEFAULT FALSE,
  capped_rental_flag BOOLEAN NOT NULL DEFAULT FALSE,
  purchase_allowed_flag BOOLEAN NOT NULL DEFAULT TRUE,
  prior_auth_possible_flag BOOLEAN NOT NULL DEFAULT FALSE,
  common_modifier_pattern TEXT[] NOT NULL DEFAULT '{}',
  bilateral_allowed_flag BOOLEAN NOT NULL DEFAULT FALSE,
  laterality_applicable_flag BOOLEAN NOT NULL DEFAULT FALSE,
  typical_units NUMERIC(10,2),
  status_active_flag BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date DATE NOT NULL,
  termination_date DATE,
  version_quarter INT NOT NULL,
  version_year INT NOT NULL
);

CREATE TABLE IF NOT EXISTS hcpcs_fee_schedule (
  id UUID PRIMARY KEY,
  hcpcs_code VARCHAR(10) NOT NULL REFERENCES hcpcs_master(hcpcs_code),
  jurisdiction VARCHAR(30) NOT NULL,
  state VARCHAR(2),
  rural_flag BOOLEAN NOT NULL DEFAULT FALSE,
  fee_schedule_amount NUMERIC(12,2) NOT NULL,
  purchase_rental_indicator VARCHAR(5),
  ceiling_amount NUMERIC(12,2),
  floor_amount NUMERIC(12,2),
  effective_date DATE NOT NULL,
  source_version VARCHAR(50) NOT NULL
);
CREATE INDEX idx_fee_hcpcs ON hcpcs_fee_schedule(hcpcs_code);

CREATE TABLE IF NOT EXISTS modifier_rules (
  id UUID PRIMARY KEY,
  hcpcs_code VARCHAR(10) NOT NULL REFERENCES hcpcs_master(hcpcs_code),
  modifier VARCHAR(5) NOT NULL,
  allowed_flag BOOLEAN NOT NULL DEFAULT TRUE,
  required_flag BOOLEAN NOT NULL DEFAULT FALSE,
  mutually_exclusive_with TEXT[] NOT NULL DEFAULT '{}',
  payer_specific_flag BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT
);
CREATE INDEX idx_mod_hcpcs ON modifier_rules(hcpcs_code);

CREATE TABLE IF NOT EXISTS dx_hcpcs_rules (
  rule_id UUID PRIMARY KEY,
  procedure_family VARCHAR(50) NOT NULL,
  diagnosis_code VARCHAR(10) NOT NULL REFERENCES icd10_master(code),
  hcpcs_code VARCHAR(10) NOT NULL REFERENCES hcpcs_master(hcpcs_code),
  support_level VARCHAR(20) NOT NULL,
  medical_necessity_basis TEXT,
  documentation_required TEXT[] NOT NULL DEFAULT '{}',
  payer_scope VARCHAR(100) NOT NULL DEFAULT 'all',
  confidence_score NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  active_flag BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_dx_rule_hcpcs ON dx_hcpcs_rules(hcpcs_code);
CREATE INDEX idx_dx_rule_dx ON dx_hcpcs_rules(diagnosis_code);

CREATE TABLE IF NOT EXISTS payer_rules (
  id UUID PRIMARY KEY,
  payer_name VARCHAR(120) NOT NULL,
  plan_type VARCHAR(80),
  product VARCHAR(80),
  hcpcs_code VARCHAR(10) NOT NULL REFERENCES hcpcs_master(hcpcs_code),
  covered_flag BOOLEAN NOT NULL DEFAULT TRUE,
  auth_required_flag BOOLEAN NOT NULL DEFAULT FALSE,
  auth_logic TEXT,
  frequency_limit VARCHAR(100),
  bundling_risk VARCHAR(50),
  modifier_requirements TEXT[] NOT NULL DEFAULT '{}',
  dx_restrictions TEXT[] NOT NULL DEFAULT '{}',
  documentation_requirements TEXT[] NOT NULL DEFAULT '{}',
  effective_date DATE NOT NULL,
  termination_date DATE
);
CREATE INDEX idx_payer_rule_payer ON payer_rules(payer_name);
CREATE INDEX idx_payer_rule_hcpcs ON payer_rules(hcpcs_code);

CREATE TABLE IF NOT EXISTS auth_rules (
  id UUID PRIMARY KEY,
  payer_name VARCHAR(120) NOT NULL,
  hcpcs_code VARCHAR(10) NOT NULL REFERENCES hcpcs_master(hcpcs_code),
  auth_required_flag BOOLEAN NOT NULL DEFAULT FALSE,
  auth_trigger_logic TEXT,
  lookback_period VARCHAR(50),
  clinical_documents_required TEXT[] NOT NULL DEFAULT '{}',
  portal_or_submission_type VARCHAR(50)
);
CREATE INDEX idx_auth_payer ON auth_rules(payer_name);

CREATE TABLE IF NOT EXISTS documentation_rules (
  id UUID PRIMARY KEY,
  hcpcs_code VARCHAR(10) NOT NULL REFERENCES hcpcs_master(hcpcs_code),
  required_document_type VARCHAR(50) NOT NULL,
  required_elements TEXT[] NOT NULL DEFAULT '{}',
  must_include_laterality_flag BOOLEAN NOT NULL DEFAULT FALSE,
  must_include_dos_flag BOOLEAN NOT NULL DEFAULT FALSE,
  must_include_provider_signature_flag BOOLEAN NOT NULL DEFAULT FALSE,
  must_include_npi_flag BOOLEAN NOT NULL DEFAULT FALSE,
  must_include_medical_necessity_flag BOOLEAN NOT NULL DEFAULT FALSE,
  must_include_risk_score_flag BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS denial_rules (
  id UUID PRIMARY KEY,
  hcpcs_code VARCHAR(10) NOT NULL REFERENCES hcpcs_master(hcpcs_code),
  denial_category VARCHAR(80) NOT NULL,
  denial_reason TEXT NOT NULL,
  preventive_logic TEXT NOT NULL,
  common_root_cause TEXT,
  escalation_recommendation TEXT
);

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY,
  patient_id VARCHAR(64) NOT NULL,
  payer_name VARCHAR(120) NOT NULL,
  date_of_service DATE NOT NULL,
  procedure_family VARCHAR(50) NOT NULL,
  laterality VARCHAR(5),
  status VARCHAR(20) NOT NULL,
  total_billed NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_allowed NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  diagnosis_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_claim_payer ON claims(payer_name);
CREATE INDEX idx_claim_patient_dos ON claims(patient_id, date_of_service);

CREATE TABLE IF NOT EXISTS claim_lines (
  id UUID PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  hcpcs_code VARCHAR(10) NOT NULL REFERENCES hcpcs_master(hcpcs_code),
  units INT NOT NULL DEFAULT 1,
  modifiers TEXT[] NOT NULL DEFAULT '{}',
  diagnosis_pointers TEXT[] NOT NULL DEFAULT '{}',
  charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_status VARCHAR(20) NOT NULL DEFAULT 'READY'
);
CREATE INDEX idx_claim_line_hcpcs ON claim_lines(hcpcs_code);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  trace_id VARCHAR(128) NOT NULL,
  actor VARCHAR(64) NOT NULL,
  rule_invoked VARCHAR(120) NOT NULL,
  input_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(5,4),
  override_status VARCHAR(20),
  override_reason TEXT,
  code_library_version VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_trace ON audit_logs(trace_id);

CREATE TABLE IF NOT EXISTS reimbursement_history (
  id UUID PRIMARY KEY,
  payer_name VARCHAR(120) NOT NULL,
  plan VARCHAR(80),
  hcpcs_code VARCHAR(10) NOT NULL REFERENCES hcpcs_master(hcpcs_code),
  allowed_amount NUMERIC(12,2),
  paid_amount NUMERIC(12,2),
  adjudication_days INT,
  denial_flag BOOLEAN NOT NULL DEFAULT FALSE,
  denial_reason TEXT,
  appeal_outcome VARCHAR(50),
  region VARCHAR(20),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reimb_payer_hcpcs ON reimbursement_history(payer_name, hcpcs_code);
