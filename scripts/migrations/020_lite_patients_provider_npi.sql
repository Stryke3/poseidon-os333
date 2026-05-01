-- Ordering / prescribing physician NPI for SWO and payer packets (Lite patients).
ALTER TABLE lite.patients ADD COLUMN IF NOT EXISTS provider_npi TEXT;
