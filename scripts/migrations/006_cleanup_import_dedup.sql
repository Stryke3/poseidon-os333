-- =============================================================================
-- 006: Cleanup legacy import synthetic member IDs + merge duplicate patients
--     + remove duplicate draft import orders (same org/patient/HCPCS) when safe.
-- Matches Core logic: IMPORT-ANON-{first 16 hex chars of sha256(fn|ln|dob)}.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Legacy pattern: IMPORT-<unix_ts>-<row_index>  ->  IMPORT-ANON-<hash>
-- ---------------------------------------------------------------------------
UPDATE patients
SET
  insurance_id = 'IMPORT-ANON-' || encode(
    substring(
      digest(
        lower(trim(coalesce(first_name, ''))) || '|' || lower(trim(coalesce(last_name, ''))) || '|'
        || coalesce(dob::text, '1970-01-01'),
        'sha256'
      ) FROM 1 FOR 8
    ),
    'hex'
  ),
  updated_at = NOW()
WHERE insurance_id ~ '^IMPORT-[0-9]+-[0-9]+$';

-- ---------------------------------------------------------------------------
-- 2) Merge duplicate patient rows (same org + normalized name + dob + insurance_id)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _import_patient_reassign (
  keep_id uuid NOT NULL,
  duplicate_id uuid NOT NULL,
  PRIMARY KEY (duplicate_id)
) ON COMMIT DROP;

INSERT INTO _import_patient_reassign (keep_id, duplicate_id)
WITH dup_groups AS (
  SELECT
    org_id,
    lower(trim(coalesce(first_name, ''))) AS fn,
    lower(trim(coalesce(last_name, ''))) AS ln,
    dob,
    insurance_id,
    (array_agg(id ORDER BY created_at NULLS LAST, id))[1] AS keep_id,
    array_agg(id ORDER BY created_at NULLS LAST, id) AS all_ids
  FROM patients
  GROUP BY org_id, lower(trim(coalesce(first_name, ''))), lower(trim(coalesce(last_name, ''))), dob, insurance_id
  HAVING COUNT(*) > 1
)
SELECT d.keep_id, x.duplicate_id
FROM dup_groups d
CROSS JOIN LATERAL unnest(d.all_ids) AS x (duplicate_id)
WHERE x.duplicate_id <> d.keep_id;

UPDATE orders o
SET
  patient_id = r.keep_id,
  updated_at = NOW()
FROM _import_patient_reassign r
WHERE o.patient_id = r.duplicate_id;

UPDATE eligibility_checks ec
SET patient_id = r.keep_id
FROM _import_patient_reassign r
WHERE ec.patient_id = r.duplicate_id;

UPDATE cmn_tracker ct
SET patient_id = r.keep_id
FROM _import_patient_reassign r
WHERE ct.patient_id = r.duplicate_id;

DELETE FROM patients p
USING _import_patient_reassign r
WHERE p.id = r.duplicate_id;

-- ---------------------------------------------------------------------------
-- 3) Duplicate draft import orders: same org + patient + HCPCS JSON; keep oldest.
--     Only delete when nothing critical references the row yet.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _import_order_dupes (id uuid NOT NULL PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _import_order_dupes (id)
WITH ranked AS (
  SELECT
    o.id,
    ROW_NUMBER() OVER (
      PARTITION BY o.org_id, o.patient_id, o.hcpcs_codes::text
      ORDER BY o.created_at ASC NULLS FIRST, o.id
    ) AS rn
  FROM orders o
  WHERE o.status = 'draft'
    AND lower(trim(coalesce(o.source_channel, ''))) IN ('import', 'lvco')
)
SELECT r.id
FROM ranked r
WHERE r.rn > 1
  AND NOT EXISTS (SELECT 1 FROM claim_submissions c WHERE c.order_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM auth_requests a WHERE a.order_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM eligibility_checks e WHERE e.order_id = r.id);

DELETE FROM orders o
USING _import_order_dupes d
WHERE o.id = d.id;

COMMIT;
