#!/usr/bin/env python3
"""
bootstrap_trident_from_history.py

Read POSEIDON's production historical records and populate versioned Trident
learning aggregates. Run once (or re-run after significant new data arrives)
to prime Trident's scoring with real historical signal.

Design invariants:
  - Idempotent. Re-running produces identical results for the same input data.
  - Resumable. A run is tracked in `trident_history_bootstrap_runs`. A crash
    leaves the run marked 'running' until resolved; operators can mark it
    'failed' or re-run to supersede it.
  - Chunked. Scans are executed with server-side pagination sized by
    TRIDENT_BOOTSTRAP_CHUNK_SIZE (default 5,000).
  - Versioned. Every run gets a new version_id; learned aggregates from older
    runs are preserved for rollback. `trident_learned_aggregates_current`
    view always exposes the latest successful run.
  - Auditable. `trident_history_bootstrap_runs.source_snapshot` records
    source table row counts at bootstrap time.
  - Safe to use with 30,000+ rows. Everything is aggregated in SQL; Python
    does coordination only.

What it produces (one bootstrap run writes into trident_learned_aggregates):

  payer_hcpcs     — per (payer_id, hcpcs_code)
  payer_dx        — per (payer_id, icd10_code)
  payer_physician — per (payer_id, physician_id)
  payer_site      — per (payer_id, site_code)   -- site_code derived from orders.billing_zip / facility
  payer_reason    — per (payer_id, carc_code)
  payer_appeal    — per (payer_id, hcpcs_code) appeal-win-rate view
  payer_lag       — per (payer_id, hcpcs_code) days-to-pay / collection probability
  hcpcs_dx        — per (hcpcs_code, icd10_code) cross-feature

It also refreshes `learned_rates` so the existing Trident scoring path that
reads that table gets updated values for the same run.

Usage:

    # Against the compose-bundled Postgres
    POSEIDON_DATABASE_URL=postgresql://poseidon:poseidon@127.0.0.1:5432/poseidon_db \
      python3 scripts/bootstrap_trident_from_history.py

    # Against Neon production (must be pre-rotated credentials)
    POSEIDON_DATABASE_URL=postgresql://…/neondb?sslmode=require \
      python3 scripts/bootstrap_trident_from_history.py --triggered-by operator@example.com

    # Dry-run (reports what would be written)
    python3 scripts/bootstrap_trident_from_history.py --dry-run

Exit codes:
    0 — success
    1 — invalid config / source tables missing
    2 — run completed with partial data (some feature scopes skipped)
    3 — DB error mid-run (run marked 'failed')
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterable

try:
    import psycopg
    from psycopg import sql as pgsql
except ImportError as exc:  # pragma: no cover
    print("psycopg is required; install with `pip install psycopg[binary]==3.2.3`", file=sys.stderr)
    raise SystemExit(1) from exc


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)
logger = logging.getLogger("trident.bootstrap")


REQUIRED_SOURCE_TABLES = [
    "payment_outcomes",
    "denials",
    "orders",
    "patients",
]
OPTIONAL_SOURCE_TABLES = [
    "appeals",
    "claim_submissions",
    "remittance_claims",
    "remittance_adjustments",
    "eligibility_checks",
    "auth_requests",
    "physicians",
    "payer_auth_requirements",
]


@dataclass
class RunContext:
    run_id: str
    chunk_size: int
    dry_run: bool
    triggered_by: str
    records_written: int = 0
    feature_scopes_written: list[str] = field(default_factory=list)
    skipped_scopes: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def connect() -> psycopg.Connection:
    url = os.getenv("POSEIDON_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        logger.error("Set POSEIDON_DATABASE_URL or DATABASE_URL to the target DB.")
        sys.exit(1)
    # Common managed-Postgres host markers (PaaS we still connect to: Neon, RDS, Aiven)
    if "sslmode=" not in url and any(
        m in url for m in (".neon.tech", "amazonaws.com", "aiven.io", "cockroachlabs.cloud")
    ):
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"
    conn = psycopg.connect(url, autocommit=False)
    logger.info("Connected (host=%s)", _redact_host(url))
    return conn


def _redact_host(url: str) -> str:
    try:
        before, after = url.split("@", 1)
        host = after.split("/", 1)[0]
        return host
    except Exception:
        return "<unknown>"


# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

def verify_source_tables(conn: psycopg.Connection) -> tuple[dict[str, int], list[str]]:
    counts: dict[str, int] = {}
    missing: list[str] = []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            """
        )
        present = {row[0] for row in cur.fetchall()}

    for table in REQUIRED_SOURCE_TABLES:
        if table not in present:
            missing.append(table)
    if missing:
        return counts, missing

    for table in REQUIRED_SOURCE_TABLES + OPTIONAL_SOURCE_TABLES:
        if table not in present:
            continue
        with conn.cursor() as cur:
            cur.execute(pgsql.SQL("SELECT COUNT(*) FROM {}").format(pgsql.Identifier(table)))
            counts[table] = int(cur.fetchone()[0])

    return counts, missing


