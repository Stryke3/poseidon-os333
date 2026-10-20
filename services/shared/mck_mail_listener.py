"""Process new MommyCareKit form mail through the existing idempotent Core API.

No historical backfill, read-state changes, clinical coding, claims or fulfillment.
Only opaque source IDs and fixed outcome codes enter operational logs/events.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from email import message_from_string, policy
from email.utils import parseaddr
from html.parser import HTMLParser
import json
import logging
import os
import re
from urllib.parse import urlparse

LOG = logging.getLogger("poseidon.mck_mail_listener")
SUBJECT = re.compile(r"^\s*New\s+MommyCareKit\s+Request\b", re.I)
LABELS = ("Name", "Email", "Phone", "Due date", "State", "Insurance plan", "Referring physician", "Physician office contact", "Date of birth", "Medicaid", "Items requested", "Notes", "Sms consent")
PRODUCTS = ("Electric Breast Pump", "Maternity Back Brace / Belly Band", "Compression Stockings", "DVT Prevention Device", "Blood Pressure Monitor", "TENS Therapy Unit")
TERMINAL = {"complete", "review", "uncertain"}

class FormReview(ValueError):
    """Fixed reason code only; never include a patient's submitted value."""

class BodyText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.suppressed = 0
    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "head"}: self.suppressed += 1
        if not self.suppressed and tag in {"p", "div", "br", "tr", "td", "th", "li", "h1", "h2", "h3", "h4", "h5", "h6"}: self.parts.append("\n")
    def handle_endtag(self, tag):
        if tag in {"script", "style", "head"} and self.suppressed: self.suppressed -= 1
        if not self.suppressed and tag in {"p", "div", "tr", "td", "th", "li", "h1", "h2", "h3", "h4", "h5", "h6"}: self.parts.append("\n")
    def handle_data(self, text):
        if not self.suppressed: self.parts.append(text)


def received_ms(ref):
    value = str(ref.get("receivedTime", ""))
    if not value.isdecimal(): raise FormReview("received_time_missing")
    number = int(value)
    if number < 1_000_000_000_000: raise FormReview("received_time_invalid")
    return number


def is_form(ref, domain):
    sender = parseaddr(str(ref.get("fromAddress", "")))[1].lower()
    return bool(SUBJECT.match(str(ref.get("subject", ""))) and sender.rsplit("@", 1)[-1] == domain and "@" in sender)


def extract_fields(message):
    part = message.get_body(preferencelist=("html", "plain")) if message.is_multipart() else message
    if part is None or part.get_content_type() not in {"text/html", "text/plain"}: raise FormReview("body_missing")
    text = part.get_content()
    if not isinstance(text, str) or len(text) > 262144: raise FormReview("body_invalid")
    if part.get_content_type() == "text/html":
        parser = BodyText()
        parser.feed(text)
        text = "".join(parser.parts)
    names = {name.casefold(): name for name in LABELS}
    fields = {}
    current = None
    for raw_line in text.splitlines():
        line = " ".join(raw_line.split()).strip()
        if not line: continue
        if line.casefold().startswith(("visitor ip:", "this e-mail was sent", "powered by web3forms")): break
        key = names.get(line.rstrip(":").casefold())
        inline = re.match(r"^([^:]+):\s*(.*)$", line)
        if not key and inline and inline.group(1).casefold() in names:
            key = names[inline.group(1).casefold()]
            remainder = inline.group(2)
        else:
            remainder = ""
        if key:
            if key in fields: raise FormReview("duplicate_form_label")
            current = key
            fields[key] = remainder
        elif current:
            fields[current] = " ".join(filter(None, (fields[current], line)))
    if not {"Name", "Email", "Date of birth", "Items requested"} <= fields.keys(): raise FormReview("form_structure_unrecognized")
    return fields


