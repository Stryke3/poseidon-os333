-- Curated ordering providers and payers for Lite / Trident UI dropdowns.
-- Patient rows continue to store payer_name and ordering_provider as plain text.

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

INSERT INTO lite.recognized_payers (display_name, sort_order)
SELECT * FROM (VALUES
    ('Medicare'::text, 10),
    ('Medicaid', 20),
    ('Aetna', 30),
    ('UnitedHealthcare', 40),
    ('Cigna', 50),
    ('Blue Cross Blue Shield', 60),
    ('Humana', 70),
    ('Tricare', 80),
    ('Workers Compensation', 90),
    ('Self Pay / Cash', 100)
) AS v(display_name, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM lite.recognized_payers e
    WHERE lower(e.display_name) = lower(v.display_name)
);

INSERT INTO lite.recognized_providers (display_name, npi, sort_order)
SELECT * FROM (VALUES
    ('Valley Orthopedic Institute'::text, NULL::text, 10),
    ('Metro Bone & Joint Center', NULL, 20),
    ('StrykeFox Orthopedics — Main Campus', NULL, 30),
    ('Regional Surgical Associates', NULL, 40),
    ('Primary Care Partner (referring)', NULL, 50)
) AS v(display_name, npi, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM lite.recognized_providers e
    WHERE lower(e.display_name) = lower(v.display_name)
);