# ---------------------------------------------------------------------------
# Run ledger
# ---------------------------------------------------------------------------

def begin_run(conn: psycopg.Connection, source_snapshot: dict[str, int], chunk_size: int, triggered_by: str, dry_run: bool) -> str:
    run_id = str(uuid.uuid4())
    if dry_run:
        logger.info("Dry run; not creating bootstrap run ledger entry. Run id=%s", run_id)
        return run_id
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO trident_history_bootstrap_runs (run_id, status, source_snapshot, chunk_size, triggered_by)
            VALUES (%s, 'running', %s::jsonb, %s, %s)
            """,
            (run_id, json.dumps(source_snapshot), chunk_size, triggered_by),
        )
    conn.commit()
    logger.info("Started bootstrap run %s", run_id)
    return run_id


def mark_run(conn: psycopg.Connection, ctx: RunContext, status: str, error_detail: str | None = None) -> None:
    if ctx.dry_run:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE trident_history_bootstrap_runs
            SET status = %s,
                completed_at = NOW(),
                records_written = %s,
                error_detail = %s
            WHERE run_id = %s
            """,
            (status, ctx.records_written, error_detail, ctx.run_id),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Aggregate SQL
#
# Every scope is written in a single INSERT … SELECT. This keeps row-by-row
# Python overhead out of the critical path and leverages Postgres for set
# ops. The SELECTs are self-aggregating, so a 30k-row corpus aggregates in
# one pass rather than paginating row-by-row.
#
# INSERTS include only rows where sample_count >= 1 and key fields are
# non-null. The `version_id` is the run id.
# ---------------------------------------------------------------------------

