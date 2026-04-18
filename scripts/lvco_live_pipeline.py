#!/usr/bin/env python3
"""
Run LVCO ingest, then Core admin materialize (Trident score + PDFs) with optional
intake gate unlock so Kanban cards can move without Availity/SWO in dev/LVCO replay.

Usage (repo root, .env loaded):
  python3 scripts/lvco_live_pipeline.py
  python3 scripts/lvco_live_pipeline.py --skip-ingest --limit 300

Requires admin-capable token (same login env vars as ingest) and INTERNAL_API_KEY for import.
Set CORE_BASE_URL like ingest_lvco (e.g. http://127.0.0.1:8001 or http://localhost/api/core).
Materialize: TRIDENT_API_URL must be set on Core (or compose default).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


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


def http_json(
    method: str,
    url: str,
    headers: dict[str, str],
    body: dict | None = None,
    timeout: int = 600,
) -> tuple[int, object]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        try:
            detail: object = json.loads(err_body)
        except json.JSONDecodeError:
            detail = err_body
        raise RuntimeError(f"HTTP {e.code}: {detail}") from e


def core_login_url(base: str) -> str:
    """Must match Core `POST /auth/login` (same as scripts/ingest_lvco.py)."""
    return f"{base.rstrip('/')}/auth/login"


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
        print("Set POSEIDON_ACCESS_TOKEN or ingest email/password.", file=sys.stderr)
        sys.exit(1)
    url = core_login_url(base)
    _, payload = http_json(
        "POST",
        url,
        {"Content-Type": "application/json"},
        {"email": email, "password": password},
        timeout=60,
    )
    if isinstance(payload, dict):
        token = payload.get("access_token")
        if token:
            return str(token)
    print(f"Login failed: {payload}", file=sys.stderr)
    sys.exit(1)
    return ""


def main() -> None:
    parser = argparse.ArgumentParser(description="LVCO ingest + Trident materialize pipeline")
    parser.add_argument("--skip-ingest", action="store_true", help="Only run materialize step")
    parser.add_argument("--limit", type=int, default=500, help="Max orders for materialize")
    parser.add_argument(
        "--no-unlock-gates",
        action="store_true",
        help="Do not set eligibility/SWO to eligible/ingested for lvco/import drafts",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / ".env")

    if not args.skip_ingest:
        ingest = root / "scripts" / "ingest_lvco.sh"
        if not ingest.is_file():
            print("Missing scripts/ingest_lvco.sh", file=sys.stderr)
            sys.exit(1)
        r = subprocess.run(["bash", str(ingest)], cwd=str(root))
        if r.returncode != 0:
            sys.exit(r.returncode)

    # Same CORE_BASE_URL as ingest_lvco.sh (often http://host/api behind nginx).
    # Nginx rewrite strips one /api segment; Core admin routes live at /api/v1/... on the app,
    # so through nginx use .../api/api/v1/... (double /api/) to land on /api/v1/... in Core.
    cb = os.environ.get("CORE_BASE_URL", "http://localhost:8001").rstrip("/")
    token = get_token(cb)
    q = f"limit={args.limit}&skip_existing_trident=true"
    if not args.no_unlock_gates:
        q += "&unlock_lvco_intake_gates=true"
    # Direct Core: /api/v1/admin/...  Nginx with base .../api: /api/api/v1/...  Dashboard proxy: .../api/core/api/v1/...
    if cb.endswith("/api/core"):
        url = f"{cb}/api/v1/admin/materialize-order-packages?{q}"
    elif cb.endswith("/api"):
        url = f"{cb}/api/v1/admin/materialize-order-packages?{q}"
    else:
        url = f"{cb}/api/v1/admin/materialize-order-packages?{q}"
    try:
        status, result = http_json(
            "POST",
            url,
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            body=None,
            timeout=600,
        )
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    out: dict[str, object] = {"http_status": status}
    if isinstance(result, dict):
        out.update(result)
    else:
        out["body"] = result
    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
