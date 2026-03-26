#!/usr/bin/env python3
"""
WHT workspace > data room pull pipeline.

What it does:
1) Pull CSV/XLSX records from a data-room folder and import to Core (/orders/import).
2) Deduplicate by relying on Core import dedup and collecting skipped/ambiguous outcomes.
3) Attach discovered documents to matched patient orders so they appear in patient charts.
4) Emit a review queue JSON file for duplicates, unmatched docs, and questions.

Intended schedule:
- morning run
- nightly run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Reuse existing robust row parsers/mappers.
from ingest_lvco import (  # type: ignore
    collect_files,
    load_dotenv,
    map_rows_to_orders,
    parse_csv_rows,
    parse_xlsx_rows,
)


DOC_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".tiff",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_name(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()
    return re.sub(r"\s+", " ", cleaned)


def guess_patient_name_from_filename(path: Path) -> str:
    stem = path.stem
    stem = re.sub(r"\b(19|20)\d{2}[-_]\d{2}[-_]\d{2}\b", " ", stem)
    stem = re.sub(r"\b(chart|docs?|document|record|intake|order|claim|wht)\b", " ", stem, flags=re.I)
    stem = re.sub(r"[_\-]+", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    return stem


def http_json(method: str, url: str, headers: dict[str, str], body: dict[str, Any] | None = None, timeout: int = 120) -> tuple[int, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        try:
            detail: Any = json.loads(err_body)
        except json.JSONDecodeError:
            detail = err_body
        raise RuntimeError(f"HTTP {e.code}: {detail}") from e


def _core_host_header() -> str:
    return os.getenv("CORE_HOST_HEADER", "").strip()


def with_core_host(headers: dict[str, str]) -> dict[str, str]:
    host = _core_host_header()
    if host:
        merged = dict(headers)
        merged["Host"] = host
        return merged
    return headers


def get_core_token(base: str) -> str:
    existing = os.getenv("POSEIDON_ACCESS_TOKEN", "").strip()
    if existing:
        return existing
    email = os.getenv("POSEIDON_INGEST_EMAIL", "").strip() or os.getenv("CORE_API_EMAIL", "").strip()
    password = os.getenv("POSEIDON_INGEST_PASSWORD", "").strip() or os.getenv("CORE_API_PASSWORD", "").strip()
    if not email or not password:
        raise RuntimeError("Missing ingest credentials (POSEIDON_INGEST_EMAIL/POSEIDON_INGEST_PASSWORD or CORE_API_EMAIL/CORE_API_PASSWORD).")
    _, payload = http_json(
        "POST",
        f"{base.rstrip('/')}/auth/login",
        with_core_host({"Content-Type": "application/json"}),
        {"email": email, "password": password},
        timeout=60,
    )
    token = (payload or {}).get("access_token")
    if not token:
        raise RuntimeError(f"Core auth response missing access_token: {payload}")
    return str(token)


def parse_orders_from_spreadsheets(paths: list[Path]) -> list[dict[str, Any]]:
    orders: list[dict[str, Any]] = []
    for path in paths:
        suffix = path.suffix.lower()
        if suffix == ".csv":
            rows = parse_csv_rows(path)
        elif suffix in {".xlsx", ".xlsm"}:
            rows = parse_xlsx_rows(path)
        else:
            continue
        mapped = map_rows_to_orders(rows)
        for order in mapped:
            order["source_reference"] = path.name
            order["source_channel"] = "wht_data_room"
        orders.extend(mapped)
    return orders


def fetch_recent_orders(base: str, token: str, limit: int = 500) -> list[dict[str, Any]]:
    status, payload = http_json(
        "GET",
        f"{base.rstrip('/')}/orders?limit={limit}",
        with_core_host({"Authorization": f"Bearer {token}", "Content-Type": "application/json"}),
    )
    if status != 200:
        return []
    return list((payload or {}).get("orders") or [])


def upload_order_document(base: str, token: str, order_id: str, doc_path: Path, doc_type: str = "chart_notes") -> tuple[bool, str]:
    boundary = f"----poseidon-{datetime.now(timezone.utc).timestamp()}".replace(".", "")
    filename = doc_path.name
    content = doc_path.read_bytes()
    mime_type = "application/pdf" if doc_path.suffix.lower() == ".pdf" else "application/octet-stream"

    parts: list[bytes] = []
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(b'Content-Disposition: form-data; name="doc_type"\r\n\r\n')
    parts.append(f"{doc_type}\r\n".encode())
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n".encode()
    )
    parts.append(content)
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)

    req = urllib.request.Request(
        f"{base.rstrip('/')}/api/v1/orders/{order_id}/documents",
        data=body,
        headers=with_core_host({
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            if resp.status in {200, 201}:
                return True, "uploaded"
            return False, f"unexpected_status:{resp.status}"
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:300]
        return False, f"http_{e.code}:{detail}"
    except Exception as exc:
        return False, str(exc)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run WHT data-room pull/import + chart doc consolidation")
    parser.add_argument("--mode", choices=["morning", "nightly"], default="morning")
    parser.add_argument("--data-room-dir", type=Path, default=None, help="Default: <repo>/data/wht-workspace/data-room")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / ".env")

    data_room = args.data_room_dir or Path(os.getenv("WHT_DATA_ROOM_DIR", str(root / "data" / "wht-workspace" / "data-room")))
    review_dir = root / "data" / "processed"
    review_dir.mkdir(parents=True, exist_ok=True)
    review_file = review_dir / f"wht_review_queue_{args.mode}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"

    if not data_room.exists():
        print(f"Data room not found: {data_room}", file=sys.stderr)
        sys.exit(1)

    base = os.getenv("CORE_BASE_URL", "http://localhost/api").rstrip("/")
    internal_key = os.getenv("INTERNAL_API_KEY", "").strip()
    if not args.dry_run and not internal_key:
        print("INTERNAL_API_KEY is required.", file=sys.stderr)
        sys.exit(1)

    spreadsheet_paths = collect_files(data_room, (".csv", ".xlsx", ".xlsm"))
    doc_paths: list[Path] = []
    for p in sorted(data_room.rglob("*")):
        if p.is_file() and p.suffix.lower() in DOC_EXTENSIONS:
            doc_paths.append(p)

    orders = parse_orders_from_spreadsheets(spreadsheet_paths)
    queue_items: list[dict[str, Any]] = []

    if args.dry_run:
        payload = {
            "status": "dry_run",
            "mode": args.mode,
            "timestamp": now_iso(),
            "data_room": str(data_room),
            "spreadsheet_files": [p.name for p in spreadsheet_paths],
            "document_files": [p.name for p in doc_paths],
            "orders_detected": len(orders),
        }
        review_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(json.dumps(payload, indent=2))
        return

    token = get_core_token(base)
    import_status, import_payload = http_json(
        "POST",
        f"{base}/orders/import",
        with_core_host({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "X-Internal-API-Key": internal_key,
        }),
        {"orders": orders},
        timeout=300,
    )
    if import_status not in {200, 201}:
        print(f"Import failed: {import_status}", file=sys.stderr)
        sys.exit(1)

    results = list((import_payload or {}).get("results") or [])
    created_by_name: dict[str, str] = {}
    order_ids: set[str] = set()
    for item in results:
        idx = item.get("index")
        if isinstance(idx, int) and 0 <= idx < len(orders):
            patient_name = orders[idx].get("patient_name") or ""
            if item.get("status") == "created" and item.get("order_id"):
                oid = str(item["order_id"])
                order_ids.add(oid)
                created_by_name[normalize_name(str(patient_name))] = oid
            elif item.get("status") == "skipped_duplicate":
                queue_items.append(
                    {
                        "kind": "duplicate_order",
                        "patient_name": patient_name,
                        "detail": item,
                        "review_required": True,
                    }
                )

    # Build fallback name->order map from recent orders.
    recent_orders = fetch_recent_orders(base, token, limit=500)
    for row in recent_orders:
        name = normalize_name(str(row.get("patient_name") or ""))
        oid = str(row.get("id") or "")
        if name and oid and name not in created_by_name:
            created_by_name[name] = oid

    docs_uploaded = 0
    for doc in doc_paths:
        guessed_name = normalize_name(guess_patient_name_from_filename(doc))
        if not guessed_name:
            queue_items.append(
                {
                    "kind": "unmatched_document",
                    "file": str(doc),
                    "reason": "Could not infer patient name from filename",
                    "review_required": True,
                }
            )
            continue
        matched_order = created_by_name.get(guessed_name)
        if not matched_order:
            queue_items.append(
                {
                    "kind": "unmatched_document",
                    "file": str(doc),
                    "patient_name_guess": guessed_name,
                    "reason": "No matching patient/order found",
                    "review_required": True,
                }
            )
            continue
        ok, detail = upload_order_document(base, token, matched_order, doc, doc_type="chart_notes")
        if ok:
            docs_uploaded += 1
        else:
            queue_items.append(
                {
                    "kind": "document_upload_error",
                    "file": str(doc),
                    "order_id": matched_order,
                    "reason": detail,
                    "review_required": True,
                }
            )

    report = {
        "status": "ok",
        "mode": args.mode,
        "timestamp": now_iso(),
        "data_room": str(data_room),
        "spreadsheet_files": [p.name for p in spreadsheet_paths],
        "document_files": [p.name for p in doc_paths],
        "orders_submitted": len(orders),
        "import_summary": {
            "created": import_payload.get("created", 0),
            "failed": import_payload.get("failed", 0),
            "skipped_duplicate": import_payload.get("skipped_duplicate", 0),
        },
        "documents_uploaded": docs_uploaded,
        "review_queue_count": len(queue_items),
        "review_queue": queue_items,
    }
    review_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
