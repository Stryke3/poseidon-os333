-- At most one successful claim_submissions row per order (submitted or accepted).
-- Failed/error submissions may retry; new rows with status error are allowed.

CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_submissions_one_success_per_order
    ON claim_submissions (order_id)
    WHERE status IN ('submitted', 'accepted');
