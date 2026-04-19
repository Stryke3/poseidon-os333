-- Provision adam@strykefox.com alongside seeded admin (same org, same initial password hash as init seed).
-- Initial password matches scripts/init.sql comment: Poseidon!2026 — change after first login.

INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role, active, is_active, permissions)
VALUES (
    '00000000-0000-0000-0000-00000000009a',
    '00000000-0000-0000-0000-000000000001',
    'adam@strykefox.com',
    '$2b$12$Q6fcSVopF05evYvpk76v7eVTnxsbOD5doYGQj8u7sXWo81IKF2DbS',
    'Adam', 'Stryker', 'admin', true, true,
    '{"grant":["manage_users","reset_passwords","view_reports","manage_fulfillment"]}'::jsonb
)
ON CONFLICT (email) DO NOTHING;
