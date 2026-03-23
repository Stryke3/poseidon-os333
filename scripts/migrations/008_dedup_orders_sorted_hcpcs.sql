-- =============================================================================
-- 008: Remove duplicate draft import/LVCO orders using *sorted* HCPCS identity.
--     006 used o.hcpcs_codes::text which treats ["L1","L2"] and ["L2","L1"] as
--     different, so cleanup could miss duplicates; merges could also leave pairs
--     that look identical in the UI but differ only by JSON array order.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _import_order_dupes_sorted (id uuid NOT NULL PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _import_order_dupes_sorted (id)
WITH normalized AS (
  SELECT
    o.id,
    ROW_NUMBER() OVER (
      PARTITION BY
        o.org_id,
        o.patient_id,
        COALESCE(
          (
            SELECT jsonb_agg(elem ORDER BY elem)
            FROM jsonb_array_elements_text(COALESCE(o.hcpcs_codes, '[]'::jsonb)) AS e(elem)
          ),
          '[]'::jsonb
        )
      ORDER BY o.created_at ASC NULLS FIRST, o.id
    ) AS rn
  FROM orders o
  WHERE o.status = 'draft'
    AND lower(btrim(coalesce(o.source_channel, ''))) IN ('import', 'lvco')
)
SELECT n.id
FROM normalized n
WHERE n.rn > 1
  AND NOT EXISTS (SELECT 1 FROM claim_submissions c WHERE c.order_id = n.id)
  AND NOT EXISTS (SELECT 1 FROM auth_requests a WHERE a.order_id = n.id)
  AND NOT EXISTS (SELECT 1 FROM eligibility_checks e WHERE e.order_id = n.id);

DELETE FROM orders o
USING _import_order_dupes_sorted d
WHERE o.id = d.id;

COMMIT;
