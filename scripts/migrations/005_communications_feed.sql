-- Add in-app communications message storage for the dashboard feed.

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

CREATE INDEX IF NOT EXISTS communications_messages_org_idx
  ON communications_messages(org_id, created_at DESC);
