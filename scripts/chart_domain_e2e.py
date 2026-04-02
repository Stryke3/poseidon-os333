#!/usr/bin/env python3
"""
Chart domain smoke: Core API + optional Next.js proxy (session cookie).

Usage:
  CHART_E2E_API=https://api.strykefox.com \\
  CHART_E2E_NEXT=http://127.0.0.1:3000 \\
  python3 scripts/chart_domain_e2e.py

Credentials: set CHART_E2E_EMAIL / CHART_E2E_PASSWORD, or rely on repo .env
(CORE_API_EMAIL / CORE_API_PASSWORD). Falls back to admin@strykefox.com /
Poseidon!2026 if present in DB.

Does not print tokens or passwords.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        out[k] = v
    return out


def http_json(
    method: str,
    url: str,
    *,
    token: str | None = None,
    data: dict | None = None,
    raw: bytes | None = None,
) -> tuple[int, dict]:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body: bytes | None = None
    if raw is not None:
        body = raw
    elif data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode()
    req = Request(url, method=method, headers=headers, data=body)
    try:
        with urlopen(req, timeout=120) as resp:
            raw_body = resp.read()
            code = resp.getcode()
    except HTTPError as e:
        code = e.code
        raw_body = e.read()
    except URLError as e:
        raise SystemExit(f"request failed: {e}") from e
    try:
        parsed = json.loads(raw_body.decode()) if raw_body else {}
    except json.JSONDecodeError:
        parsed = {"_raw": raw_body[:200].decode(errors="replace")}
    return code, parsed if isinstance(parsed, dict) else {"_data": parsed}


def curl_upload(token: str, api: str, order_id: str, pdf_path: Path) -> tuple[int, dict]:
    body_path = tempfile.NamedTemporaryFile(prefix="chart_up_", suffix=".json", delete=False)
    body_path.close()
    bp = Path(body_path.name)
    try:
        proc = subprocess.run(
            [
                "curl",
                "-sS",
                "-o",
                str(bp),
                "-w",
                "%{http_code}",
                "-X",
                "POST",
                "-H",
                f"Authorization: Bearer {token}",
                "-F",
                "doc_type=chart_smoke",
                "-F",
                f"file=@{pdf_path};type=application/pdf;filename=chart_smoke.pdf",
                f"{api}/api/v1/orders/{order_id}/documents",
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )
        raw_code = proc.stdout.strip()
        code = int(raw_code) if raw_code.isdigit() else 0
        body = bp.read_text()
        try:
            return code, json.loads(body) if body.strip() else {}
        except json.JSONDecodeError:
            return code, {"_raw": body[:200]}
    finally:
        bp.unlink(miss_ok=True)


def nextauth_cookie_login(next_base: str, email: str, password: str) -> str:
    """Return Cookie header value for session, or raise (curl Netscape cookie jar)."""
    from urllib.parse import urlencode

    cj = tempfile.NamedTemporaryFile(prefix="chart_e2e_", suffix=".txt", delete=False)
    cj.close()
    jar = Path(cj.name)
    try:
        raw_csrf = subprocess.check_output(
            ["curl", "-sS", "-c", str(jar), f"{next_base}/api/auth/csrf"],
            text=True,
        )
        csrf = json.loads(raw_csrf)["csrfToken"]
        postdata = urlencode(
            {
                "csrfToken": csrf,
                "email": email,
                "password": password,
                "callbackUrl": f"{next_base}/",
                "json": "true",
            }
        )
        subprocess.run(
            [
                "curl",
                "-sS",
                "-L",
                "-b",
                str(jar),
                "-c",
                str(jar),
                "-X",
                "POST",
                f"{next_base}/api/auth/callback/credentials",
                "-H",
                "Content-Type: application/x-www-form-urlencoded",
                "--data-binary",
                postdata,
            ],
            check=True,
            capture_output=True,
        )
        lines = [ln for ln in jar.read_text().splitlines() if ln and not ln.startswith("#")]
        parts: list[str] = []
        for ln in lines:
            fields = ln.split("\t")
            if len(fields) >= 7:
                name, val = fields[5], fields[6]
                parts.append(f"{name}={val}")
        if not parts:
            raise RuntimeError("no cookies after login")
        return "; ".join(parts)
    finally:
        jar.unlink(miss_ok=True)


def main() -> int:
    env = load_env_file(REPO_ROOT / ".env")
    for k, v in env.items():
        os.environ.setdefault(k, v)

    api = os.environ.get("CHART_E2E_API", "https://api.strykefox.com").rstrip("/")
    next_base = os.environ.get("CHART_E2E_NEXT", "").rstrip("/")

    attempts: list[tuple[str, str]] = []
    e1 = os.environ.get("CHART_E2E_EMAIL") or os.environ.get("CORE_API_EMAIL", "")
    p1 = os.environ.get("CHART_E2E_PASSWORD") or os.environ.get("CORE_API_PASSWORD", "")
    if e1 and p1:
        attempts.append((e1, p1))
    attempts.append(("admin@strykefox.com", "Poseidon!2026"))

    results: list[tuple[str, str]] = []
    login_body: dict = {}
    code = 0
    token = ""
    email_used = ""
    password_used = ""
    for email, password in attempts:
        code, login_body = http_json(
            "POST",
            f"{api}/auth/login",
            data={"email": email, "password": password},
        )
        if code == 200 and login_body.get("access_token"):
            token = str(login_body["access_token"])
            email_used = email
            password_used = password
            break
    if not token:
        results.append(("core_login", f"FAIL http {code}"))
        print(json.dumps({"ok": False, "step": "core_login", "http": code, "detail": login_body.get("detail")}))
        return 1
    results.append(("core_login", "OK"))

    code, plist = http_json("GET", f"{api}/api/v1/patients?page=1&page_size=50", token=token)
    if code != 200:
        results.append(("list_patients", f"FAIL http {code}"))
        print(json.dumps({"ok": False, "step": "list_patients", "http": code, "detail": plist}))
        return 1

    patients = plist.get("patients") or []
    if len(patients) < 1:
        results.append(("patients_nonempty", "FAIL"))
        print(json.dumps({"ok": False, "step": "list_patients", "detail": "no patients in org"}))
        return 1

    p1 = patients[0]["id"]
    code, chart = http_json("GET", f"{api}/patients/{p1}/chart", token=token)
    if code != 200:
        results.append(("chart_p1", f"FAIL http {code}"))
        print(json.dumps({"ok": False, "step": "chart", "http": code}))
        return 1
    orders = chart.get("orders") or []
    notes = chart.get("notes")
    devices = chart.get("devices")
    strict_shape = os.environ.get("CHART_E2E_REQUIRE_NOTES_DEVICES", "").lower() in ("1", "true", "yes")
    if notes is None or devices is None:
        msg = "legacy_chart_payload_missing_notes_or_devices"
        if strict_shape:
            results.append(("chart_shape", f"FAIL {msg}"))
            print(json.dumps({"ok": False, "step": "chart_shape", "detail": msg}))
            return 1
        results.append(("chart_shape", f"WARN {msg}"))
    else:
        results.append(("chart_shape", "OK"))
    results.append(("chart_load", "OK"))

    order_id: str | None = None
    if orders:
        order_id = str(orders[0].get("id"))
    if not order_id:
        results.append(("order_for_tests", "SKIP no orders on first patient"))
        print(json.dumps({"ok": False, "step": "need_order", "detail": "first patient has no orders"}))
        return 1

    li_code, li_body = http_json(
        "POST",
        f"{api}/api/v1/orders/{order_id}/line-items",
        token=token,
        data={
            "hcpcs_code": "E2E99",
            "quantity": 1,
            "description": "chart domain smoke line",
            "unit_price": 1.0,
        },
    )
    if li_code == 404:
        results.append(("add_line_item", "SKIP upstream missing POST /api/v1/orders/{id}/line-items (redeploy Core)"))
        print(
            json.dumps(
                {
                    "ok": False,
                    "step": "line_item",
                    "http": li_code,
                    "detail": "Core deployment does not expose line-items route (check /openapi.json).",
                },
            ),
        )
        return 2
    if li_code not in (200, 201):
        results.append(("add_line_item", f"FAIL http {li_code}"))
        print(json.dumps({"ok": False, "step": "line_item", "http": li_code, "detail": li_body}))
        return 1
    results.append(("add_line_item", "OK"))

    minimal_pdf = b"%PDF-1.1\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        tf.write(minimal_pdf)
        pdf_path = Path(tf.name)
    try:
        up_code, up_body = curl_upload(token, api, order_id, pdf_path)
    finally:
        pdf_path.unlink(miss_ok=True)

    if up_code not in (200, 201):
        results.append(("upload_document", f"FAIL http {up_code}"))
        print(json.dumps({"ok": False, "step": "upload", "http": up_code, "detail": up_body}))
        return 1
    doc_id = str(up_body.get("id") or "")
    results.append(("upload_document", "OK"))

    code, listed = http_json("GET", f"{api}/api/v1/orders/{order_id}/documents", token=token)
    if code != 200:
        results.append(("list_documents", f"FAIL http {code}"))
        print(json.dumps({"ok": False, "step": "list_documents", "http": code}))
        return 1
    ids = {str(d.get("id")) for d in (listed.get("documents") or [])}
    if doc_id and doc_id not in ids:
        results.append(("list_contains_upload", "FAIL"))
        print(json.dumps({"ok": False, "step": "list_contains", "uploaded_id": doc_id}))
        return 1
    results.append(("list_documents", "OK"))

    if doc_id:
        code, dl = http_json(
            "GET",
            f"{api}/api/v1/orders/{order_id}/documents/{doc_id}/download",
            token=token,
        )
        if code != 200 or not dl.get("download_url"):
            results.append(("download_meta", f"FAIL http {code}"))
            print(json.dumps({"ok": False, "step": "download_meta", "http": code}))
            return 1
        results.append(("download_presign", "OK"))

    # Containment: second patient's order_id under first patient's chart URL path (Core ignores path patient — test Next)
    p2_id: str | None = None
    o_foreign: str | None = None
    for p in patients[1:]:
        pid = str(p["id"])
        c, ch = http_json("GET", f"{api}/patients/{pid}/chart", token=token)
        if c != 200:
            continue
        ords = ch.get("orders") or []
        if ords:
            p2_id = pid
            o_foreign = str(ords[0].get("id"))
            break

    if next_base and p2_id and o_foreign and o_foreign != order_id:
        try:
            cookie_header = nextauth_cookie_login(next_base, email_used, password_used)
        except Exception as exc:
            results.append(("nextauth_login", f"FAIL {exc}"))
            print(json.dumps({"ok": False, "step": "nextauth", "error": str(exc)}))
            return 1
        # mismatched: patient p1, order from p2
        import urllib.request

        req = Request(
            f"{next_base}/api/patients/{p1}/orders/{o_foreign}/documents",
            method="GET",
            headers={"Cookie": cookie_header},
        )
        try:
            with urlopen(req, timeout=60) as resp:
                mis_code = resp.getcode()
        except HTTPError as e:
            mis_code = e.code
        if mis_code != 404:
            results.append(("containment_next", f"FAIL expected 404 got {mis_code}"))
            print(json.dumps({"ok": False, "step": "containment", "http": mis_code}))
            return 1
        results.append(("containment_next_mismatch", "OK 404"))

    # Permission spot-check: same token should get chart (already tested)
    role = login_body.get("role")
    perms = login_body.get("permissions") or []

    summary = {
        "ok": True,
        "api": api,
        "login_email_suffix": email_used.split("@")[-1] if "@" in email_used else "",
        "role": role,
        "permission_count": len(perms) if isinstance(perms, list) else 0,
        "patient_sample": p1[:8] + "…",
        "order_sample": order_id[:8] + "…" if order_id else None,
        "results": dict(results),
        "containment_next_tested": bool(next_base and p2_id and o_foreign),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
