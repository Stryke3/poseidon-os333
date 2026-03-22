#!/usr/bin/env python3
"""
Ingest CSV / XLSX from data/lvco (or a given directory) into Core via POST /orders/import.

Requires:
  - INTERNAL_API_KEY (must match Core) on the request as X-Internal-API-Key
  - A Core user with create_orders (e.g. admin) via login, or POSEIDON_ACCESS_TOKEN

Environment (after optional .env load from repo root):
  CORE_BASE_URL     default http://localhost/api   (nginx → Core; paths /auth/login, /orders/import)
  INTERNAL_API_KEY  required
  POSEIDON_INGEST_EMAIL / POSEIDON_INGEST_PASSWORD  preferred for login
  CORE_API_EMAIL / CORE_API_PASSWORD                fallback (same names as dashboard dev fallback)
  POSEIDON_ACCESS_TOKEN                             if set, skip login

Optional XLSX: pip install openpyxl
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        if key and key not in os.environ:
            os.environ[key] = val


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def row_value(row: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        direct = row.get(key)
        if direct is not None and str(direct).strip():
            return str(direct).strip()
    return ""


def split_name(full_name: str) -> tuple[str, str]:
    trimmed = full_name.strip()
    if not trimmed:
        return "", "Unknown"
    if "," in trimmed:
        last, first = [p.strip() for p in trimmed.split(",", 1)]
        return first or "", last or "Unknown"
    parts = trimmed.split()
    return (parts[0] if parts else ""), (" ".join(parts[1:]) if len(parts) > 1 else "Unknown")


def normalize_dob(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        return "1970-01-01"
    # ISO-like
    if re.match(r"^\d{4}-\d{2}-\d{2}", trimmed):
        return trimmed[:10]
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$", trimmed)
    if m:
        mm, dd, yyyy = m.group(1), m.group(2), m.group(3)
        year = f"20{yyyy}" if len(yyyy) == 2 else yyyy
        return f"{year.zfill(4)}-{mm.zfill(2)}-{dd.zfill(2)}"
    return trimmed


def parse_csv_rows(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []
    reader = csv.reader(lines)
    rows_raw = list(reader)
    if not rows_raw:
        return []
    headers = [normalize_key(h) for h in rows_raw[0]]
    out: list[dict[str, Any]] = []
    for parts in rows_raw[1:]:
        row = dict(zip(headers, [(parts[i] if i < len(parts) else "") for i in range(len(headers))]))
        out.append(row)
    return out


def parse_xlsx_rows(path: Path) -> list[dict[str, Any]]:
    try:
        import openpyxl  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "XLSX requires openpyxl: pip install openpyxl\n"
            f"Original error: {exc}"
        ) from exc

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        header_row = next(rows_iter, None)
        if not header_row:
            return []
        headers = [normalize_key(str(c) if c is not None else "") for c in header_row]
        out: list[dict[str, Any]] = []
        for data in rows_iter:
            if data is None or all(v is None or str(v).strip() == "" for v in data):
                continue
            cells = [("" if v is None else str(v)).strip() for v in data]
            row = {
                headers[i]: cells[i] if i < len(cells) else ""
                for i in range(len(headers))
                if headers[i]
            }
            out.append(row)
        return out
    finally:
        wb.close()


def map_rows_to_orders(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    orders: list[dict[str, Any]] = []
    for raw in rows:
        row = {normalize_key(str(k)): v for k, v in raw.items()}

        patient_name = (
            row_value(row, ["patient_name", "patient", "patient_full_name", "name", "full_name"])
            or f"{row_value(row, ['first_name', 'firstname', 'first'])} "
            f"{row_value(row, ['last_name', 'lastname', 'last'])}".strip()
        )
        if not patient_name:
            continue

        name_parts = split_name(patient_name)
        hcpcs_raw = row_value(row, ["hcpcs", "hcpcs_code", "hcpcs_codes", "code"])
        diagnosis_raw = row_value(row, ["icd", "diagnosis_code", "diagnosis_codes", "dx"])
        cpt_fallback = row_value(row, ["cpt_code"])

        hcpcs_codes: list[str] | None
        if hcpcs_raw:
            hcpcs_codes = [x.strip().upper() for x in re.split(r"[\s,]+", hcpcs_raw) if x.strip()]
        elif cpt_fallback:
            hcpcs_codes = [x.strip().upper() for x in re.split(r"[\s,]+", cpt_fallback) if x.strip()]
        else:
            hcpcs_codes = None

        diagnosis_codes: list[str] | None
        if diagnosis_raw:
            diagnosis_codes = [
                x.strip().upper().replace(".", "")
                for x in re.split(r"[\s,]+", diagnosis_raw)
                if x.strip()
            ]
        else:
            icd_concat = " ".join(
                row_value(row, [k])
                for k in ["icd1_code", "icd2_code", "icd3_code", "icd4_code"]
                if row_value(row, [k])
            )
            if icd_concat.strip():
                diagnosis_codes = [
                    x.strip().upper().replace(".", "")
                    for x in re.split(r"[\s,]+", icd_concat.strip())
                    if x.strip()
                ]
            else:
                diagnosis_codes = None

        notes_extra = " | ".join(
            filter(
                None,
                [
                    row_value(row, ["notes", "note", "comments"]),
                    row_value(row, ["current_claim_status"]),
                    row_value(row, ["payment_type"]),
                    row_value(row, ["payment"]),
                ],
            )
        )

        order: dict[str, Any] = {
            "patient_name": patient_name,
            "first_name": row_value(row, ["first_name", "firstname", "first"]) or name_parts[0],
            "last_name": row_value(row, ["last_name", "lastname", "last"]) or name_parts[1],
            "dob": normalize_dob(row_value(row, ["dob", "date_of_birth", "birth_date"])),
            "email": row_value(row, ["email", "patient_email"]) or None,
            "insurance_id": row_value(
                row,
                [
                    "insurance_id",
                    "member_id",
                    "subscriber_id",
                    "patient_acct_no",
                    "claim_no",
                ],
            )
            or None,
            "payer": row_value(row, ["payer", "payer_name", "payer_name_2", "insurance"]) or None,
            "payer_id": row_value(row, ["payer_id", "payer_name", "payer_name_2"]) or None,
            "hcpcs": hcpcs_raw or cpt_fallback or None,
            "hcpcs_codes": hcpcs_codes,
            "icd": diagnosis_raw or None,
            "diagnosis_codes": diagnosis_codes,
            "npi": row_value(row, ["npi", "provider_npi"]) or None,
            "referring_physician_npi": row_value(row, ["referring_physician_npi", "referring_npi"]) or None,
            "priority": row_value(row, ["priority"]) or "standard",
            "notes": notes_extra or None,
            "source_channel": "lvco",
            "source_reference": None,
        }
        # Drop None email if empty string already handled
        if order["email"] == "":
            order["email"] = None
        orders.append(order)
    return orders


def http_json(
    method: str,
    url: str,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
    timeout: int = 120,
) -> tuple[int, Any]:
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


def get_token(base: str) -> str:
    existing = os.environ.get("POSEIDON_ACCESS_TOKEN", "").strip()
    if existing:
        return existing

    email = (
        os.environ.get("POSEIDON_INGEST_EMAIL", "").strip()
        or os.environ.get("CORE_API_EMAIL", "").strip()
    )
    password = (
        os.environ.get("POSEIDON_INGEST_PASSWORD", "").strip()
        or os.environ.get("CORE_API_PASSWORD", "").strip()
    )
    if not email or not password:
        print(
            "Set POSEIDON_INGEST_EMAIL / POSEIDON_INGEST_PASSWORD "
            "(or CORE_API_EMAIL / CORE_API_PASSWORD), or POSEIDON_ACCESS_TOKEN.",
            file=sys.stderr,
        )
        sys.exit(1)

    url = f"{base.rstrip('/')}/auth/login"
    _, payload = http_json(
        "POST",
        url,
        {"Content-Type": "application/json"},
        {"email": email, "password": password},
    )
    token = payload.get("access_token")
    if not token:
        print(f"Login response missing access_token: {payload}", file=sys.stderr)
        sys.exit(1)
    return str(token)


def collect_files(directory: Path, extensions: tuple[str, ...]) -> list[Path]:
    files: list[Path] = []
    for ext in extensions:
        files.extend(sorted(directory.glob(f"*{ext}")))
    return sorted({p.resolve() for p in files})


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest data/lvco CSV/XLSX into Core /orders/import")
    parser.add_argument(
        "--dir",
        type=Path,
        default=None,
        help="Directory containing .csv / .xlsx (default: <repo>/data/lvco)",
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        help="Single file to ingest",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and print order count only; no API calls",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / ".env")

    data_dir = args.dir or (root / "data" / "lvco")
    internal_key = os.environ.get("INTERNAL_API_KEY", "").strip()
    base = os.environ.get("CORE_BASE_URL", "http://localhost/api").rstrip("/")

    if args.file:
        paths = [args.file.resolve()]
        for p in paths:
            if not p.is_file():
                print(f"Not a file: {p}", file=sys.stderr)
                sys.exit(1)
    else:
        if not data_dir.is_dir():
            print(
                f"Directory missing: {data_dir}\n"
                "Create it and add .csv or .xlsx files, or pass --file / --dir.",
                file=sys.stderr,
            )
            sys.exit(1)
        paths = collect_files(data_dir, (".csv", ".xlsx", ".xlsm"))

    if not paths:
        print(f"No .csv / .xlsx files in {data_dir}", file=sys.stderr)
        sys.exit(1)

    if not args.dry_run and not internal_key:
        print("INTERNAL_API_KEY is required for POST /orders/import.", file=sys.stderr)
        sys.exit(1)

    all_orders: list[dict[str, Any]] = []
    for path in paths:
        suffix = path.suffix.lower()
        if suffix == ".csv":
            rows = parse_csv_rows(path)
        elif suffix in (".xlsx", ".xlsm"):
            rows = parse_xlsx_rows(path)
        else:
            continue
        mapped = map_rows_to_orders(rows)
        for o in mapped:
            o["source_reference"] = path.name
        print(f"{path.name}: parsed rows={len(rows)} orders={len(mapped)}", file=sys.stderr)
        all_orders.extend(mapped)

    if not all_orders:
        print("No usable order rows after mapping.", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        print(json.dumps({"dry_run": True, "orders": len(all_orders)}, indent=2))
        return

    token = get_token(base)
    import_url = f"{base}/orders/import"
    try:
        status, result = http_json(
            "POST",
            import_url,
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
                "X-Internal-API-Key": internal_key,
            },
            {"orders": all_orders},
            timeout=300,
        )
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    print(json.dumps({"http_status": status, **result}, indent=2))


if __name__ == "__main__":
    main()
