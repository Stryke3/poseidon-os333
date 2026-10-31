"""Poll body-only website emails into the existing audited MCK workflow.

Runs inside Core with its existing secret boundary and database pool. It never
changes claims, payment ledgers, authorization decisions or fulfillment states.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import hashlib
import json
import os
import re
from types import SimpleNamespace

import httpx
from business_mail import BusinessMailError, ZohoConfig, ZohoMail
from mck_email_parser import SUBJECT, ParseError, parse_form
from conveyor_api import MckIntakePayload, _one, _event, _org_id, mck_intake
from mck_form_capture import FormCaptureError, capture_form_data
from base import logger, settings
from zoho_oauth import token_session
from zoho_sheet import ZohoSheet, ZohoSheetConfig


def emit(value):
    # Every caller supplies only fixed codes, counters and opaque record IDs.
    print('mck_email_bridge ' + json.dumps(value, separators=(',', ':')), flush=True)


def settings_for(env):
    since = env.get('MCK_EMAIL_START_AT', '').strip()
    if not since:
        raise ValueError('start_boundary_required')
    parsed = datetime.fromisoformat(since.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('start_timezone_required')
    ids = {x.strip() for x in env.get('MCK_EMAIL_MESSAGE_IDS', '').split(',') if x.strip()}
    if any(not x.isdecimal() for x in ids):
        raise ValueError('message_filter_invalid')
    return parsed.timestamp(), ids, env.get('MCK_EMAIL_DRY_RUN', 'true').lower() != 'false'


def received_seconds(ref):
    raw = str(ref.get('receivedTime', ''))
    if not raw.isdecimal():
        return None
    value = int(raw)
    return value / 1000 if value > 100000000000 else value


async def candidates(mail, since, ids):
    result = []
    for start in range(1, 1001, 100):
        refs = await mail._request('GET', f'/api/accounts/{mail.config.account_id}/messages/view', params={
            'folderId': mail.config.folder_id, 'start': start, 'limit': 100,
            'status': 'all', 'sortBy': 'date', 'sortorder': 'false',
        })
        if not isinstance(refs, list):
            raise ValueError('mail_list_invalid')
        older = False
        for ref in refs:
            if not isinstance(ref, dict):
                continue
            moment = received_seconds(ref)
            if moment is not None and moment < since:
                older = True
                continue
            mid = str(ref.get('messageId', ''))
            if (moment is None or not mid.isdecimal()
                    or str(ref.get('folderId', '')) != mail.config.folder_id
                    or (ids and mid not in ids)
                    or not SUBJECT.fullmatch(str(ref.get('subject', '')).strip())):
                continue
            result.append(ref)
        if older or len(refs) < 100 or (ids and ids <= {str(r['messageId']) for r in result}):
            break
    return sorted(result, key=lambda row: received_seconds(row) or 0)


async def is_completed(db, org_id, mid):
    async with db.connection() as conn:
        return bool(await _one(conn,
            "SELECT 1 found FROM workflow_events WHERE org_id=$1::uuid "
            "AND event_type='mck.email.completed' AND payload->>'zoho_message_id'=$2 LIMIT 1",
            org_id, mid))


async def record_event(db, org_id, kind, data, order_id=None):
    async with db.connection() as conn:
        await _event(conn, org_id, kind, data, order_id)
        await conn.commit()


async def readback(db, client, org_id, result):
    spear = result.get('spear', {})
    order_id, patient_id = spear.get('order_id'), spear.get('patient_id')
    if not order_id or not patient_id:
        return {'spear': False, 'patient_details': False, 'heather_cover': False}
    async with db.connection() as conn:
        row = await _one(conn,
            'SELECT o.id FROM orders o JOIN patients p ON p.id=o.patient_id AND p.org_id=o.org_id '
            'WHERE o.org_id=$1::uuid AND o.id=$2::uuid AND p.id=$3::uuid', org_id, order_id, patient_id)
    checks = {'spear': bool(row), 'patient_details': False, 'heather_cover': False}
    sheet = ZohoSheet(client, ZohoSheetConfig.from_env())
    for key, name in (('patient_details', sheet.config.patient_details_sheet), ('heather_cover', sheet.config.heather_cover_sheet)):
        found = await sheet.fetch_first(worksheet_name=name, criteria_column='Record ID', criteria_value=result['record_id'])
        checks[key] = bool(found and found.get('Record ID') == result['record_id'])
    return checks


async def process_message(app, mail, client, org_id, ref, *, dry_run):
    mid = str(ref['messageId'])
    if await is_completed(app.state.db_pool, org_id, mid):
        return {'status': 'already_completed', 'zoho_message_id': mid}
    original = await mail._request('GET', f'/api/accounts/{mail.config.account_id}/messages/{mid}/originalmessage')
    if not isinstance(original, dict) or not isinstance(original.get('content'), str):
        raise ParseError('original_message_unavailable')
    body = original['content'].encode('utf-8')
    parsed = parse_form(body, account_id=mail.config.account_id)
    parsed['submitted_at'] = datetime.fromtimestamp(received_seconds(ref), timezone.utc).isoformat()
    payload = MckIntakePayload(**parsed)
    meta = {
        'zoho_message_id': mid,
        'source_reference': payload.source_reference,
        'dob_present': bool(payload.date_of_birth),
        'email_present': bool(payload.email),
        'provider_present': bool(payload.provider_name),
        'requested_item_count': len(payload.items_requested),
    }
    if dry_run:
        return {'status': 'parsed_read_only', **meta}
    # Call the same application handler as the authenticated API. No duplicate write path.
    request = SimpleNamespace(app=app, headers={'X-Internal-API-Key': settings.internal_api_key})
    response = await mck_intake(payload, request)
    result = json.loads(response.body)
    capture = {'status': 'blocked'}
    if result.get('spear', {}).get('status') == 'confirmed':
        try:
            captured = await capture_form_data(app.state.db_pool, org_id, payload, parsed, result['spear'])
            capture = {'status': 'confirmed', **captured['after'],
                       'submitted_field_count': captured['submitted_field_count']}
        except Exception as exc:
            capture = {'status': 'needs_review',
                       'reason': str(exc) if isinstance(exc, FormCaptureError) else type(exc).__name__}
    safe = {
        **meta, 'record_id': result.get('record_id'),
        'patient_id': result.get('spear', {}).get('patient_id'),
        'order_id': result.get('spear', {}).get('order_id'),
        'spear': result.get('spear', {}).get('status'),
        'sheet': result.get('sheet', {}).get('status'),
        'welcome': result.get('welcome', {}).get('status'),
        'welcome_message_id': result.get('welcome', {}).get('message_id'),
        'swo_coding': result.get('coding', {'status': 'missing'}),
        'form_capture': capture,
    }
    # Error type names from the handler are safe; patient/provider error bodies are not.
    for key in ('spear', 'sheet'):
        kind = result.get(key, {}).get('error')
        if kind and re.fullmatch(r'[A-Za-z_]{1,64}', kind):
            safe[key + '_error_type'] = kind
    safe['status'] = 'pending'
    if result.get('complete') and capture['status'] == 'confirmed':
        checks = await readback(app.state.db_pool, client, org_id, result)
        safe['readback'] = checks
        if all(checks.values()):
            safe['status'] = 'completed'
    await record_event(app.state.db_pool, org_id,
                       'mck.email.completed' if safe['status'] == 'completed' else 'mck.email.pending',
                       safe, safe['order_id'])
    return safe


async def poll_once(app, env=None):
    env = os.environ if env is None else env
    # Startup OAuth can fail transiently. Reload the encrypted stored connection
    # before polling instead of leaving the process unconfigured until restart.
    if env is os.environ and not all(env.get(k) for k in
            ('ZOHO_OAUTH_REFRESH_TOKEN', 'ZOHO_MAIL_ACCOUNT_ID', 'ZOHO_MAIL_FOLDER_ID')):
        from zoho_bootstrap import bootstrap
        recovery = await asyncio.to_thread(bootstrap, os.environ)
        emit({'status': 'connection_recovery', **{'connection_status': recovery.get('status')}})
    since, ids, dry_run = settings_for(env)
    org_id = _org_id()
    db = app.state.db_pool
    counts = {'checked': 0, 'completed': 0, 'pending': 0, 'review': 0, 'dry_run': dry_run}
    async with db.connection() as conn:
        key = 'mck-email-poller:' + org_id
        lock = await _one(conn, 'SELECT pg_try_advisory_lock(hashtext($1)) locked', key)
        await conn.commit()
        if not lock or not lock.get('locked'):
            return {'status': 'another_worker_active'}
        try:
            async with token_session(), httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
                mail = ZohoMail(client, ZohoConfig.from_env())
                await mail.authenticate()
                refs = await candidates(mail, since, ids)
                for ref in refs:
                    mid = str(ref['messageId'])
                    counts['checked'] += 1
                    try:
                        result = await process_message(app, mail, client, org_id, ref, dry_run=dry_run)
                        if result['status'] == 'already_completed':
                            continue
                        emit(result)
                        if result['status'] in counts:
                            counts[result['status']] += 1
                    except Exception as exc:
                        counts['review'] += 1
                        code = str(exc) if isinstance(exc, ParseError) else type(exc).__name__
                        safe = {'status': 'needs_review', 'zoho_message_id': mid, 'reason': code}
                        emit(safe)
                        if not dry_run:
                            await record_event(db, org_id, 'mck.email.review', safe)
            return counts
        finally:
            await conn.rollback()
            await _one(conn, 'SELECT pg_advisory_unlock(hashtext($1)) unlocked', key)
            await conn.commit()


def daily_schedule(env):
    """Optional local wall-clock times; interval mode remains backward compatible."""
    raw = env.get('MCK_EMAIL_RUN_TIMES', '').strip()
    if not raw:
        return None
    times = []
    for value in raw.split(','):
        value = value.strip()
        if not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', value):
            raise ValueError('invalid_email_run_time')
        times.append(tuple(map(int, value.split(':'))))
    zone = ZoneInfo(env.get('MCK_EMAIL_TIMEZONE', 'America/Los_Angeles'))
    return zone, tuple(sorted(set(times)))


def next_daily_run(now, schedule):
    """Return the next future slot in UTC, preserving the local time across DST."""
    if now.tzinfo is None:
        raise ValueError('current_timezone_required')
    zone, times = schedule
    local_date = now.astimezone(zone).date()
    now_utc = now.astimezone(timezone.utc)
    for offset in (0, 1):
        day = local_date + timedelta(days=offset)
        for hour, minute in times:
            candidate = datetime(day.year, day.month, day.day, hour, minute,
                                 tzinfo=zone).astimezone(timezone.utc)
            if candidate > now_utc:
                return candidate
    raise ValueError('empty_email_schedule')


async def email_worker(app):
    if os.getenv('MCK_EMAIL_INTAKE_ENABLED', 'false').lower() != 'true':
        return
    try:
        schedule = daily_schedule(os.environ)
        interval = None if schedule else max(60, min(43200, int(os.getenv('MCK_EMAIL_POLL_SECONDS', '60'))))
        settings_for(os.environ)
    except Exception:
        emit({'status': 'configuration_required'})
        return
    timing = ({'schedule_timezone': schedule[0].key,
               'run_times': [f'{h:02d}:{m:02d}' for h, m in schedule[1]]}
              if schedule else {'interval_seconds': interval})
    emit({'status': 'watcher_started', **timing,
          'dry_run': os.getenv('MCK_EMAIL_DRY_RUN', 'true').lower() != 'false'})
    if not schedule:
        await asyncio.sleep(5)
    while True:
        if schedule:
            now = datetime.now(timezone.utc)
            due = next_daily_run(now, schedule)
            emit({'status': 'poll_scheduled', 'next_poll_at': due.isoformat(),
                  'schedule_timezone': schedule[0].key})
            await asyncio.sleep(max(0, (due - now).total_seconds()))
        try:
            summary = await poll_once(app)
            emit({'status': 'poll_finished', **summary})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            emit({'status': 'poll_failed', 'reason': type(exc).__name__, **({'detail': str(exc), 'http_status': exc.status_code} if isinstance(exc, BusinessMailError) else {})})
        if not schedule:
            await asyncio.sleep(interval)