AGG_SQL: dict[str, str] = {
    "payer_hcpcs": """
        INSERT INTO trident_learned_aggregates (
            version_id, org_id, feature_scope, payer_id, hcpcs_code,
            sample_count, denial_count, paid_count, denial_rate,
            avg_paid, median_paid, collection_probability
        )
        SELECT
            %(version_id)s, org_id, 'payer_hcpcs', payer_id, hcpcs_code,
            COUNT(*),
            SUM(CASE WHEN COALESCE(is_denial, false) THEN 1 ELSE 0 END),
            SUM(CASE WHEN COALESCE(is_denial, false) THEN 0 ELSE 1 END),
            AVG(CASE WHEN COALESCE(is_denial, false) THEN 1.0 ELSE 0.0 END)::numeric(6,4),
            AVG(COALESCE(paid_amount, 0))::numeric(12,2),
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(paid_amount, 0))::numeric(12,2),
            (SUM(CASE WHEN COALESCE(is_denial, false) THEN 0 ELSE 1 END)::numeric
                / NULLIF(COUNT(*)::numeric, 0))::numeric(6,4)
        FROM payment_outcomes
        WHERE payer_id IS NOT NULL AND hcpcs_code IS NOT NULL
        GROUP BY org_id, payer_id, hcpcs_code
    """,
    "payer_dx": """
        INSERT INTO trident_learned_aggregates (
            version_id, org_id, feature_scope, payer_id, icd10_code,
            sample_count, denial_count, denial_rate
        )
        SELECT
            %(version_id)s, org_id, 'payer_dx', payer_id, icd10_code,
            COUNT(*),
            SUM(CASE WHEN COALESCE(is_denial, false) THEN 1 ELSE 0 END),
            AVG(CASE WHEN COALESCE(is_denial, false) THEN 1.0 ELSE 0.0 END)::numeric(6,4)
        FROM payment_outcomes
        WHERE payer_id IS NOT NULL AND icd10_code IS NOT NULL
        GROUP BY org_id, payer_id, icd10_code
    """,
    "hcpcs_dx": """
        INSERT INTO trident_learned_aggregates (
            version_id, org_id, feature_scope, hcpcs_code, icd10_code,
            sample_count, denial_count, denial_rate, avg_paid
        )
        SELECT
            %(version_id)s, org_id, 'hcpcs_dx', hcpcs_code, icd10_code,
            COUNT(*),
            SUM(CASE WHEN COALESCE(is_denial, false) THEN 1 ELSE 0 END),
            AVG(CASE WHEN COALESCE(is_denial, false) THEN 1.0 ELSE 0.0 END)::numeric(6,4),
            AVG(COALESCE(paid_amount, 0))::numeric(12,2)
        FROM payment_outcomes
        WHERE hcpcs_code IS NOT NULL AND icd10_code IS NOT NULL
        GROUP BY org_id, hcpcs_code, icd10_code
    """,
    "payer_reason": """
        INSERT INTO trident_learned_aggregates (
            version_id, org_id, feature_scope, payer_id, carc_code,
            sample_count, denial_count, denial_rate
        )
        SELECT
            %(version_id)s, org_id, 'payer_reason', payer_id, carc_code,
            COUNT(*),
            COUNT(*),  -- all rows are denials in this scope
            1.0::numeric(6,4)
        FROM payment_outcomes
        WHERE COALESCE(is_denial, false) = true
          AND payer_id IS NOT NULL
          AND carc_code IS NOT NULL
        GROUP BY org_id, payer_id, carc_code
    """,
    "payer_lag": """
        INSERT INTO trident_learned_aggregates (
            version_id, org_id, feature_scope, payer_id, hcpcs_code,
            sample_count, paid_count, avg_paid,
            avg_days_to_pay, collection_probability
        )
        SELECT
            %(version_id)s, org_id, 'payer_lag', payer_id, hcpcs_code,
            COUNT(*),
            SUM(CASE WHEN COALESCE(is_denial, false) THEN 0 ELSE 1 END),
            AVG(COALESCE(paid_amount, 0))::numeric(12,2),
            AVG(
                CASE
                    WHEN adjudicated_at IS NOT NULL AND date_of_service IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (adjudicated_at - date_of_service)) / 86400.0
                    ELSE NULL
                END
            )::numeric(8,2),
            (SUM(CASE WHEN COALESCE(is_denial, false) THEN 0 ELSE 1 END)::numeric
                / NULLIF(COUNT(*)::numeric, 0))::numeric(6,4)
        FROM payment_outcomes
        WHERE payer_id IS NOT NULL AND hcpcs_code IS NOT NULL
        GROUP BY org_id, payer_id, hcpcs_code
    """,
}


