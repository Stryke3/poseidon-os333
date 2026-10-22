"""Preserve and verify intake form data on an already-created SPEAR record.

No patient/order creation, mail, tracker, payment, or claim side effects. Existing
nonempty chart fields are never overwritten by this source-form reconciliation.
"""
from __future__ import annotations
import json
import re
from typing import Any


class FormCaptureError(ValueError):
    """Fixed codes only; source values must never appear in errors or logs."""


PATIENT_FIELDS = ('email', 'phone', 'gender', 'address_line1', 'address_line2',
                  'city', 'state', 'zip_code')


def normalized(value: Any, field: str = '') -> str:
    text = ' '.join(str(value or '').split()).casefold()
    if field == 'phone':
        digits = re.sub(r'\D', '', text)
        return digits[-10:] if len(digits) >= 10 else digits
    return text


def snapshot_for(payload, parsed: dict[str, Any]) -> dict[str, Any]:
    fields = parsed.get('_form_fields', {})
    if not isinstance(fields, dict) or len(fields) > 100:
        raise FormCaptureError('invalid_form_fields')
    if any(not isinstance(k, str) or not isinstance(v, str) for k, v in fields.items()):
        raise FormCaptureError('invalid_form_fields')
    if len(json.dumps(fields).encode()) > 131072:
        raise FormCaptureError('form_fields_too_large')
    return {
        'version': 1,
        'source_reference': payload.source_reference,
        'normalized_fields': payload.model_dump(mode='json', exclude={'record_id'}),
        'submitted_fields': dict(fields),
    }


def plan_capture(row: dict[str, Any], payload, parsed: dict[str, Any]):
    intake = row.get('intake_payload') or {}
    source = row.get('source_reference') or intake.get('_intake_idempotency_key')
    if source != payload.source_reference and payload.source_reference not in intake.get('_intake_source_references', []):
        raise FormCaptureError('source_reference_conflict')
    if normalized(f"{row.get('first_name', '')} {row.get('last_name', '')}") != normalized(f'{payload.first_name} {payload.last_name}'):
        raise FormCaptureError('patient_identity_conflict')
    dob = str(row.get('date_of_birth') or row.get('dob') or '')
    if not payload.date_of_birth or dob != payload.date_of_birth:
        raise FormCaptureError('patient_identity_conflict')
    changes = {}
    for field in PATIENT_FIELDS:
        incoming = getattr(payload, field, None)
        current = row.get(field)
        if not normalized(incoming):
            continue
        if not normalized(current):
            changes[field] = incoming
        elif normalized(current, field) != normalized(incoming, field):
            raise FormCaptureError('chart_field_conflict')
    snapshot = snapshot_for(payload, parsed)
    stored = source_snapshot(intake, payload.source_reference)
    if stored is not None and stored != snapshot:
        raise FormCaptureError('source_snapshot_conflict')
    return changes, snapshot, stored is None


def source_snapshot(intake, source_reference):
    legacy = intake.get('_source_form')
    if legacy and legacy.get('source_reference') == source_reference:
        return legacy
    if legacy and not legacy.get('source_reference'):
        # A malformed earlier snapshot must be reviewed, never replaced.
        return legacy
    return (intake.get('_source_forms') or {}).get(source_reference)


def capture_checks(row: dict[str, Any], payload, parsed: dict[str, Any]) -> dict[str, bool]:
    expected = snapshot_for(payload, parsed)
    return {
        'patient_email_matches': (not payload.email or normalized(row.get('email')) == normalized(payload.email)),
        'patient_fields_match': all(
            not normalized(getattr(payload, field, None)) or
            normalized(row.get(field), field) == normalized(getattr(payload, field), field)
            for field in PATIENT_FIELDS
        ),
        'submitted_form_preserved': source_snapshot(row.get('intake_payload') or {}, payload.source_reference) == expected,
    }


async def capture_form_data(db, org_id: str, payload, parsed: dict[str, Any], spear: dict[str, Any], *, repair: bool = True):
    from psycopg.rows import dict_row
    if not spear.get('order_id') or not spear.get('patient_id'):
        raise FormCaptureError('spear_record_unconfirmed')
    query = '''SELECT p.first_name,p.last_name,p.date_of_birth,p.dob,
                      p.email,p.phone,p.gender,p.address_line1,p.address_line2,
                      p.city,p.state,p.zip_code,o.source_reference,o.intake_payload
               FROM orders o JOIN patients p ON p.id=o.patient_id AND p.org_id=o.org_id
               WHERE o.org_id=%s::uuid AND o.id=%s::uuid AND p.id=%s::uuid'''
    params = (org_id, str(spear['order_id']), str(spear['patient_id']))
    async with db.connection() as conn:
        async with conn.transaction():
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(query + (' FOR UPDATE OF o,p' if repair else ''), params)
                row = await cur.fetchone()
                if not row:
                    raise FormCaptureError('spear_record_unconfirmed')
                before = capture_checks(dict(row), payload, parsed)
                changes, snapshot, needs_snapshot = plan_capture(dict(row), payload, parsed)
                if repair:
                    if changes:
                        # Column names originate only from the fixed PATIENT_FIELDS allowlist.
                        assignments = ','.join(field + '=%s' for field in changes)
                        await cur.execute(
                            'UPDATE patients SET ' + assignments + ',updated_at=NOW() WHERE org_id=%s::uuid AND id=%s::uuid',
                            (*changes.values(), org_id, str(spear['patient_id'])),
                        )
                    if needs_snapshot:
                        intake = row.get('intake_payload') or {}
                        snapshots = dict(intake.get('_source_forms') or {})
                        snapshots[payload.source_reference] = snapshot
                        captured = {'_source_forms': snapshots}
                        if intake.get('_source_form') is None:
                            captured['_source_form'] = snapshot
                        await cur.execute(
                            "UPDATE orders SET intake_payload=COALESCE(intake_payload,'{}'::jsonb) || %s::jsonb,updated_at=NOW() WHERE org_id=%s::uuid AND id=%s::uuid",
                            (json.dumps(captured, separators=(',', ':')), org_id, str(spear['order_id'])),
                        )
                    if changes or needs_snapshot:
                        await cur.execute(
                            'INSERT INTO workflow_events (org_id,order_id,event_type,payload) VALUES (%s::uuid,%s::uuid,%s,%s::jsonb)',
                            (org_id, str(spear['order_id']), 'mck.form.captured', json.dumps({
                                'source_reference': payload.source_reference,
                                'patient_fields_filled': sorted(changes),
                                'source_snapshot_added': needs_snapshot,
                            }, separators=(',', ':'))),
                        )
                await cur.execute(query, params)
                after_row = await cur.fetchone()
                after = capture_checks(dict(after_row), payload, parsed)
                if repair and not all(after.values()):
                    raise FormCaptureError('form_readback_incomplete')
                return {
                    'before': before, 'after': after,
                    'patient_fields_filled': sorted(changes) if repair else [],
                    'source_snapshot_added': bool(repair and needs_snapshot),
                    'submitted_field_count': len(snapshot['submitted_fields']),
                }
