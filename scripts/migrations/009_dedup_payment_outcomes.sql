-- 009_dedup_payment_outcomes.sql
--
-- Safely remove exact duplicate payment_outcomes rows while preserving the
-- earliest created record for each duplicated payment snapshot.

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY
                COALESCE(org_id::text, ''),
                COALESCE(order_id::text, ''),
                COALESCE(claim_number, ''),
                COALESCE(payer_id, ''),
                COALESCE(payer_name, ''),
                COALESCE(hcpcs_code, ''),
                COALESCE(icd10_code, ''),
                COALESCE(diagnosis_codes, ''),
                COALESCE(billed_amount, 0),
                COALESCE(paid_amount, 0),
                COALESCE(is_denial, false),
                COALESCE(denial_reason, ''),
                COALESCE(carc_code, ''),
                COALESCE(rarc_code, ''),
                COALESCE(date_of_service::text, ''),
                COALESCE(adjudicated_at::text, ''),
                COALESCE(external_claim_number, ''),
                COALESCE(payment_date::text, ''),
                COALESCE(eob_reference, ''),
                COALESCE(adjustment_codes::text, '')
            ORDER BY created_at ASC NULLS FIRST, id ASC
        ) AS rn
    FROM payment_outcomes
)
DELETE FROM payment_outcomes po
USING ranked
WHERE po.id = ranked.id
  AND ranked.rn > 1;
