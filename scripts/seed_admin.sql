-- Seed or update admin user
-- Password: Poseidon!2026
-- Run: docker exec -i poseidon_db psql -U poseidon -d poseidon < scripts/seed_admin.sql

INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000099'::uuid, 'bootstrap', NOW() + INTERVAL '1 year'
WHERE FALSE;  -- just ensures table exists for the schema

INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role, active, is_active, permissions)
VALUES (
    '00000000-0000-0000-0000-000000000099',
    '00000000-0000-0000-0000-000000000001',
    'admin@strykefox.com',
    '$2b$12$Q6fcSVopF05evYvpk76v7eVTnxsbOD5doYGQj8u7sXWo81IKF2DbS',
    'Adam', 'Stryker', 'admin', true, true,
    '{"grant":["manage_users","reset_passwords","view_reports","manage_fulfillment"]}'::jsonb
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    active = true,
    is_active = true;

INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role, active, is_active, permissions)
VALUES (
    '00000000-0000-0000-0000-00000000009a',
    '00000000-0000-0000-0000-000000000001',
    'adam@strykefox.com',
    '$2b$12$Q6fcSVopF05evYvpk76v7eVTnxsbOD5doYGQj8u7sXWo81IKF2DbS',
    'Adam', 'Stryker', 'admin', true, true,
    '{"grant":["manage_users","reset_passwords","view_reports","manage_fulfillment"]}'::jsonb
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    active = true,
    is_active = true;

-- Also create the password_reset_tokens table if it doesn't exist
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
