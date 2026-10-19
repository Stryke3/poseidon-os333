"""One-time source builder. Validates reviewed Git blobs before focused edits.
Only executed in the repair branch's synthetic CI build, never in production.
"""
from __future__ import annotations
import ast
import hashlib
from pathlib import Path
import textwrap

EXPECTED = {
    'services/core/conveyor_api.py': '74f3fca4252f864eabf6569fc03034f28bf2ca33',
    'services/shared/zoho_sheet.py': '27f5f50f2f4d04bee83722237787be2faa47250a',
    'services/shared/business_mail.py': '48e4763935e967e0d0c2b6dc38f547e638163199',
    'services/intake/main.py': '2f784c5a87f59224934ad4188230d652e5f56852',
}

def replace_once(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError('Reviewed replacement does not match exactly once')
    return source.replace(before, after, 1)


def replace_def(source, name, replacement):
    matches = [n for n in ast.parse(source).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name]
    if len(matches) != 1:
        raise RuntimeError('Reviewed function does not match: ' + name)
    node = matches[0]
    if node.decorator_list:
        raise RuntimeError('Refusing to silently replace decorators: ' + name)
    lines = source.splitlines(keepends=True)
    return ''.join(lines[:node.lineno - 1]) + textwrap.dedent(replacement).strip() + '\n' + ''.join(lines[node.end_lineno:])


def build():
    sources = {}
    for path, expected in EXPECTED.items():
        raw = Path(path).read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if actual != expected:
            raise RuntimeError('Source changed since review: ' + path)
        sources[path] = raw.decode()

    mail = sources['services/shared/business_mail.py']
    mail = replace_once(mail, '    def mail_origin(self) -> str:\n        return f"https://mail.zoho.{self.region}"', '''    def mail_origin(self) -> str:
        if self.region == "ca":
            return "https://mail.zohocloud.ca"
        return f"https://mail.zoho.{self.region}"

    @property
    def accounts_origin(self) -> str:
        if self.region == "ca":
            return "https://accounts.zohocloud.ca"
        return f"https://accounts.zoho.{self.region}"''')
    mail = replace_once(mail, 'f"https://accounts.zoho.{self.config.region}/oauth/v2/token"', 'f"{self.config.accounts_origin}/oauth/v2/token"')
    sources['services/shared/business_mail.py'] = mail

    intake = sources['services/intake/main.py']
    intake = replace_once(intake, '    # Every attachment is durable and verified before any order import or read-state update.\n    await _archive_email_messages(messages)\n', '')
    intake = replace_once(intake, '        try:\n            for index, (filename, content) in enumerate(message["attachments"]):', '''        try:
            # A failed archive blocks this message only. Its records are never imported.
            # Other messages continue, and only fully processed messages are marked read.
            await _archive_email_messages([message])
            for index, (filename, content) in enumerate(message["attachments"]):''')
    sources['services/intake/main.py'] = intake

    sheet = sources['services/shared/zoho_sheet.py']
    sheet = replace_once(sheet, '\n\n@dataclass(frozen=True, repr=False)', '''

class ZohoSheetWriteUncertain(ZohoSheetError):
    """A write may have reached Zoho; reconcile before another append."""


@dataclass(frozen=True, repr=False)''')
    sheet = replace_once(sheet, '        region = source.get("ZOHO_REGION", "com").strip() or "com"', '''        region = source.get("ZOHO_REGION", "com").strip().lower() or "com"
        if region not in {"com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"}:
            raise ZohoSheetError("Unsupported Zoho Sheet data center.", 503)''')
    sheet = replace_once(sheet, '        try:\n            response = await self.client.post(\n                f"{self.config.sheet_origin}/api/v2/{self.config.resource_id}",', '''        mutating = method in {"worksheet.records.add", "worksheet.records.update"}
        try:
            response = await self.client.post(
                f"{self.config.sheet_origin}/api/v2/{self.config.resource_id}",''')
    sheet = replace_once(sheet, '''        except (httpx.HTTPError, ValueError) as exc:
            raise ZohoSheetError("Zoho Sheet request could not be confirmed.") from exc
        if response.is_error or not isinstance(payload, dict):
            raise ZohoSheetError("Zoho Sheet request failed.")''', '''        except (httpx.HTTPError, ValueError) as exc:
            error = ZohoSheetWriteUncertain if mutating else ZohoSheetError
            raise error("Zoho Sheet request could not be confirmed.") from exc
        if response.is_error or not isinstance(payload, dict):
            ambiguous = mutating and (
                response.status_code >= 500 or response.status_code == 408
                or not isinstance(payload, dict)
            )
            error = ZohoSheetWriteUncertain if ambiguous else ZohoSheetError
            raise error("Zoho Sheet request failed.")''')
    sheet = replace_once(sheet, '            count=1,', '            count=2,')
    sheet = replace_once(sheet, '''        if not isinstance(records, list) or not records:
            return None
        return records[0] if isinstance(records[0], dict) else None''', '''        if not isinstance(records, list):
            raise ZohoSheetError("Zoho Sheet returned no verifiable record list.")
        if len(records) > 1:
            raise ZohoSheetError("Duplicate tracker Record ID requires reconciliation.", 409)
        if not records:
            return None
        if not isinstance(records[0], dict) or str(records[0].get(criteria_column, "")) != criteria_value:
            raise ZohoSheetError("Zoho Sheet returned an unexpected record.")
        return records[0]''')
    sheet = replace_once(sheet, '''        values: Mapping[str, Any],
    ) -> str:''', '''        values: Mapping[str, Any],
        allow_create: bool = True,
        initialize_only: tuple[str, ...] = (),
    ) -> str:''')
    sheet = replace_once(sheet, '''        if existing is not None:
            payload = await self._call(''', '''        if existing is not None:
            # Replays may fill missing intake fields; they must not erase workflow progress.
            record = {
                key: value for key, value in record.items()
                if value != "" and not (
                    key in initialize_only and existing.get(key) not in (None, "")
                )
            }
            if str(existing.get("SPEAR Intake", "")).lower() == "true" and record.get("SPEAR Intake") is False:
                record.pop("SPEAR Intake")
            payload = await self._call(''')
    sheet = replace_once(sheet, '''            if affected is not None and int(affected) < 1:
                raise ZohoSheetError("Zoho Sheet update did not affect the expected row.")
            return "updated"

        await self._call(''', '''            if affected is None:
                raise ZohoSheetWriteUncertain("Zoho Sheet update returned no row acknowledgment.")
            try:
                count = int(affected)
            except (TypeError, ValueError) as exc:
                raise ZohoSheetWriteUncertain("Zoho Sheet update acknowledgment was invalid.") from exc
            if count != 1:
                raise ZohoSheetWriteUncertain("Zoho Sheet update did not confirm exactly one row.", 409)
            return "updated"

        if not allow_create:
            raise ZohoSheetError(
                "Previously attempted tracker row is not visible; reconcile or retry its lookup.", 409
            )
        payload = await self._call(''')
    sheet = replace_once(sheet, '''        return "created"
''', '''        try:
            start, end = int(payload["start_row"]), int(payload["end_row"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ZohoSheetWriteUncertain("Zoho Sheet append returned no row acknowledgment.") from exc
        if start <= self.config.header_row or end != start:
            raise ZohoSheetWriteUncertain("Zoho Sheet append did not confirm exactly one new row.")
        return "created"
''')
    sources['services/shared/zoho_sheet.py'] = sheet

    core = sources['services/core/conveyor_api.py']
    core = replace_once(core, 'import hmac\n', 'import hmac\nimport hashlib\n')
    core = replace_once(core, 'from business_mail import ZohoConfig', 'from business_mail import BusinessMailError, ZohoConfig')
    core = replace_once(core, 'from zoho_sheet import ZohoSheet, ZohoSheetConfig', 'from zoho_sheet import ZohoSheet, ZohoSheetConfig, ZohoSheetError, ZohoSheetWriteUncertain')
    core = replace_once(core, '''    if len(exact) == 1:
        return exact[0]''', '''    if len(exact) == 1:
        if _candidate_has_conflict(exact[0], payload):
            raise IdentityConflict(
                "The submitted phone or email conflicts with the existing SPEAR patient"
            )
        return exact[0]''')
    core = replace_once(core, '    state: str | None = "NV"', '    state: str | None = None')
    core = replace_once(core, '    async with httpx.AsyncClient(timeout=30.0) as client:\n        try:\n            projected = await _sheet_project(client, payload, record_id, spear, outstanding)', '''    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            if results["spear"].get("reason") and results["spear"]["status"] == "blocked":
                raise ZohoSheetError("Patient identity requires reconciliation before projection.", 409)
            projected = await _sheet_project(
                client, payload, record_id, spear, outstanding, db=db, org_id=org_id
            )''')
    core = replace_once(core, '''            results["spear"] = {"status": "failed", "error": str(exc)[:200]}''', '''            results["spear"] = {"status": "failed", "reason": "SPEAR intake requires review"}''')
    core = replace_once(core, '''        except Exception as exc:
            results["sheet"] = {"status": "failed", "error": str(exc)[:200]}''', '''        except ZohoSheetWriteUncertain:
            results["sheet"] = {"status": "uncertain", "reason": "Reconcile tracker write before retry"}
        except Exception:
            results["sheet"] = {"status": "failed", "reason": "Tracker projection requires review"}''')
    core = replace_def(core, '_sheet_project', SHEET_PROJECT)
    core = replace_def(core, '_send_welcome', MAIL_HELPERS + '\n\n' + SEND_WELCOME)
    core = replace_def(core, '_send_paid', SEND_PAID)
    core = replace_def(core, 'dispatch_paid_notifications', DISPATCH_PAID)
    sources['services/core/conveyor_api.py'] = core

    for path, source in sources.items():
        ast.parse(source, filename=path)
        Path(path).write_text(source)
        print('PATCHED', path)
    return sorted(sources)

SHEET_PROJECT = r'''
async def _sheet_project(
    client: httpx.AsyncClient,
    payload: MckIntakePayload,
    record_id: str,
    spear: dict[str, Any] | None,
    outstanding: str,
    *,
    db,
    org_id: str,
) -> dict[str, str]:
    config = ZohoSheetConfig.from_env()
    sheet = ZohoSheet(client, config)
    patient, cover = _sheet_rows(payload, record_id, spear, outstanding)
    initialize_only = (
        "Intake Date", "Current Stage", "Notes", "Doctor Notes Received",
        "SWO Status (cover)", "Signed SWO Returned", "Heather Follow-up",
        "Outstanding / Follow-up", "SPEAR Review / Outstanding", "Owner",
    )
    results: dict[str, str] = {}
    for leg, worksheet, values in (
        ("patient_details", config.patient_details_sheet, patient),
        ("heather_cover", config.heather_cover_sheet, cover),
    ):
        key = hashlib.sha256(json.dumps(
            [org_id, config.resource_id, worksheet, record_id], separators=(",", ":")
        ).encode()).hexdigest()
        fingerprint = hashlib.sha256(json.dumps(
            values, sort_keys=True, default=str, separators=(",", ":")
        ).encode()).hexdigest()
        lock_name = f"mck-sheet:{key}"
        event_types = [f"mck.sheet.projection.{suffix}" for suffix in
                       ("dispatching", "confirmed", "uncertain", "retryable")]
        async with db.connection() as conn:
            lock = await _one(conn, "SELECT pg_try_advisory_lock(hashtext($1)) locked", lock_name)
            if not lock or not lock.get("locked"):
                raise ZohoSheetError("Tracker projection already in progress.", 409)
            try:
                prior = await _one(
                    conn,
                    "SELECT event_type,payload FROM workflow_events WHERE org_id=$1::uuid "
                    "AND event_type=ANY($2) AND payload->>'projection_key'=$3 "
                    "ORDER BY created_at DESC,id DESC LIMIT 1",
                    org_id, event_types, key,
                )
                prior_data = (prior or {}).get("payload") or {}
                if isinstance(prior_data, str):
                    prior_data = json.loads(prior_data)
                prior_type = str((prior or {}).get("event_type") or "")
                if (prior_type.endswith(".confirmed")
                        and prior_data.get("fingerprint") == fingerprint):
                    results[leg] = "already_projected"
                    continue
                # Carry this fact across retryable lookup failures. A delayed index must
                # never convert a previously confirmed/ambiguous append into a new append.
                may_exist = bool(prior_data.get("may_exist")) or prior_type.endswith(
                    (".dispatching", ".confirmed", ".uncertain")
                )
                event_data = {
                    "projection_key": key, "fingerprint": fingerprint,
                    "record_id": record_id, "source_reference": payload.source_reference,
                    "worksheet": worksheet, "resource_id": config.resource_id,
                    "attempt_id": str(uuid.uuid4()), "may_exist": True,
                }
                order_id = str((spear or {}).get("order_id") or "") or None
                await _event(conn, org_id, "mck.sheet.projection.dispatching", event_data, order_id)
                await conn.commit()
                try:
                    result = await sheet.upsert_record(
                        worksheet_name=worksheet, record_id=record_id, values=values,
                        allow_create=not may_exist, initialize_only=initialize_only,
                    )
                except ZohoSheetWriteUncertain:
                    await conn.rollback()
                    await _event(conn, org_id, "mck.sheet.projection.uncertain", event_data, order_id)
                    await conn.commit()
                    raise
                except ZohoSheetError:
                    await conn.rollback()
                    await _event(conn, org_id, "mck.sheet.projection.retryable",
                                 {**event_data, "may_exist": may_exist}, order_id)
                    await conn.commit()
                    raise
                except Exception as exc:
                    await conn.rollback()
                    await _event(conn, org_id, "mck.sheet.projection.uncertain", event_data, order_id)
                    await conn.commit()
                    raise ZohoSheetWriteUncertain("Tracker write requires reconciliation.") from exc
                # Commit each worksheet separately before starting the next one.
                await _event(conn, org_id, "mck.sheet.projection.confirmed",
                             {**event_data, "result": result}, order_id)
                await conn.commit()
                results[leg] = result
            finally:
                await conn.rollback()
                await _one(conn, "SELECT pg_advisory_unlock(hashtext($1)) unlocked", lock_name)
                await conn.commit()
    return results
'''

MAIL_HELPERS = r'''
async def _latest_mail_state(conn, org_id: str, prefix: str, *, source: str | None = None,
                             order_id: str | None = None) -> str:
    types = [f"{prefix}.{suffix}" for suffix in ("sent", "dispatching", "uncertain", "retryable")]
    if source is not None:
        selector, value = "payload->>'source_reference'=$3", source
    else:
        selector, value = "order_id=$3::uuid", order_id
    row = await _one(
        conn,
        "SELECT event_type FROM workflow_events WHERE org_id=$1::uuid "
        "AND event_type=ANY($2) AND " + selector +
        " ORDER BY created_at DESC,CASE WHEN event_type LIKE '%.sent' THEN 4 "
        "WHEN event_type LIKE '%.retryable' THEN 3 WHEN event_type LIKE '%.uncertain' "
        "THEN 2 ELSE 1 END DESC,id DESC LIMIT 1",
        org_id, types, value,
    )
    return str((row or {}).get("event_type") or "").rsplit(".", 1)[-1]


async def _deliver_mail(conn, *, org_id: str, order_id: str, prefix: str,
                        event_data: dict[str, Any], sender, recipients: list[str],
                        subject: str, body: str) -> dict[str, Any]:
    data = {**event_data, "attempt_id": str(uuid.uuid4())}
    await _event(conn, org_id, f"{prefix}.dispatching", data, order_id)
    await conn.commit()
    try:
        message_id = await sender.send_message(
            to_addresses=recipients, subject=subject, content=body, mail_format="plaintext"
        )
        if not message_id:
            raise ZohoMailSendUncertain("Mail transport returned no message ID")
    except ZohoMailSendUncertain as exc:
        suffix, status, reason = "uncertain", "uncertain", type(exc).__name__
    except BusinessMailError as exc:
        # The transport authenticates BEFORE attempting /messages. Only this known
        # pre-send failure may become retryable. Preserve every prior attempt event.
        suffix, status, reason = "retryable", "failed", type(exc).__name__
    except Exception as exc:
        suffix, status, reason = "uncertain", "uncertain", type(exc).__name__
    else:
        try:
            await _event(conn, org_id, f"{prefix}.sent", {**data, "message_id": message_id}, order_id)
            await conn.commit()
        except Exception:
            await conn.rollback()
            # The committed dispatching receipt prevents a duplicate after a lost DB acknowledgment.
            return {"status": "uncertain", "reason": "Reconcile accepted mail receipt"}
        return {"status": "confirmed", "message_id": message_id}
    await conn.rollback()
    await _event(conn, org_id, f"{prefix}.{suffix}", {**data, "reason": reason}, order_id)
    await conn.commit()
    return {"status": status, "reason": (
        "Mail was not attempted; retry is permitted" if suffix == "retryable"
        else "Mail delivery requires reconciliation"
    )}
'''

SEND_WELCOME = r'''
async def _send_welcome(
    db, client: httpx.AsyncClient, payload: MckIntakePayload, *,
    org_id: str, record_id: str, order_id: str | None,
) -> dict[str, Any]:
    if not order_id:
        return {"status": "blocked", "reason": "SPEAR record is not confirmed"}
    if not payload.email:
        return {"status": "blocked", "missing": ["Email"]}
    lock_name = f"mck-welcome:{org_id}:{payload.source_reference}"
    async with db.connection() as conn:
        lock = await _one(conn, "SELECT pg_try_advisory_lock(hashtext($1)) locked", lock_name)
        if not lock or not lock.get("locked"):
            return {"status": "in_progress"}
        try:
            state = await _latest_mail_state(conn, org_id, "mck.welcome", source=payload.source_reference)
            if state == "sent":
                return {"status": "already_sent"}
            if state in {"dispatching", "uncertain"}:
                return {"status": "uncertain", "reason": "Reconcile the previous send in Zoho"}
            subject, body = build_welcome_email(
                first_name=payload.first_name, insurance_name=payload.insurance_plan,
                provider_summary=_provider(payload) if payload.provider_name else None,
                needs_dob=not bool(payload.date_of_birth), needs_provider=not bool(payload.provider_name),
                needs_insurance=not bool(payload.member_id), needs_id=True,
                needs_address=not all((payload.address_line1, payload.city, payload.state, payload.zip_code)),
            )
            try:
                sender = ZohoMailSender(client, ZohoConfig.from_env())
            except BusinessMailError:
                return {"status": "failed", "reason": "Zoho mail configuration is incomplete"}
            return await _deliver_mail(
                conn, org_id=org_id, order_id=order_id, prefix="mck.welcome",
                event_data={"source_reference": payload.source_reference, "record_id": record_id},
                sender=sender, recipients=[payload.email], subject=subject, body=body,
            )
        finally:
            await conn.rollback()
            await _one(conn, "SELECT pg_advisory_unlock(hashtext($1)) unlocked", lock_name)
            await conn.commit()
'''

SEND_PAID = r'''
async def _send_paid(app, row: dict[str, Any]) -> str:
    order_id, org_id = str(row["id"]), str(row["org_id"])
    if org_id != _org_id():
        return "blocked"
    db = app.state.db_pool
    lock_name = f"mck-paid:{order_id}"
    async with db.connection() as conn:
        lock = await _one(conn, "SELECT pg_try_advisory_lock(hashtext($1)) locked", lock_name)
        if not lock or not lock.get("locked"):
            return "locked"
        try:
            state = await _latest_mail_state(conn, org_id, "mck.payment_notification", order_id=order_id)
            if state in {"sent", "uncertain", "dispatching"}:
                return "already_handled"
            current = await _one(conn,
                "SELECT status,paid_amount FROM orders WHERE id=$1::uuid AND org_id=$2::uuid",
                order_id, org_id)
            if not current or current["status"] != "paid" or (current.get("paid_amount") or 0) <= 0:
                return "blocked"
            try:
                subject, body = build_paid_notification(
                    f"{row.get('first_name') or ''} {row.get('last_name') or ''}", _address(row))
                recipients = _recipients()
                config = ZohoConfig.from_env()
            except (ValueError, BusinessMailError):
                await _event(conn, org_id, "mck.payment_notification.blocked",
                             {"reason": "Verify address, recipients and Zoho configuration"}, order_id)
                await conn.commit()
                return "blocked"
            async with httpx.AsyncClient(timeout=30.0) as client:
                result = await _deliver_mail(
                    conn, org_id=org_id, order_id=order_id, prefix="mck.payment_notification",
                    event_data={"recipient_count": len(recipients),
                                "paid_at": str(row.get("paid_at") or row.get("payment_date") or "")},
                    sender=ZohoMailSender(client, config), recipients=recipients,
                    subject=subject, body=body,
                )
            return "sent" if result["status"] == "confirmed" else result["status"]
        finally:
            await conn.rollback()
            await _one(conn, "SELECT pg_advisory_unlock(hashtext($1)) unlocked", lock_name)
            await conn.commit()
'''

DISPATCH_PAID = r'''
async def dispatch_paid_notifications(app, *, limit: int = 25) -> dict[str, int]:
    counts = {"checked": 0, "sent": 0, "blocked": 0, "failed": 0,
              "uncertain": 0, "already_handled": 0, "locked": 0}
    if os.getenv("MCK_PAID_NOTIFICATION_ENABLED", "false").lower() != "true":
        return {**counts, "disabled": 1}
    org_id = _org_id()
    db = app.state.db_pool
    if db is None:
        raise RuntimeError("SPEAR database is unavailable")
    async with db.connection() as conn:
        rows = await _all(conn, """
            SELECT o.id,o.org_id,o.paid_amount,o.payment_date,o.paid_at,
                   p.first_name,p.last_name,p.address_line1,p.address_line2,
                   p.city,p.state,p.zip_code,p.address
            FROM orders o JOIN patients p ON p.id=o.patient_id AND p.org_id=o.org_id
            WHERE o.org_id=$1::uuid AND o.status='paid' AND COALESCE(o.paid_amount,0)>0
              AND (lower(COALESCE(o.product_category,'')) LIKE '%mommy%'
                OR lower(COALESCE(o.product_category,'')) LIKE '%maternity%'
                OR lower(COALESCE(o.source,'')) LIKE '%mommy%'
                OR COALESCE(o.intake_payload->>'mck_record_id','')<>'')
              AND COALESCE((
                  SELECT w.event_type FROM workflow_events w
                  WHERE w.order_id=o.id AND w.org_id=o.org_id
                    AND w.event_type IN ('mck.payment_notification.sent',
                        'mck.payment_notification.uncertain', 'mck.payment_notification.dispatching',
                        'mck.payment_notification.retryable')
                  ORDER BY w.created_at DESC,
                    CASE WHEN w.event_type LIKE '%.sent' THEN 4
                         WHEN w.event_type LIKE '%.retryable' THEN 3
                         WHEN w.event_type LIKE '%.uncertain' THEN 2 ELSE 1 END DESC,w.id DESC LIMIT 1
              ),'') NOT IN ('mck.payment_notification.sent',
                           'mck.payment_notification.uncertain','mck.payment_notification.dispatching')
            ORDER BY COALESCE((SELECT max(w.created_at) FROM workflow_events w
                    WHERE w.order_id=o.id AND w.event_type IN
                    ('mck.payment_notification.blocked','mck.payment_notification.retryable')),
                    'epoch'::timestamptz),
                     COALESCE(o.paid_at,o.payment_date::timestamptz,o.updated_at),o.id
            LIMIT $2
            """, org_id, limit)
    counts["checked"] = len(rows)
    for row in rows:
        result = await _send_paid(app, row)
        counts[result] = counts.get(result, 0) + 1
    return counts
'''

if __name__ == '__main__':
    build()
