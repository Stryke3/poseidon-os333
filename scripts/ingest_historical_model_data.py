#!/usr/bin/env python3
"""
Load services/trident/Historical_Model_Data into payment_outcomes (Trident training).

  POSEIDON_DATABASE_URL=postgresql://... \\
    python3 scripts/ingest_historical_model_data.py [--dry-run] [--replace] [--retrain-after]

--replace        Deletes existing rows with source=historical_model_data before insert.
--retrain-after  HTTP POST to TRIDENT_API_URL/api/v1/trident/retrain after rows are inserted.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


async def _run(dry_run: bool, replace: bool, retrain_after: bool) -> int:
    sys.path.insert(0, str(REPO / "services" / "trident"))
    sys.path.insert(0, str(REPO / "services" / "shared"))

    from psycopg_pool import AsyncConnectionPool  # noqa: PLC0415

    from historical_training_ingest import (  # noqa: PLC0415
        ingest_historical_model_data_to_payment_outcomes,
    )

    url = os.getenv("POSEIDON_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        print("Set POSEIDON_DATABASE_URL or DATABASE_URL", file=sys.stderr)
        return 1

    base = REPO / "services" / "trident" / "Historical_Model_Data"
    pool = AsyncConnectionPool(conninfo=url, min_size=1, max_size=2, kwargs={"autocommit": True}, open=False)
    await pool.open()
    try:
        result = await ingest_historical_model_data_to_payment_outcomes(
            pool,
            base_dir=base,
            dry_run=dry_run,
            replace=replace,
        )
    finally:
        await pool.close()

    print(result)

    if retrain_after and not dry_run and int(result.get("rows_inserted") or 0) > 0:
        import urllib.error
        import urllib.request

        base = (os.getenv("TRIDENT_API_URL") or os.getenv("TRIDENT_SERVICE_URL") or "http://127.0.0.1:8002").rstrip(
            "/"
        )
        req = urllib.request.Request(f"{base}/api/v1/trident/retrain", method="POST")
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                body = resp.read()[:500].decode("utf-8", errors="replace")
                print({"retrain_http_status": resp.status, "retrain_body_preview": body})
        except urllib.error.HTTPError as exc:
            preview = exc.read()[:500].decode("utf-8", errors="replace") if exc.fp else ""
            print({"retrain_http_status": exc.code, "retrain_body_preview": preview}, file=sys.stderr)
            return 1
        except Exception as exc:
            print({"retrain_error": str(exc)}, file=sys.stderr)
            return 1

    return 0 if "error" not in result else 1


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--replace", action="store_true")
    p.add_argument("--retrain-after", action="store_true", help="Call Trident /api/v1/trident/retrain after insert")
    args = p.parse_args()
    raise SystemExit(asyncio.run(_run(args.dry_run, args.replace, args.retrain_after)))


if __name__ == "__main__":
    main()
