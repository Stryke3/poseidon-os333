"""Regression tests using synthetic identities and mocked external services."""
import asyncio
from contextlib import asynccontextmanager
import json
from pathlib import Path
import re
import sys
from types import SimpleNamespace
import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock
import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'shared'))
from test_intake_delivery import functions
from business_mail import ZohoConfig, BusinessMailError
from zoho_mail_outbound import ZohoMailSender
from zoho_sheet import ZohoSheet, ZohoSheetConfig, ZohoSheetError

class IdentityTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_contact_with_changed_name_blocks_new_chart(self):
        class Conflict(RuntimeError): pass
        scope = functions(ROOT / 'core/conveyor_api.py',
            {'_resolve_patient', '_phone_key', '_email_key'},
            {'re': re, 'IdentityConflict': Conflict, '_all': AsyncMock(return_value=[]),
             '_one': AsyncMock(return_value={'id': 'existing-patient'})})
        payload = SimpleNamespace(first_name='Different', last_name='Spelling', date_of_birth='1990-01-01',
                                  phone='7025550100', email='synthetic@example.test')
        with self.assertRaises(Conflict):
            await scope['_resolve_patient'](None, payload, 'synthetic-org')

    async def test_shared_phone_with_conflicting_email_requires_review(self):
        class Conflict(RuntimeError): pass
        scope = functions(ROOT / 'core/conveyor_api.py',
            {'_phone_key', '_email_key', '_candidate_matches_identifier', '_candidate_has_conflict', '_resolve_patient'},
            {'re': re, 'IdentityConflict': Conflict, '_all': AsyncMock(return_value=[
                {'id': 'synthetic-patient', 'phone': '7025550100', 'email': 'existing@example.test'}])})
        payload = SimpleNamespace(first_name='Synthetic', last_name='Patient', date_of_birth='1990-01-01',
            phone='7025550100', email='different@example.test')
        with self.assertRaises(Conflict):
            await scope['_resolve_patient'](None, payload, 'synthetic-org')

class MaternityOrderTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.conn = SimpleNamespace(execute=AsyncMock())
        self.db = SimpleNamespace(connection=self.connection)
        self.existing = {'id': 'existing-order', 'patient_id': 'existing-patient',
                         'physician_id': None, 'source_reference': 'synthetic:original',
                         'clinical_data': {'due_date': '2027-01-15', 'mck_record_id': 'MCK-ORIGINAL'},
                         'intake_payload': {}}
        self.payload = SimpleNamespace(source_reference='synthetic:resubmission', date_of_birth='1990-01-01',
            first_name='Synthetic', last_name='Patient', due_date='2027-01-15', provider_npi=None,
            medicaid=True, items_requested=['Breast pump'], provider_name='Synthetic Provider',
            provider_practice=None, provider_phone=None, provider_fax=None, notes=None, payer_id=None)
        self.all = AsyncMock(side_effect=[[], [self.existing]])
        self.write, self.event = AsyncMock(), AsyncMock()
        class Conflict(RuntimeError): pass
        self.Conflict = Conflict
        self.scope = functions(ROOT / 'core/conveyor_api.py', {'_spear_upsert', '_reuse_mck_order'}, {
            'IdentityConflict': Conflict, '_RECORD_ID_RE': re.compile(r'^MCK-[A-Z0-9_-]{4,64}$'),
            'json': json, 'uuid': uuid, 'datetime': datetime, 'timezone': timezone,
            '_one': AsyncMock(return_value=None), '_all': self.all, '_write': self.write, '_event': self.event,
            '_upsert_patient': AsyncMock(return_value=('existing-patient', False)),
            '_upsert_insurance': AsyncMock(return_value=None), '_upsert_physician': AsyncMock(return_value=None)})

    @asynccontextmanager
    async def connection(self):
        yield self.conn

    async def run_intake(self):
        return await self.scope['_spear_upsert'](self.db, self.payload, org_id='org', record_id='MCK-NEWEMAIL')

    def assert_no_order_insert(self):
        self.assertFalse(any('INSERT INTO orders' in call.args[1] for call in self.write.await_args_list))

    async def test_new_email_reuses_existing_maternity_order_and_tracker_id(self):
        result = await self.run_intake()
        self.assertEqual((result['patient_id'], result['order_id'], result['record_id']),
                         ('existing-patient', 'existing-order', 'MCK-ORIGINAL'))
        self.assert_no_order_insert()
        self.scope['_upsert_insurance'].assert_not_awaited()
        self.assertIn("product_category='Mommy Care Kit'", self.write.await_args.args[1])
        self.assertEqual(json.loads(self.write.await_args.args[2])['_intake_source_references'],
                         ['synthetic:resubmission'])

    async def test_same_source_replay_retains_canonical_tracker_id(self):
        self.all.side_effect = [[self.existing]]
        result = await self.run_intake()
        self.assertEqual(result['record_id'], 'MCK-ORIGINAL')
        self.scope['_upsert_patient'].assert_not_awaited()
        self.assert_no_order_insert()

    async def test_existing_duplicate_orders_block_a_third(self):
        self.all.side_effect = [[], [self.existing, {**self.existing, 'id': 'duplicate-order'}]]
        with self.assertRaises(self.Conflict): await self.run_intake()
        self.assert_no_order_insert()
        self.assertEqual(self.conn.execute.await_args.args[0], 'ROLLBACK')

    async def test_conflicting_pregnancy_requires_review(self):
        self.payload.due_date = '2028-01-15'
        with self.assertRaises(self.Conflict): await self.run_intake()
        self.assert_no_order_insert()
        self.write.assert_not_awaited()

    async def test_new_order_is_explicitly_mommy_care_kit(self):
        self.all.side_effect = [[], []]
        result = await self.run_intake()
        inserts = [call for call in self.write.await_args_list if 'INSERT INTO orders' in call.args[1]]
        self.assertEqual(len(inserts), 1)
        self.assertIn("'Mommy Care Kit','dme','mommycarekit'", inserts[0].args[1])
        self.assertEqual(result['record_id'], 'MCK-NEWEMAIL')

    async def test_previous_tracker_receipt_wins_for_manual_maternity_order(self):
        self.existing['clinical_data'] = {}
        self.scope['_one'].return_value = {'record_id': 'MCK-TRACKER'}
        self.assertEqual((await self.run_intake())['record_id'], 'MCK-TRACKER')

class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_oauth_failure_does_not_reserve_send(self):
        async def handler(request):
            return httpx.Response(401, json={'error': 'synthetic_invalid_grant'})
        callback = AsyncMock()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            sender = ZohoMailSender(client, ZohoConfig('client', 'secret', 'refresh', '123',
                'patients@strykefox.com', '456'))
            with self.assertRaises(BusinessMailError):
                await sender.send_message(to_addresses=['test@example.test'], subject='Synthetic',
                    content='Synthetic', before_send=callback)
        callback.assert_not_awaited()

    async def test_duplicate_sheet_ids_prevent_update(self):
        sheet = ZohoSheet(None, ZohoSheetConfig('id', 'secret', 'refresh', 'resource'))
        sheet._call = AsyncMock(return_value={'status': 'success', 'records': [
            {'Record ID': 'MCK-TEST'}, {'Record ID': 'MCK-TEST'}]})
        marker = AsyncMock()
        with self.assertRaises(ZohoSheetError):
            await sheet.upsert_record(worksheet_name='Patient Details', record_id='MCK-TEST',
                values={}, before_write=marker)
        self.assertEqual(sheet._call.await_count, 1)
        marker.assert_not_awaited()

    async def test_malformed_fetch_never_appends(self):
        sheet = ZohoSheet(None, ZohoSheetConfig('id', 'secret', 'refresh', 'resource'))
        sheet._call = AsyncMock(return_value={'status': 'success'})
        with self.assertRaises(ZohoSheetError):
            await sheet.upsert_record(worksheet_name='Patient Details', record_id='MCK-TEST', values={})
        self.assertEqual(sheet._call.await_count, 1)

    def test_canada_hosts(self):
        config = ZohoConfig('client', 'secret', 'refresh', '123', 'patients@strykefox.com', '456', region='ca')
        self.assertEqual(config.mail_origin, 'https://mail.zohocloud.ca')
        self.assertEqual(config.accounts_origin, 'https://accounts.zohocloud.ca')

class ProjectionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.receipts, self.locks, self.calls = {}, set(), []
        self.fail_second = False
        self.conn = SimpleNamespace(commit=AsyncMock(), rollback=AsyncMock())
        self.db = SimpleNamespace(connection=self.connection)
        self.config = SimpleNamespace(resource_id='synthetic-resource', patient_details_sheet='Patient Details',
                                      heather_cover_sheet='Heather Cover')
        self.scope = functions(ROOT / 'core/conveyor_api.py', {'_sheet_project'}, {
            'ZohoSheetError': ZohoSheetError,
            'ZohoSheetConfig': SimpleNamespace(from_env=lambda: self.config),
            'ZohoSheet': lambda *args: SimpleNamespace(upsert_record=self.write),
            '_sheet_rows': lambda *args: ({'Patient Name': 'Synthetic Patient'}, {'Patient': 'Synthetic Patient'}),
            '_one': self.one, '_event': self.event})
        self.payload = SimpleNamespace(source_reference='synthetic:1')
        self.spear = {'patient_id': 'patient-1', 'order_id': 'order-1'}

    @asynccontextmanager
    async def connection(self):
        yield self.conn

    async def one(self, conn, query, *args):
        if 'pg_try_advisory_lock' in query:
            key = args[0]
            if key in self.locks: return {'locked': False}
            self.locks.add(key)
            return {'locked': True}
        if 'pg_advisory_unlock' in query:
            self.locks.remove(args[0])
            return {'unlocked': True}
        return self.receipts.get(args[1])

    async def event(self, conn, org, event_type, data, order):
        self.receipts[data['projection_key']] = {'event_type': event_type}

    async def write(self, *, worksheet_name, record_id, values, before_write):
        if self.fail_second and worksheet_name == 'Heather Cover':
            raise ZohoSheetError('Synthetic pre-write lookup failure')
        await before_write()
        self.calls.append(worksheet_name)
        return 'created'

    async def run_projection(self):
        return await self.scope['_sheet_project'](self.db, None, self.payload, 'MCK-TEST',
            self.spear, 'Needs documentation', org_id='org-1')

    async def test_replay_uses_durable_receipts_despite_index_lag(self):
        await self.run_projection()
        result = await self.run_projection()
        self.assertEqual(self.calls, ['Patient Details', 'Heather Cover'])
        self.assertEqual(set(result.values()), {'already_confirmed'})
        self.assertFalse(self.locks)

    async def test_partial_failure_retries_only_unfinished_worksheet(self):
        self.fail_second = True
        with self.assertRaises(ZohoSheetError): await self.run_projection()
        self.fail_second = False
        await self.run_projection()
        self.assertEqual(self.calls, ['Patient Details', 'Heather Cover'])

    async def test_uncertain_previous_write_never_appends_again(self):
        key = 'mck-sheet:org-1:synthetic-resource:Patient Details:MCK-TEST'
        self.receipts[key] = {'event_type': 'mck.sheet.row.writing'}
        with self.assertRaises(ZohoSheetError): await self.run_projection()
        self.assertFalse(self.calls)
        self.assertFalse(self.locks)

    async def test_concurrent_projection_does_not_append_twice(self):
        started, release = asyncio.Event(), asyncio.Event()
        async def delayed(**kwargs):
            if kwargs['worksheet_name'] == 'Patient Details':
                started.set()
                await release.wait()
            return await self.write(**kwargs)
        self.scope['ZohoSheet'] = lambda *args: SimpleNamespace(upsert_record=delayed)
        first = asyncio.create_task(self.run_projection())
        await started.wait()
        try:
            with self.assertRaises(ZohoSheetError): await self.run_projection()
        finally:
            release.set()
        await first
        self.assertEqual(self.calls, ['Patient Details', 'Heather Cover'])

if __name__ == '__main__': unittest.main()