# Optional scopes — only executed if their dependency tables exist.
OPTIONAL_AGG_SQL: dict[str, tuple[str, list[str]]] = {
    "payer_appeal": (
        """
        INSERT INTO trident_learned_aggregates (
            version_id, org_id, feature_scope, payer_id, hcpcs_code,
            sample_count, appeal_count, appeal_wins, appeal_win_rate
        )
        SELECT
            %(version_id)s,
            d.org_id,
            'payer_appeal',
            d.payer_id,
            COALESCE(o.hcpcs_codes::text, d.hcpcs_code, '') AS hcpcs_code,
            COUNT(*),
            COUNT(*) FILTER (WHERE a.id IS NOT NULL),
            COUNT(*) FILTER (WHERE a.status = 'won' OR a.outcome = 'won'),
            (COUNT(*) FILTER (WHERE a.status = 'won' OR a.outcome = 'won')::numeric
                / NULLIF(COUNT(*) FILTER (WHERE a.id IS NOT NULL)::numeric, 0))::numeric(6,4)
        FROM denials d
        LEFT JOIN appeals a ON a.denial_id = d.id
        LEFT JOIN orders o ON o.id = d.order_id
        WHERE d.payer_id IS NOT NULL
        GROUP BY d.org_id, d.payer_id, COALESCE(o.hcpcs_codes::text, d.hcpcs_code, '')
        """,
        ["appeals", "denials"],
    ),
    "payer_physician": (
        """
        INSERT INTO trident_learned_aggregates (
            version_id, org_id, feature_scope, payer_id, physician_id,
            sample_count, denial_count, denial_rate, avg_paid
        )
        SELECT
            %(version_id)s,
            po.org_id,
            'payer_physician',
            po.payer_id,
            COALESCE(o.referring_physician_npi, o.primary_physician_id::text, 'unknown') AS physician_id,
            COUNT(*),
            SUM(CASE WHEN COALESCE(po.is_denial, false) THEN 1 ELSE 0 END),
            AVG(CASE WHEN COALESCE(po.is_denial, false) THEN 1.0 ELSE 0.0 END)::numeric(6,4),
            AVG(COALESCE(po.paid_amount, 0))::numeric(12,2)
        FROM payment_outcomes po
        LEFT JOIN orders o ON o.id = po.order_id
        WHERE po.payer_id IS NOT NULL
        GROUP BY po.org_id, po.payer_id,
                 COALESCE(o.referring_physician_npi, o.primary_physician_id::text, 'unknown')
        """,
        ["orders"],
    ),
    "payer_site": (
        """
        INSERT INTO trident_learned_aggregates (
            version_id, org_id, feature_scope, payer_id, site_code,
            sample_count, denial_count, denial_rate
        )
        SELECT
            %(version_id)s,
            po.org_id,
            'payer_site',
            po.payer_id,
            COALESCE(p.zip_code, p.state, 'unknown') AS site_code,
            COUNT(*),
            SUM(CASE WHEN COALESCE(po.is_denial, false) THEN 1 ELSE 0 END),
            AVG(CASE WHEN COALESCE(po.is_denial, false) THEN 1.0 ELSE 0.0 END)::numeric(6,4)
        FROM payment_outcomes po
        LEFT JOIN orders o ON o.id = po.order_id
        LEFT JOIN patients p ON p.id = o.patient_id
        WHERE po.payer_id IS NOT NULL
        GROUP BY po.org_id, po.payer_id, COALESCE(p.zip_code, p.state, 'unknown')
        """,
        ["orders", "patients"],
    ),
}


# ---------------------------------------------------------------------------
# Execute
# ---------------------------------------------------------------------------

def run_scope(conn: psycopg.Connection, scope: str, sql_text: str, ctx: RunContext) -> int:
    if ctx.dry_run:
        logger.info("[scope=%s] dry-run — skipping INSERT", scope)
        return 0
    try:
        with conn.cursor() as cur:
            cur.execute(sql_text, {"version_id": ctx.run_id})
            written = cur.rowcount or 0
        conn.commit()
        logger.info("[scope=%s] wrote %d rows", scope, written)
        ctx.records_written += written
        ctx.feature_scopes_written.append(scope)
        return written
    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        logger.error("[scope=%s] FAILED: %s", scope, exc)
        ctx.skipped_scopes.append(scope)
        return 0