def form_payload(raw, ref, account_id, sender_domain="web3forms.com"):
    if not isinstance(raw, str) or len(raw) > 1048576: raise FormReview("raw_message_invalid")
    if not is_form(ref, sender_domain): raise FormReview("sender_or_subject_untrusted")
    mid = str(ref.get("messageId", ""))
    if not mid.isdecimal(): raise FormReview("message_identity_invalid")
    message = message_from_string(raw, policy=policy.default)
    actual_sender = parseaddr(str(message.get("From", "")))[1].lower()
    if actual_sender != parseaddr(str(ref.get("fromAddress", "")))[1].lower(): raise FormReview("message_sender_mismatch")
    if not SUBJECT.match(str(message.get("Subject", ""))): raise FormReview("message_subject_mismatch")
    fields = extract_fields(message)
    parts = fields.get("Name", "").split(maxsplit=1)
    if len(parts) != 2: raise FormReview("patient_name_incomplete")
    dob = fields.get("Date of birth", "")
    if dob:
        try: parsed_dob = date.fromisoformat(dob)
        except ValueError: raise FormReview("dob_needs_confirmation") from None
        if parsed_dob >= date.today(): raise FormReview("dob_needs_confirmation")
    due = fields.get("Due date", "")
    if due:
        try: date.fromisoformat(due)
        except ValueError: raise FormReview("due_date_needs_confirmation") from None
        if due == dob: raise FormReview("dob_equals_due_date")
    products = {p.casefold(): p for p in PRODUCTS}
    items = []
    for item in fields.get("Items requested", "").split(","):
        normalized = " ".join(item.split())
        if not normalized: continue
        if normalized.casefold() not in products: raise FormReview("requested_product_needs_review")
        if products[normalized.casefold()] not in items: items.append(products[normalized.casefold()])
    if not items: raise FormReview("requested_products_missing")
    state = fields.get("State", "").strip()
    state = {"nevada": "NV", "washington": "WA"}.get(state.casefold(), state.upper())
    if state and not re.fullmatch(r"[A-Z]{2}", state): raise FormReview("state_needs_review")
    provider = fields.get("Referring physician", "").strip()
    practice_only = bool(re.match(r"^(?:my\s*obgyn|whasn|empowered\s+obgyn)(?:\s.*)?$", provider, re.I))
    medicaid = fields.get("Medicaid", "").casefold()
    email = fields.get("Email", "").strip().lower() or None
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email): raise FormReview("email_needs_review")
    return {
        "source_reference": f"zoho-mail:{account_id}:{mid}",
        "submitted_at": datetime.fromtimestamp(received_ms(ref) / 1000, timezone.utc).isoformat(),
        "first_name": parts[0], "last_name": parts[1], "date_of_birth": dob or None,
        "due_date": due or None, "email": email, "phone": fields.get("Phone") or None,
        "state": state or None, "insurance_plan": fields.get("Insurance plan") or None,
        "medicaid": True if medicaid == "yes" else False if medicaid == "no" else None,
        "provider_name": None if practice_only else provider or None,
        "provider_practice": provider if practice_only else None,
        "provider_phone": fields.get("Physician office contact") or None,
        "items_requested": items,
        "notes": "Website intake. SMS consent as submitted: " + (fields.get("Sms consent") or "not supplied") + (". Patient notes: " + fields["Notes"] if fields.get("Notes") else ""),
    }


def outcome(status_code, response, attempts):
    if not isinstance(response, dict): return "uncertain", "core_response_unconfirmed"
    states = [response.get(k, {}).get("status") for k in ("spear", "sheet", "welcome") if isinstance(response.get(k), dict)]
    if status_code == 200 and response.get("complete") is True: return "complete", "confirmed"
    if "uncertain" in states: return "uncertain", "delivery_requires_reconciliation"
    if "blocked" in states or status_code in {400, 409, 422}: return "review", "missing_or_conflicting_intake_information"
    return ("retry", "retry_incomplete_leg") if attempts < 3 else ("review", "retry_limit_reached")


def safe_core_url(value):
    parsed = urlparse(value)
    if parsed.username or parsed.password or parsed.query or parsed.fragment: raise ValueError("invalid_core_mapping")
    allowed = parsed.scheme == "https" and parsed.hostname in {"api.strykefox.com", "core-production-d979.up.railway.app"}
    allowed = allowed or (parsed.scheme in {"http", "https"} and parsed.hostname == "core.railway.internal")
    if parsed.path not in {"", "/"}: raise ValueError("invalid_core_path")
    if not allowed: raise ValueError("unverified_core_destination")
    return value.rstrip("/")


async def one(conn, query, params=()):
    from psycopg.rows import dict_row
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        return await cur.fetchone()


async def receipt(conn, org, payload):
    from psycopg.types.json import Jsonb
    await conn.execute("INSERT INTO workflow_events(org_id,event_type,payload) VALUES(%s,%s,%s)", (org,"mck.mail.listener",Jsonb(payload)))
    await conn.commit()


def listing_params(folder, start):
    return {"folderId": folder, "start": start, "limit": 200, "status": "all", "sortBy": "date", "sortorder": "false", "includeto": "false"}


async def latest_receipt(conn, org, source):
    row = await one(conn, "SELECT payload FROM workflow_events WHERE org_id=%s AND event_type=%s AND payload->>%s=%s ORDER BY created_at DESC LIMIT 1", (org, "mck.mail.listener", "source_reference", source))
    return row["payload"] if row else {}


