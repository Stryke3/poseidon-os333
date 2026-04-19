# =============================================================================
# Historical_Model_Data → payment_outcomes (Trident sklearn training source)
# =============================================================================
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

# Shared denial / outcome insert helpers (same DB pool as other services)
_shared_dir = Path("/app/shared") if Path("/app/shared").exists() else (Path(__file__).resolve().parent.parent / "shared")
sys.path.insert(0, str(_shared_dir))

from denial_csv_ingest import (  # noqa: E402
    PreparedOutcome,
    bulk_insert_payment_outcomes,
    fetch_default_org_id,
    norm_key,
    parse_csv_bytes,
    prepare_payment_outcome_row,
)

from data_normalization import HistoricalDataNormalizer  # noqa: E402

RECORD_SOURCE = "historical_model_data"


def _payer_id_slug(name: str | None) -> str:
    s = re.sub(r"[^A-Z0-9]+", "_", (name or "UNKNOWN").upper()).strip("_")[:50]
    return s or "UNKNOWN"


def _fnum(x: Any) -> float:
    try:
        return float(x if x is not None else 0)
    except (TypeError, ValueError):
        return 0.0


def _infer_denial_charge_detail(rec: dict[str, Any]) -> bool:
    status = (rec.get("claim_status") or "").lower()
    if any(w in status for w in ("denial", "denied", "reject", "void", "suspend", "cancel")):
        return True
    paid = _fnum(rec.get("paid_amount"))
    billed = _fnum(rec.get("billed_amount"))
    balance = _fnum(rec.get("balance_amount"))
    adj = _fnum(rec.get("adjustment_amount"))
    if billed > 0 and paid == 0 and balance > 0:
        return True
    if billed > 0 and adj > 0 and paid < billed * 0.25:
        return True
    return False


def _charge_detail_to_flat(rec: dict[str, Any]) -> dict[str, Any]:
    payer = rec.get("payer_name") or ""
    return {
        "payer_id": _payer_id_slug(payer),
        "payer_name": payer or None,
        "hcpcs_code": rec.get("hcpcs_code"),
        "billed_amount": rec.get("billed_amount"),
        "paid_amount": rec.get("paid_amount") or 0.0,
        "is_denial": _infer_denial_charge_detail(rec),
        "claim_number": rec.get("claim_number"),
        "date_of_service": rec.get("date_of_service"),
        "denial_reason": rec.get("claim_status"),
    }


def _generic_xlsx_rows(path: Path) -> list[dict[str, Any]]:
    import openpyxl  # type: ignore

    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
    finally:
        wb.close()
    if not rows:
        return []
    headers = [norm_key(str(c) if c is not None else "") for c in rows[0]]
    out: list[dict[str, Any]] = []
    for r in rows[1:]:
        d: dict[str, Any] = {}
        for i, h in enumerate(headers):
            if not h:
                continue
            d[h] = r[i] if i < len(r) else None
        if any(v not in (None, "") for v in d.values()):
            out.append(d)
    return out


def _should_skip_path(path: Path) -> bool | str:
    if not path.is_file():
        return True
    name = path.name.lower()
    if name.startswith("."):
        return True
    if path.suffix.lower() in {".pdf", ".png", ".jpg", ".jpeg", ".crdownload", ".gsheet"}:
        return "non_tabular"
    if "__macosx" in path.parts:
        return True
    return False


async def ingest_historical_model_data_to_payment_outcomes(
    pool: Any,
    *,
    base_dir: Path,
    dry_run: bool = False,
    replace: bool = False,
) -> dict[str, Any]:
    """
    Walk Historical_Model_Data (recursive), parse tabular files, insert training rows into payment_outcomes.
    """
    if not base_dir.is_dir():
        return {"error": f"base_dir not found: {base_dir}", "rows_inserted": 0}

    normalizer = HistoricalDataNormalizer(base_dir)
    prepared: list[Any] = []
    skipped_flat = 0
    by_file: list[dict[str, Any]] = []
    files_seen = 0

    for path in sorted(base_dir.rglob("*")):
        skip = _should_skip_path(path)
        if skip is True:
            continue
        if skip == "non_tabular":
            by_file.append({"path": path.relative_to(base_dir).as_posix(), "skipped": "non_tabular_extension"})
            continue

        rel = path.relative_to(base_dir).as_posix()
        suffix = path.suffix.lower()
        file_prepared_before = len(prepared)

        if suffix == ".csv":
            files_seen += 1
            kind_for_report = "csv"
            raw_rows = parse_csv_bytes(path.read_bytes())
            eob_ref = f"historical:{rel}"
            for raw in raw_rows:
                pr = prepare_payment_outcome_row(
                    raw,
                    org_id=None,
                    eob_reference=eob_ref,
                    default_is_denial=True,
                    record_source=RECORD_SOURCE,
                )
                if pr is None:
                    skipped_flat += 1
                else:
                    prepared.append(pr)

        elif suffix in {".xlsx", ".xlsm"}:
            files_seen += 1
            nk = normalizer._dataset_kind(path.name)
            if nk == "charge_detail_report":
                kind_for_report = "charge_detail_report"
                block = normalizer.normalize_asset(rel)
                for rec in block["records"]:
                    flat = _charge_detail_to_flat(rec)
                    pr = prepare_payment_outcome_row(
                        flat,
                        org_id=None,
                        eob_reference=f"historical:{rel}",
                        default_is_denial=flat["is_denial"],
                        record_source=RECORD_SOURCE,
                    )
                    if pr is None:
                        skipped_flat += 1
                    else:
                        prepared.append(pr)
            elif nk == "ar_aging_report":
                by_file.append({"path": rel, "skipped": "ar_aging_no_hcpcs_line_items"})
                continue
            else:
                kind_for_report = "generic_xlsx"
                raw_rows = _generic_xlsx_rows(path)
                eob_ref = f"historical:{rel}"
                for raw in raw_rows:
                    pr = prepare_payment_outcome_row(
                        raw,
                        org_id=None,
                        eob_reference=eob_ref,
                        default_is_denial=True,
                        record_source=RECORD_SOURCE,
                    )
                    if pr is None:
                        skipped_flat += 1
                    else:
                        prepared.append(pr)
        else:
            continue

        inserted_here = len(prepared) - file_prepared_before
        by_file.append(
            {
                "path": rel,
                "suffix": suffix,
                "dataset_kind": kind_for_report,
                "rows_prepared": inserted_here,
            }
        )

    result: dict[str, Any] = {
        "base_dir": str(base_dir.resolve()),
        "dry_run": dry_run,
        "replace": replace,
        "files_seen": files_seen,
        "rows_prepared": len(prepared),
        "skipped_missing_payer_or_hcpcs": skipped_flat,
        "by_file": by_file,
    }

    if dry_run:
        result["rows_inserted"] = 0
        result["would_insert"] = len(prepared)
        return result

    if not prepared:
        result["rows_inserted"] = 0
        return result

    async with pool.connection() as conn:
        org_id = await fetch_default_org_id(conn)
        fixed: list[PreparedOutcome] = []
        for pr in prepared:
            v = list(pr.values)
            v[1] = org_id
            fixed.append(PreparedOutcome(values=tuple(v)))

        async with conn.transaction():
            if replace:
                async with conn.cursor() as cur:
                    await cur.execute("DELETE FROM payment_outcomes WHERE source = %s", (RECORD_SOURCE,))
            inserted = await bulk_insert_payment_outcomes(conn, fixed)

    result["rows_inserted"] = inserted
    result["org_id"] = org_id
    return result
