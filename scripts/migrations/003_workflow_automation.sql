-- Add workflow automation fields and persistent notifications.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'eligibility_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN eligibility_status TEXT NOT NULL DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'eligibility_summary'
  ) THEN
    ALTER TABLE orders ADD COLUMN eligibility_summary JSONB NOT NULL DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'swo_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN swo_status TEXT NOT NULL DEFAULT 'not_requested';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'swo_request_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN swo_request_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'swo_sign_url'
  ) THEN
    ALTER TABLE orders ADD COLUMN swo_sign_url TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id                BIGSERIAL PRIMARY KEY,
  org_id            UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID REFERENCES users(id),
  order_id          UUID REFERENCES orders(id),
  notification_type TEXT NOT NULL,
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_org_idx ON notifications(org_id);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_order_idx ON notifications(order_id);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at DESC);
