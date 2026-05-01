-- POSEIDON LITE: isolated schema (does not replace legacy public.patients).
CREATE SCHEMA IF NOT EXISTS lite;

CREATE TABLE IF NOT EXISTS lite.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    dob DATE,
    phone TEXT,
    email TEXT,
    address TEXT,
    payer_name TEXT,
    member_id TEXT,
    ordering_provider TEXT,
    diagnosis_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    hcpcs_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lite.patient_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES lite.patients(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lite_patient_documents_patient
    ON lite.patient_documents (patient_id);

CREATE TABLE IF NOT EXISTS lite.generated_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES lite.patients(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    file_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lite_generated_documents_patient
    ON lite.generated_documents (patient_id);

-- Reference lists for payer / ordering provider UI (see also 019_lite_reference_providers_payers.sql).
CREATE TABLE IF NOT EXISTS lite.recognized_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    npi TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_recognized_providers_display_lower
    ON lite.recognized_providers (lower(display_name));

CREATE TABLE IF NOT EXISTS lite.recognized_payers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    external_code TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_recognized_payers_display_lower
    ON lite.recognized_payers (lower(display_name));