async def discover(conn, mail, cfg, org, cutoff, sender_domain):
    from psycopg.types.json import Jsonb
    checkpoint = await one(conn, "SELECT payload FROM workflow_events WHERE org_id=%s AND event_type=%s AND payload->>%s=%s AND payload->>%s=%s ORDER BY created_at DESC LIMIT 1", (org, "mck.mail.scan_checkpoint", "account_id", cfg.account_id, "folder_id", cfg.folder_id))
    watermark = int(checkpoint["payload"].get("received_ms", cutoff)) if checkpoint else cutoff
    threshold = max(cutoff, watermark - 60000)
    highwater = watermark
    queued = 0
    complete_scan = False
    seen = set()
    for start in range(1, 2001, 200):
        page = await mail._request("GET", f"/api/accounts/{cfg.account_id}/messages/view", params=listing_params(cfg.folder_id, start))
        if not isinstance(page, list): raise ValueError("mail_listing_invalid")
        older_seen = False
        for ref in page:
            if not isinstance(ref, dict) or str(ref.get("folderId")) != cfg.folder_id: raise ValueError("mail_folder_mismatch")
            stamp = received_ms(ref)
            highwater = max(highwater, stamp)
            if stamp < threshold:
                older_seen = True
                continue
            if not is_form(ref, sender_domain): continue
            mid = str(ref.get("messageId", ""))
            if not mid.isdecimal(): raise ValueError("mail_identity_invalid")
            if mid in seen: continue
            seen.add(mid)
            source = f"zoho-mail:{cfg.account_id}:{mid}"
            if await latest_receipt(conn, org, source): continue
            await receipt(conn, org, {"source_reference": source, "account_id": cfg.account_id, "folder_id": cfg.folder_id, "message_id": mid, "received_ms": stamp, "sender_address": parseaddr(str(ref.get("fromAddress", "")))[1].lower(), "status": "queued", "attempts": 0})
            queued += 1
        if older_seen or len(page) < 200:
            complete_scan = True
            break
    if complete_scan:
        await conn.execute("INSERT INTO workflow_events(org_id,event_type,payload) VALUES(%s,%s,%s)", (org, "mck.mail.scan_checkpoint", Jsonb({"account_id": cfg.account_id, "folder_id": cfg.folder_id, "received_ms": highwater})))
        await conn.commit()
    return {"queued": queued, "scan_limit_reached": not complete_scan}


async def process_one(conn, client, mail, cfg, org, core, key, sender_domain):
    import httpx
    queued = await one(conn, "SELECT payload FROM (SELECT DISTINCT ON (payload->>'source_reference') payload,created_at FROM workflow_events WHERE org_id=%s AND event_type=%s AND payload->>%s=%s AND payload->>%s=%s ORDER BY payload->>'source_reference',created_at DESC) latest WHERE payload->>'status'=ANY(%s) ORDER BY (payload->>'received_ms')::bigint ASC LIMIT 1", (org, "mck.mail.listener", "account_id", cfg.account_id, "folder_id", cfg.folder_id, ["queued", "retry", "processing"]))
    if not queued: return {"processed": 0}
    base = dict(queued["payload"])
    mid, source = base["message_id"], base["source_reference"]
    attempt = int(base.get("attempts", 0)) + 1
    base["attempts"] = attempt
    ref = {"messageId": mid, "receivedTime": str(base["received_ms"]), "subject": "New MommyCareKit Request", "fromAddress": base["sender_address"]}
    try:
        original = await mail._request("GET", f"/api/accounts/{cfg.account_id}/messages/{mid}/originalmessage")
        payload = form_payload(original.get("content") if isinstance(original, dict) else None, ref, cfg.account_id, sender_domain)
    except FormReview as exc:
        await receipt(conn, org, {**base, "status": "review", "reason": str(exc)})
        return {"processed": 1, "review": 1}
    except Exception:
        state = "retry" if attempt < 3 else "review"
        await receipt(conn, org, {**base, "status": state, "reason": "original_message_unavailable"})
        return {"processed": 1, state: 1}
    await receipt(conn, org, {**base, "status": "processing"})
    try:
        response = await client.post(core + "/api/v1/mck/intake", headers={"X-Internal-API-Key": key, "Idempotency-Key": source}, json=payload, timeout=90.0)
        body = response.json()
        state, reason = outcome(response.status_code, body, attempt)
    except (httpx.HTTPError, ValueError):
        state, reason = ("retry", "core_response_retry_idempotently") if attempt < 3 else ("review", "core_response_needs_review")
        body = {}
    evidence = {k: body[k].get("status") for k in ("spear", "sheet", "welcome") if isinstance(body, dict) and isinstance(body.get(k), dict)}
    await receipt(conn, org, {**base, "status": state, "reason": reason, "legs": evidence})
    return {"processed": 1, state: 1}