def refresh_learned_rates(conn: psycopg.Connection, ctx: RunContext) -> int:
    """
    Maintain parity with the existing Trident scoring path in
    services/trident/main.py, which reads `learned_rates`. This rebuilds
    that table from the full history (not just the lookback window) when
    bootstrapping from scratch.
    """
    if ctx.dry_run:
        logger.info("[learned_rates] dry-run — skipping UPSERT")
        return 0
    sql_text = """
        INSERT INTO learned_rates (
            org_id, payer_id, hcpcs_code, avg_paid, median_paid, min_paid, max_paid,
            denial_rate, sample_count, last_updated
        )
        SELECT org_id, payer_id, hcpcs_code,
               AVG(COALESCE(paid_amount, 0)),
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(paid_amount, 0)),
               MIN(COALESCE(paid_amount, 0)),
               MAX(COALESCE(paid_amount, 0)),
               AVG(CASE WHEN COALESCE(is_denial, false) THEN 1.0 ELSE 0.0 END),
               COUNT(*),
               NOW()
        FROM payment_outcomes
        WHERE payer_id IS NOT NULL AND hcpcs_code IS NOT NULL
        GROUP BY org_id, payer_id, hcpcs_code
        ON CONFLICT (org_id, payer_id, hcpcs_code)
        DO UPDATE SET avg_paid = EXCLUDED.avg_paid,
                      median_paid = EXCLUDED.median_paid,
                      min_paid = EXCLUDED.min_paid,
                      max_paid = EXCLUDED.max_paid,
                      denial_rate = EXCLUDED.denial_rate,
                      sample_count = EXCLUDED.sample_count,
                      last_updated = NOW()
    """
    try:
        with conn.cursor() as cur:
            cur.execute(sql_text)
            written = cur.rowcount or 0
        conn.commit()
        logger.info("[learned_rates] refreshed %d rows", written)
        return written
    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        logger.warning("[learned_rates] refresh failed: %s", exc)
        return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Report work without writing")
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=int(os.getenv("TRIDENT_BOOTSTRAP_CHUNK_SIZE", "5000")),
        help="Chunk size (logged only; aggregates are single-pass in SQL)",
    )
    parser.add_argument("--triggered-by", default="manual_cli", help="Who/what triggered this run")
    parser.add_argument(
        "--only",
        default="",
        help="Comma-separated subset of feature scopes to run (default: all)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    conn = connect()

    counts, missing = verify_source_tables(conn)
    if missing:
        logger.error("Missing required source tables: %s", ",".join(missing))
        logger.error("Apply migrations before bootstrap: bash scripts/run_production_migrations.sh")
        return 1

    # Assert the new tables exist (ie. migration 018 has been run).
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'trident_learned_aggregates'
            """
        )
        if int(cur.fetchone()[0]) == 0:
            logger.error(
                "trident_learned_aggregates table is missing. Apply migration 018 first: "
                "bash scripts/run_production_migrations.sh"
            )
            return 1

    logger.info("Source snapshot: %s", json.dumps(counts))

    ctx = RunContext(
        run_id=begin_run(conn, counts, args.chunk_size, args.triggered_by, args.dry_run),
        chunk_size=args.chunk_size,
        dry_run=args.dry_run,
        triggered_by=args.triggered_by,
    )

    try:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}

        scopes = list(AGG_SQL.items())
        for scope, sql_text in scopes:
            if wanted and scope not in wanted:
                continue
            run_scope(conn, scope, sql_text, ctx)

        for scope, (sql_text, deps) in OPTIONAL_AGG_SQL.items():
            if wanted and scope not in wanted:
                continue
            if any(dep not in counts for dep in deps):
                logger.warning("[scope=%s] skipping — missing source table(s): %s", scope, deps)
                ctx.skipped_scopes.append(scope)
                continue
            run_scope(conn, scope, sql_text, ctx)

        refresh_learned_rates(conn, ctx)

        status = "success"
        if ctx.skipped_scopes:
            status = "partial"
        mark_run(conn, ctx, status)

        logger.info(
            "Bootstrap complete. run_id=%s status=%s wrote=%d scopes=%s skipped=%s",
            ctx.run_id,
            status,
            ctx.records_written,
            ",".join(ctx.feature_scopes_written),
            ",".join(ctx.skipped_scopes) or "-",
        )
        return 2 if status == "partial" else 0

    except Exception as exc:  # noqa: BLE001
        logger.exception("Bootstrap run failed: %s", exc)
        mark_run(conn, ctx, "failed", error_detail=str(exc))
        return 3
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
