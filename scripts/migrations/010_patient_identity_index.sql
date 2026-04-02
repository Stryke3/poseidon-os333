-- Patient lookup by org + normalized name + DOB (matches common match queries)
CREATE INDEX IF NOT EXISTS idx_patient_identity ON patients (org_id, lower(first_name), lower(last_name), date_of_birth);