async def tick(app):
    import httpx
    from business_mail import ZohoConfig, ZohoMail
    from psycopg.types.json import Jsonb
    cfg = ZohoConfig.from_env()
    org = os.environ["MCK_ORG_ID"]
    core = safe_core_url(os.environ.get("CORE_API_URL", "https://api.strykefox.com"))
    key = os.environ.get("INTERNAL_API_KEY", "").strip()
    if not key: raise ValueError("core_auth_missing")
    sender_domain = os.environ.get("MCK_FORM_SENDER_DOMAIN", "web3forms.com").strip().lower()
    if sender_domain != "web3forms.com": raise ValueError("form_sender_not_approved")
    db = app.state.db_pool
    if db is None: raise ValueError("database_unavailable")
    lock_key = f"mck-mail-listener:{org}:{cfg.account_id}:{cfg.folder_id}"
    async with db.connection() as conn:
        lock = await one(conn, "SELECT pg_try_advisory_lock(hashtext(%s)) AS locked", (lock_key,))
        if not lock or not lock["locked"]: return {"status": "another_worker_active"}
        try:
            activation = await one(conn, "SELECT created_at FROM workflow_events WHERE org_id=%s AND event_type=%s AND payload->>%s=%s AND payload->>%s=%s ORDER BY created_at ASC LIMIT 1", (org, "mck.mail.listener_activation", "account_id", cfg.account_id, "folder_id", cfg.folder_id))
            if not activation:
                await conn.execute("INSERT INTO workflow_events(org_id,event_type,payload) VALUES(%s,%s,%s)", (org, "mck.mail.listener_activation", Jsonb({"account_id": cfg.account_id, "folder_id": cfg.folder_id, "historical_backfill": False})))
                await conn.commit()
                return {"status": "activated", "historical_backfill": False}
            cutoff = int(activation["created_at"].timestamp() * 1000)
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
                mail = ZohoMail(client, cfg)
                await mail.authenticate()
                result = await discover(conn, mail, cfg, org, cutoff, sender_domain)
                result.update(await process_one(conn, client, mail, cfg, org, core, key, sender_domain))
                result["status"] = "polled"
                return result
        finally:
            await conn.rollback()
            await one(conn, "SELECT pg_advisory_unlock(hashtext(%s)) AS unlocked", (lock_key,))


async def worker(app):
    if os.environ.get("MCK_MAIL_AUTOMATION_ENABLED", "false").lower() != "true": return
    try: interval = max(300, int(os.environ.get("MCK_MAIL_AUTOMATION_POLL_SECONDS", "300")))
    except ValueError: interval = 300
    await asyncio.sleep(10)
    while True:
        try:
            result = await tick(app)
            LOG.info("mck_mail_listener %s", json.dumps(result, separators=(",", ":")))
        except asyncio.CancelledError: raise
        except Exception as exc:
            LOG.warning("mck_mail_listener unavailable type=%s", type(exc).__name__)
        await asyncio.sleep(interval)


async def probe():
    """Read-only live source/parse check. Output contains no patient fields."""
    import httpx
    from business_mail import ZohoConfig, ZohoMail
    cfg = ZohoConfig.from_env()
    result = {"check": "mck_mail_source_read_only", "messages_modified": False}
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        mail = ZohoMail(client, cfg)
        await mail.authenticate()
        page = await mail._request("GET", f"/api/accounts/{cfg.account_id}/messages/view", params=listing_params(cfg.folder_id, 1))
        forms = [r for r in page if isinstance(r, dict) and SUBJECT.match(str(r.get("subject", "")))]
        result["recent_form_count"] = len(forms)
        trusted = [r for r in forms if is_form(r, "web3forms.com")]
        result["approved_sender_count"] = len(trusted)
        if trusted:
            ref = trusted[0]
            original = await mail._request("GET", f"/api/accounts/{cfg.account_id}/messages/{ref['messageId']}/originalmessage")
            try:
                parsed = form_payload(original.get("content"), ref, cfg.account_id)
                result["form_parser"] = "verified"
                result["has_dob"] = bool(parsed.get("date_of_birth"))
                result["product_count"] = len(parsed["items_requested"])
            except FormReview as exc:
                result["form_parser"] = str(exc)
        response = await client.post(safe_core_url(os.environ.get("CORE_API_URL", "https://api.strykefox.com")) + "/api/v1/mck/intake", headers={"X-Internal-API-Key": os.environ.get("INTERNAL_API_KEY", "")}, json={}, timeout=20.0)
        result["core_empty_payload_status"] = response.status_code
        result["status"] = "verified" if trusted and result.get("form_parser") == "verified" and response.status_code == 422 else "needs_review"
    return result


if __name__ == "__main__":
    if len(os.sys.argv) == 2 and os.sys.argv[1] == "--probe":
        try: result = asyncio.run(probe())
        except Exception as exc: result = {"check": "mck_mail_source_read_only", "status": "failed", "error_type": type(exc).__name__}
        print("mck_mail_probe " + json.dumps(result, separators=(",", ":")), flush=True)
    else:
        raise SystemExit("Use --probe for read-only validation")
