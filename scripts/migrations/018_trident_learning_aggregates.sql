-- =============================================================================
-- 018_trident_learning_aggregates.sql
-- Versioned learned aggregates produced by the historical bootstrap pipeline.
--
-- Two new tables:
--   trident_history_bootstrap_runs — ledger of every bootstrap run (idempotent
--     on run_id); lets ops inspect which versioned aggregate set is current.
--   trident_learned_aggregates — versioned rows per (version_id, feature combo).
--     Queried by _trident_score() to apply a learned historical adjustment on
--     top of the rule-based baseline.
--
-- Idempotent. Safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS trident_history_bootstrap_runs (
    run_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'running', -- 'running','success','partial','failed'
    source_snapshot JSONB,                           -- counts of source tables read
    records_written INTEGER NOT NULL DEFAULT 0,
    chunk_size      INTEGER,
    error_detail    TEXT,
    triggered_by    TEXT                             -- user id or 'scheduler' or 'manual_cli'
);

CREATE INDEX IF NOT EXISTS ix_trident_bootstrap_status
    ON trident_history_bootstrap_runs(status, started_at DESC);

-- Feature-combination aggregate store. Versioned per bootstrap run so scoring
-- can fall back to a known-good version if the latest run is incomplete.
CREATE TABLE IF NOT EXISTS trident_learned_aggregates (
    id              BIGSERIAL PRIMARY KEY,
    version_id      UUID NOT NULL REFERENCES trident_history_bootstrap_runs(run_id) ON DELETE CASCADE,
    org_id          UUID,
    feature_scope   TEXT NOT NULL,                   -- 'payer_hcpcs','payer_dx','payer_physician','payer_site','payer_reason','payer_appeal','payer_lag','hcpcs_dx'
    payer_id        TEXT,
    hcpcs_code      TEXT,
    icd10_code      TEXT,
    physician_id    TEXT,
    site_code       TEXT,                            -- e.g. billing_zip / facility identifier
    carc_code       TEXT,                            -- denial reason category key
    sample_count    INTEGER NOT NULL DEFAULT 0,
    denial_count    INTEGER NOT NULL DEFAULT 0,
    paid_count      INTEGER NOT NULL DEFAULT 0,
    appeal_count    INTEGER NOT NULL DEFAULT 0,
    appeal_wins     INTEGER NOT NULL DEFAULT 0,
    prior_auth_required_count INTEGER NOT NULL DEFAULT 0,
    denial_rate     NUMERIC(6,4),
    appeal_win_rate NUMERIC(6,4),
    avg_paid        NUMERIC(12,2),
    median_paid     NUMERIC(12,2),
    avg_days_to_pay NUMERIC(8,2),                    -- payment lag in days
    collection_probability NUMERIC(6,4),             -- sample_count > 0 : (paid_count / sample_count)
    extra           JSONB,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_trident_learned_aggregates_lookup
    ON trident_learned_aggregates(feature_scope, payer_id, hcpcs_code, icd10_code, physician_id, site_code, carc_code);

CREATE INDEX IF NOT EXISTS ix_trident_learned_aggregates_version
    ON trident_learned_aggregates(version_id);

CREATE INDEX IF NOT EXISTS ix_trident_learned_aggregates_payer_hcpcs
    ON trident_learned_aggregates(payer_id, hcpcs_code)
    WHERE feature_scope = 'payer_hcpcs';

-- A view that exposes the most recent successful version as the canonical
-- set. Scoring code reads through this view.
CREATE OR REPLACE VIEW trident_learned_aggregates_current AS
SELECT a.*
FROM trident_learned_aggregates a
JOIN (
    SELECT run_id
    FROM trident_history_bootstrap_runs
    WHERE status IN ('success','partial')
    ORDER BY completed_at DESC NULLS LAST, started_at DESC
    LIMIT 1
) latest ON latest.run_id = a.version_id;

-- Bump schema_version.
INSERT INTO schema_version (id, version, updated_at)
VALUES (1, 18, NOW())
ON CONFLICT (id) DO UPDATE
    SET version = GREATEST(schema_version.version, EXCLUDED.version),
        updated_at = NOW();

COMMIT;
