"""One-time, assertion-guarded patch; run only on the MCK reliability branch."""
from pathlib import Path
import ast
import textwrap

ROOT = Path(__file__).resolve().parents[1]
CHANGED = {}

def read(path):
    return CHANGED.get(path, (ROOT / path).read_text())

def put(path, content):
    ast.parse(content, filename=path)
    CHANGED[path] = content

def replace(path, old, new):
    text = read(path)
    if text.count(old) != 1:
        raise RuntimeError(f"Expected exactly one patch target in {path}")
    put(path, text.replace(old, new, 1))

def section(path, start, end, replacement):
    text = read(path)
    if text.count(start) != 1 or text.count(end) != 1:
        raise RuntimeError(f"Ambiguous function boundaries in {path}")
    left = text.index(start)
    right = text.index(end, left)
    put(path, text[:left] + textwrap.dedent(replacement).strip() + "\n\n\n" + text[right:])

core = "services/core/conveyor_api.py"
mail = "services/shared/business_mail.py"
sender = "services/shared/zoho_mail_outbound.py"
sheet = "services/shared/zoho_sheet.py"
intake = "services/intake/main.py"

replace(core, "    if len(exact) == 1:\n        return exact[0]", "    if len(exact) == 1:\n        if _candidate_has_conflict(exact[0], payload):\n            raise IdentityConflict(\n                'A secondary patient identifier conflicts; identity review is required'\n            )\n        return exact[0]")
replace(core, "    existing = await _resolve_patient(conn, payload, org_id)", "    # Serialize patient identity independently of individual submission IDs.\n    await _one(conn, 'SELECT pg_advisory_xact_lock(hashtext($1)) locked',\n               f'mck-patient:{org_id}:{payload.first_name.casefold()}:'\n               f'{payload.last_name.casefold()}:{payload.date_of_birth}')\n    existing = await _resolve_patient(conn, payload, org_id)")
replace(mail, '        return f"https://mail.zoho.{self.region}"', '        return "https://mail.zohocloud.ca" if self.region == "ca" else f"https://mail.zoho.{self.region}"\n\n    @property\n    def accounts_origin(self) -> str:\n        return "https://accounts.zohocloud.ca" if self.region == "ca" else f"https://accounts.zoho.{self.region}"')
replace(mail, 'f"https://accounts.zoho.{self.config.region}/oauth/v2/token"', 'f"{self.config.accounts_origin}/oauth/v2/token"')
replace(sender, "from collections.abc import Iterable", "from collections.abc import Awaitable, Callable, Iterable")
replace(sender, '        mail_format: str = "plaintext",\n    ) -> str:', '        mail_format: str = "plaintext",\n        before_send: Callable[[], Awaitable[None]] | None = None,\n    ) -> str:')
replace(sender, "        await self.authenticate()\n        try:", "        await self.authenticate()\n        # Authentication failures are definitely pre-send. Persist a dispatch\n        # marker only after authentication and immediately before the POST.\n        if before_send is not None:\n            await before_send()\n        try:")
replace(intake, "    # Every attachment is durable and verified before any order import or read-state update.\n    await _archive_email_messages(messages)\n", "    # Archive within the per-message boundary so one bad attachment cannot\n    # block unrelated patients. Imports still require verified archival.\n")
replace(intake, '        try:\n            for index, (filename, content) in enumerate(message["attachments"]):', '        try:\n            await _archive_email_messages([message])\n            for index, (filename, content) in enumerate(message["attachments"]):')
replace(sheet, "from typing import Any, Mapping", "from typing import Any, Mapping\nfrom collections.abc import Awaitable, Callable")
replace(sheet, '        region = source.get("ZOHO_REGION", "com").strip() or "com"\n', '        region = source.get("ZOHO_REGION", "com").strip() or "com"\n        if region not in {"com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"}:\n            raise ZohoSheetError("Unsupported Zoho data center.", 503)\n')
replace(sheet, "            count=1,", "            count=2,")
replace(sheet, '        if not isinstance(records, list) or not records:\n            return None\n        return records[0] if isinstance(records[0], dict) else None', '        if not isinstance(records, list):\n            raise ZohoSheetError("Zoho Sheet lookup returned an invalid record list.")\n        if len(records) > 1:\n            raise ZohoSheetError("Duplicate tracker Record ID requires reconciliation.", 409)\n        if not records:\n            return None\n        if not isinstance(records[0], dict):\n            raise ZohoSheetError("Zoho Sheet returned an invalid record.")\n        return records[0]')
replace(sheet, '        values: Mapping[str, Any],\n    ) -> str:', '        values: Mapping[str, Any],\n        before_write: Callable[[], Awaitable[None]] | None = None,\n    ) -> str:')
replace(sheet, '        if existing is not None:\n            payload = await self._call(', '        if existing is not None:\n            # Preserve staff-maintained workflow and evidence fields on replay.\n            protected = {"Intake Date", "Current Stage", "Owner", "Notes",\n                         "Doctor Notes Received", "SWO Status (cover)",\n                         "Signed SWO Returned", "Heather Follow-up",\n                         "Outstanding / Follow-up", "SPEAR Review / Outstanding"}\n            record = {key: value for key, value in record.items()\n                      if key not in protected and (value != "" or not existing.get(key))}\n            if before_write is not None:\n                await before_write()\n            payload = await self._call(')
replace(sheet, '        await self._call(\n            "worksheet.records.add",', '        if before_write is not None:\n            await before_write()\n        payload = await self._call(\n            "worksheet.records.add",')
replace(sheet, '        return "created"', '        if payload.get("status") != "success" or payload.get("start_row") is None:\n            raise ZohoSheetError("Zoho Sheet creation did not return a confirmed row identity.")\n        return "created"')
replace(core, "from zoho_sheet import ZohoSheet, ZohoSheetConfig", "from zoho_sheet import ZohoSheet, ZohoSheetConfig, ZohoSheetError")
section(core, "async def _sheet_project(", "async def _send_welcome(", '''
async def _sheet_project(db, client, payload, record_id, spear, outstanding, *, org_id):
    if not spear:
        raise ZohoSheetError("SPEAR acceptance is required before tracker projection", 409)
    config = ZohoSheetConfig.from_env()
    sheet = ZohoSheet(client, config)
    patient, cover = _sheet_rows(payload, record_id, spear, outstanding)
    result = {}
    for label, worksheet, values in (
        ("patient_details", config.patient_details_sheet, patient),
        ("heather_cover", config.heather_cover_sheet, cover),
    ):
        # A durable per-worksheet receipt prevents duplicate append during
        # concurrent delivery, delayed indexing, restarts and partial failure.
        key = f"mck-sheet:{org_id}:{config.resource_id}:{worksheet}:{record_id}"
        async with db.connection() as conn:
            lock = await _one(conn, "SELECT pg_try_advisory_lock(hashtext($1)) locked", key)
            if not lock or not lock.get("locked"):
                raise ZohoSheetError("Tracker projection is already in progress", 409)
            try:
                prior = await _one(conn,
                    "SELECT event_type FROM workflow_events WHERE org_id=$1::uuid "
                    "AND payload->>'projection_key'=$2 "
                    "AND event_type IN ('mck.sheet.row.confirmed','mck.sheet.row.writing') "
                    "ORDER BY created_at DESC LIMIT 1", org_id, key)
                if prior:
                    if prior["event_type"] == "mck.sheet.row.confirmed":
                        result[label] = "already_confirmed"
                        continue
                    raise ZohoSheetError("Previous tracker write requires reconciliation", 409)

                async def before_write():
                    await _event(conn, org_id, "mck.sheet.row.writing",
                        {"projection_key": key, "record_id": record_id,
                         "worksheet": worksheet, "source_reference": payload.source_reference},
                        str(spear["order_id"]))
                    await conn.commit()

                action = await sheet.upsert_record(
                    worksheet_name=worksheet, record_id=record_id,
                    values=values, before_write=before_write)
                await _event(conn, org_id, "mck.sheet.row.confirmed",
                    {"projection_key": key, "record_id": record_id, "worksheet": worksheet,
                     "action": action, "source_reference": payload.source_reference},
                    str(spear["order_id"]))
                await conn.commit()
                result[label] = action
            finally:
                await conn.rollback()
                await _one(conn, "SELECT pg_advisory_unlock(hashtext($1)) unlocked", key)
    return result


async def _dispatch_mck_mail(db, client, *, org_id, order_id, prefix,
                             recipients, subject, body, event_data):
    key = f"{prefix}:{org_id}:{order_id}"
    async with db.connection() as conn:
        lock = await _one(conn, "SELECT pg_try_advisory_lock(hashtext($1)) locked", key)
        if not lock or not lock.get("locked"):
            return {"status": "in_progress"}
        dispatch_started = False
        try:
            if await _order_event(conn, order_id, (prefix + ".sent",)):
                return {"status": "already_sent"}
            if await _order_event(conn, order_id, (prefix + ".dispatching", prefix + ".uncertain")):
                return {"status": "uncertain", "reason": "Previous send requires reconciliation"}

            async def before_send():
                nonlocal dispatch_started
                await _event(conn, org_id, prefix + ".dispatching", event_data, order_id)
                await conn.commit()
                dispatch_started = True

            try:
                sender = ZohoMailSender(client, ZohoConfig.from_env())
                message_id = await sender.send_message(
                    to_addresses=recipients, subject=subject, content=body,
                    mail_format="plaintext", before_send=before_send)
                if not message_id:
                    raise ZohoMailSendUncertain("Send returned no message ID")
                await _event(conn, org_id, prefix + ".sent",
                    {**event_data, "message_id": message_id}, order_id)
                await conn.commit()
                return {"status": "confirmed", "message_id": message_id}
            except Exception as exc:
                await conn.rollback()
                # No dispatch marker is created on a pre-send OAuth/configuration
                # failure. Those failures can be retried after the connection recovers.
                uncertain = dispatch_started or isinstance(exc, ZohoMailSendUncertain)
                state = "uncertain" if uncertain else "failed"
                await _event(conn, org_id, prefix + "." + state,
                    {**event_data, "reason": type(exc).__name__, "retryable": not uncertain}, order_id)
                await conn.commit()
                return {"status": state, "retryable": not uncertain,
                        "reason": "Delivery requires reconciliation" if uncertain else "Mail connection is unavailable"}
        finally:
            await conn.rollback()
            await _one(conn, "SELECT pg_advisory_unlock(hashtext($1)) unlocked", key)
''')
section(core, "async def _send_welcome(", '@router.post("/api/v1/mck/intake")', '''
async def _send_welcome(db, client, payload, *, org_id, record_id, order_id):
    if not order_id:
        return {"status": "blocked", "reason": "SPEAR record is not confirmed"}
    if not payload.email:
        return {"status": "blocked", "missing": ["Email"]}
    subject, body = build_welcome_email(
        first_name=payload.first_name, insurance_name=payload.insurance_plan,
        provider_summary=_provider(payload) if payload.provider_name else None,
        needs_dob=not bool(payload.date_of_birth), needs_provider=not bool(payload.provider_name),
        needs_insurance=not bool(payload.member_id), needs_id=True,
        needs_address=not all((payload.address_line1, payload.city, payload.state, payload.zip_code)))
    return await _dispatch_mck_mail(db, client, org_id=org_id, order_id=order_id,
        prefix="mck.welcome", recipients=[payload.email], subject=subject, body=body,
        event_data={"source_reference": payload.source_reference, "record_id": record_id})
''')
replace(core, "projected = await _sheet_project(client, payload, record_id, spear, outstanding)", "projected = await _sheet_project(db, client, payload, record_id, spear, outstanding, org_id=org_id)")
section(core, "async def _send_paid(", "async def dispatch_paid_notifications(", '''
async def _send_paid(app, row):
    order_id, org_id = str(row["id"]), str(row["org_id"])
    # Re-read the current order and address so stale scan data cannot initiate a notice.
    async with app.state.db_pool.connection() as conn:
        current = await _one(conn,
            "SELECT o.id,o.org_id,o.status,o.paid_amount,o.paid_at,o.payment_date,"
            "p.first_name,p.last_name,p.address_line1,p.address_line2,p.city,p.state,p.zip_code,p.address "
            "FROM orders o JOIN patients p ON p.id=o.patient_id AND p.org_id=o.org_id "
            "WHERE o.id=$1::uuid AND o.org_id=$2::uuid", order_id, org_id)
    if not current or current["status"] != "paid" or (current.get("paid_amount") or 0) <= 0:
        return "blocked"
    try:
        recipients = _recipients()
        subject, body = build_paid_notification(
            f"{current.get('first_name') or ''} {current.get('last_name') or ''}", _address(current))
    except ValueError:
        return "blocked"
    async with httpx.AsyncClient(timeout=30.0) as client:
        result = await _dispatch_mck_mail(app.state.db_pool, client,
            org_id=org_id, order_id=order_id, prefix="mck.payment_notification",
            recipients=recipients, subject=subject, body=body,
            event_data={"recipient_count": len(recipients),
                        "paid_at": str(current.get("paid_at") or current.get("payment_date") or "")})
    return {"confirmed": "sent", "already_sent": "already_handled",
            "in_progress": "locked"}.get(result["status"], result["status"])
''')
replace(core, "JOIN patients p ON p.id=o.patient_id\n            WHERE o.status='paid'", "JOIN patients p ON p.id=o.patient_id AND p.org_id=o.org_id\n            WHERE o.org_id=$2::uuid AND o.status='paid'")
replace(core, '            limit,\n        )\n    counts = {', '            limit,\n            _org_id(),\n        )\n    counts = {')
replace(core, '        "uncertain": 0,\n        "already_handled": 0,', '        "uncertain": 0,\n        "failed": 0,\n        "already_handled": 0,')
# Only expose error types, never SQL parameter details or upstream PHI.
text = read(core).replace('"error": str(exc)[:200]', '"error": type(exc).__name__')
put(core, text)

for path, content in CHANGED.items():
    (ROOT / path).write_text(content)
    print("patched", path)
