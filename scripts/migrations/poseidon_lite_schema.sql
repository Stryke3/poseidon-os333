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
