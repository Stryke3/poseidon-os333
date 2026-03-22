-- Add assignment and intake source metadata to orders for workflow automation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE orders ADD COLUMN assigned_to UUID REFERENCES users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'source_channel'
  ) THEN
    ALTER TABLE orders ADD COLUMN source_channel TEXT NOT NULL DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'source_reference'
  ) THEN
    ALTER TABLE orders ADD COLUMN source_reference TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'intake_payload'
  ) THEN
    ALTER TABLE orders ADD COLUMN intake_payload JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_assigned_to_idx ON orders(assigned_to);
