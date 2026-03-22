-- Add proof-of-delivery document reference for CRM / sales rep tracking.
-- Run this if your orders table was created before pod_document_id was added to init.sql.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'pod_document_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN pod_document_id TEXT;
  END IF;
END $$;
