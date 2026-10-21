"""Audit one existing intake against its original Zoho form email.

Default is read-only. --repair-missing fills empty chart fields and adds the
source-form snapshot only after source, organization, patient and order match.
No new patient/order, tracker write, email, billing or payment action occurs.
"""
from __future__ import annotations
import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

shared = Path('/app/shared')
if not shared.exists():
    shared = Path(__file__).resolve().parents[1] / 'shared'
sys.path.insert(0, str(shared))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from business_mail import ZohoConfig, ZohoMail
from conveyor_api import MckIntakePayload, _org_id
from mck_email_bridge import candidates, received_seconds
from mck_email_parser import parse_form
from mck_form_capture import FormCaptureError, capture_form_data


async def audit(message_id: str, repair: bool):
    if not message_id.isdecimal():
        raise FormCaptureError('message_id_invalid')
    org_id = _org_id()
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        mail = ZohoMail(client, ZohoConfig.from_env())
        await mail.authenticate()
        refs = await candidates(mail, 0, {message_id})
        if len(refs) != 1:
            raise FormCaptureError('source_message_not_uniquely_verified')
        original = await mail._request('GET', f'/api/accounts/{mail.config.account_id}/messages/{message_id}/originalmessage')
        if not isinstance(original, dict) or not isinstance(original.get('content'), str):
            raise FormCaptureError('original_message_unavailable')
        parsed = parse_form(original['content'].encode(), account_id=mail.config.account_id)
        parsed['submitted_at'] = datetime.fromtimestamp(received_seconds(refs[0]), timezone.utc).isoformat()
        payload = MckIntakePayload(**parsed)
    pool = AsyncConnectionPool(os.environ['DATABASE_URL'], min_size=1, max_size=2,
                               kwargs={'autocommit': True}, open=False)
    await pool.open()
    try:
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT id AS order_id,patient_id,intake_payload->>'mck_record_id' AS record_id FROM orders WHERE org_id=%s::uuid AND (source_reference=%s OR intake_payload->>'_intake_idempotency_key'=%s) LIMIT 2",
                    (org_id, payload.source_reference, payload.source_reference),
                )
                rows = await cur.fetchall()
        if len(rows) != 1:
            raise FormCaptureError('existing_order_not_uniquely_verified')
        result = await capture_form_data(pool, org_id, payload, parsed, dict(rows[0]), repair=repair)
        return {
            'status': 'verified' if all(result['after'].values()) else 'incomplete',
            'record_id': rows[0]['record_id'],
            'zoho_message_id': message_id,
            'new_patients': 0, 'new_orders': 0, 'emails_sent': 0, 'tracker_writes': 0,
            **result,
        }
    finally:
        await pool.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--message-id', required=True)
    parser.add_argument('--repair-missing', action='store_true')
    args = parser.parse_args()
    try:
        result = asyncio.run(audit(args.message_id, args.repair_missing))
    except Exception as exc:
        result = {'status': 'needs_review', 'reason': str(exc) if isinstance(exc, FormCaptureError) else type(exc).__name__}
    print('mck_form_capture_audit ' + json.dumps(result, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    main()
