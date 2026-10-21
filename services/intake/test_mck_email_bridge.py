"""Synthetic tests for email -> SPEAR -> tracker -> welcome. No live data or sends."""
from __future__ import annotations
import json
import os
from email.message import EmailMessage
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

SERVICES = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(SERVICES / 'shared'), str(SERVICES / 'core')]
os.environ.setdefault('LOCAL_PROOF_MODE', 'true')
from mck_email_parser import ParseError, fields_from_text, parse_form
import mck_email_bridge as bridge

FORM = {
    'name': 'Synthetic Patient', 'email': 'synthetic@example.test',
    'phone': '7025550100', 'due_date': '2027-01-15', 'state': 'Nevada',
    'insurance_plan': 'Other insurance', 'date_of_birth': '1990-01-01',
    'medicaid': 'both', 'referring_physician': 'Synthetic Provider',
    'physician_office_contact': '7025550199',
    'items_requested': 'Electric Breast Pump, Compression Stockings',
    'notes': '', 'sms_consent': 'Yes',
}

def message(fields=None, *, html=False, sender='forms@web3forms.com', subject='New MommyCareKit Request — Synthetic Patient'):
    fields = FORM if fields is None else fields
    msg = EmailMessage()
    msg['From'] = sender
    msg['To'] = 'patients@strykefox.com'
    msg['Subject'] = subject
    msg['Message-ID'] = '<synthetic-one@web3forms.com>'
    if html:
        body = '<html><body><table>' + ''.join('<tr><td>'+k+'</td><td>'+v+'</td></tr>' for k,v in fields.items()) + '</table></body></html>'
        msg.set_content(body, subtype='html')
    else:
        msg.set_content('\n'.join(k+': '+v for k,v in fields.items()))
    return msg.as_bytes()


class ParserTests(unittest.TestCase):
    def test_plaintext_form_creates_matching_payload(self):
        value = parse_form(message(), account_id='123')
        self.assertEqual(value['first_name'], 'Synthetic')
        self.assertEqual(value['last_name'], 'Patient')
        self.assertEqual(value['state'], 'NV')
        self.assertEqual(value['date_of_birth'], '1990-01-01')
        self.assertTrue(value['medicaid'])
        self.assertEqual(len(value['items_requested']), 2)
        self.assertIn('phone/fax unclassified', value['notes'])
        self.assertIsNone(value['provider_phone'])
    def test_html_table_labels_and_blank_values(self):
        value = parse_form(message(html=True), account_id='123')
        self.assertEqual(value['email'], FORM['email'])
        self.assertEqual(value['due_date'], FORM['due_date'])
    def test_label_then_value_format(self):
        values = fields_from_text('Name\nSynthetic Patient\nEmail\nsynthetic@example.test\nDate of Birth\n1990-01-01')
        self.assertEqual(values['name'], 'Synthetic Patient')
        self.assertEqual(values['date_of_birth'], '1990-01-01')
    def test_missing_dob_is_preserved_not_fabricated(self):
        value = parse_form(message({**FORM, 'date_of_birth': ''}), account_id='123')
        self.assertIsNone(value['date_of_birth'])
    def test_full_last_name_preserved(self):
        value = parse_form(message({**FORM, 'name': 'Synthetic Morales Perez'}, subject='New MommyCareKit Request — Synthetic Morales Perez'), account_id='123')
        self.assertEqual(value['last_name'], 'Morales Perez')
    def test_unrelated_sender_rejected(self):
        with self.assertRaisesRegex(ParseError, 'sender_not_allowed'):
            parse_form(message(sender='attacker@example.test'), account_id='123')
    def test_reply_is_not_new_intake(self):
        with self.assertRaisesRegex(ParseError, 'not_mck_form'):
            parse_form(message(subject='Re: New MommyCareKit Request — Synthetic Patient'), account_id='123')
    def test_subject_and_patient_must_match(self):
        with self.assertRaisesRegex(ParseError, 'subject_identity_conflict'):
            parse_form(message(subject='New MommyCareKit Request — Someone Else'), account_id='123')
    def test_duplicate_conflicting_identity_rejected(self):
        with self.assertRaisesRegex(ParseError, 'conflicting_form_fields'):
            fields_from_text('Name: Synthetic Patient\nEmail: one@example.test\nEmail: two@example.test')
    def test_source_reference_stable_without_phi(self):
        a = parse_form(message(), account_id='123')['source_reference']
        self.assertEqual(a, parse_form(message(html=True), account_id='123')['source_reference'])
        self.assertNotIn('Patient', a)
        self.assertNotEqual(a, parse_form(message(), account_id='456')['source_reference'])
    def test_missing_state_not_defaulted_to_nevada(self):
        self.assertIsNone(parse_form(message({**FORM, 'state': ''}), account_id='123')['state'])
    def test_runtime_requires_explicit_start_boundary(self):
        with self.assertRaises(ValueError): bridge.settings_for({})
        with self.assertRaises(ValueError): bridge.settings_for({'MCK_EMAIL_START_AT':'2026-10-20T00:00:00'})
        self.assertTrue(bridge.settings_for({'MCK_EMAIL_START_AT':'2026-10-20T00:00:00Z'})[2])


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.app = SimpleNamespace(state=SimpleNamespace(db_pool=object()))
        self.ref = {'messageId':'1001','folderId':'456','receivedTime':'1792500537032', 'subject':'New MommyCareKit Request — Synthetic Patient'}
        self.mail = SimpleNamespace(config=SimpleNamespace(account_id='123', folder_id='456'),
                                    _request=AsyncMock(return_value={'content':message().decode()}))
        self.receipt = {'complete':True,'record_id':'MCK-TEST1',
            'spear':{'status':'confirmed','patient_id':'patient-1','order_id':'order-1'},
            'sheet':{'status':'confirmed'},'welcome':{'status':'confirmed','message_id':'mail-1'}}
    async def process(self, dry_run=False):
        return await bridge.process_message(self.app,self.mail,None,'org-1',self.ref,dry_run=dry_run)
    async def test_dry_run_never_calls_write_workflow(self):
        with patch.object(bridge,'is_completed',AsyncMock(return_value=False)), patch.object(bridge,'mck_intake',AsyncMock()) as intake, patch.object(bridge,'record_event',AsyncMock()) as event:
            result=await self.process(True)
            self.assertEqual(result['status'],'parsed_read_only')
            self.assertTrue(result['dob_present'])
            intake.assert_not_awaited(); event.assert_not_awaited()
    async def test_completed_message_is_not_parsed_or_sent_again(self):
        with patch.object(bridge,'is_completed',AsyncMock(return_value=True)), patch.object(bridge,'mck_intake',AsyncMock()) as intake:
            self.assertEqual((await self.process())['status'],'already_completed')
            intake.assert_not_awaited(); self.mail._request.assert_not_awaited()
    async def test_pipeline_uses_canonical_handler_and_confirms_readback(self):
        response=SimpleNamespace(body=json.dumps(self.receipt).encode())
        with patch.object(bridge,'is_completed',AsyncMock(return_value=False)), patch.object(bridge,'mck_intake',AsyncMock(return_value=response)) as intake, patch.object(bridge,'readback',AsyncMock(return_value={'spear':True,'patient_details':True,'heather_cover':True})), patch.object(bridge,'record_event',AsyncMock()) as event:
            result=await self.process()
            self.assertEqual(result['status'],'completed')
            self.assertEqual(result['patient_id'],'patient-1')
            self.assertEqual(intake.call_args.args[0].date_of_birth,'1990-01-01')
            self.assertEqual(event.call_args.args[2],'mck.email.completed')
            self.assertNotIn('Synthetic Patient',json.dumps(result))
            self.assertNotIn('synthetic@example.test',json.dumps(result))
    async def test_partial_result_is_retryable_pending_not_complete(self):
        self.receipt['complete']=False; self.receipt['sheet']={'status':'failed','error':'ZohoSheetError'}
        with patch.object(bridge,'is_completed',AsyncMock(return_value=False)), patch.object(bridge,'mck_intake',AsyncMock(return_value=SimpleNamespace(body=json.dumps(self.receipt).encode()))), patch.object(bridge,'record_event',AsyncMock()) as event:
            result=await self.process()
            self.assertEqual(result['status'],'pending')
            self.assertEqual(event.call_args.args[2],'mck.email.pending')
    async def test_sheet_index_lag_does_not_claim_readback(self):
        with patch.object(bridge,'is_completed',AsyncMock(return_value=False)), patch.object(bridge,'mck_intake',AsyncMock(return_value=SimpleNamespace(body=json.dumps(self.receipt).encode()))), patch.object(bridge,'readback',AsyncMock(return_value={'spear':True,'patient_details':False,'heather_cover':True})), patch.object(bridge,'record_event',AsyncMock()):
            self.assertEqual((await self.process())['status'],'pending')
    async def test_candidates_only_use_mapped_folder_and_time_boundary(self):
        mail=SimpleNamespace(config=SimpleNamespace(account_id='123',folder_id='456'),_request=AsyncMock(return_value=[self.ref,{**self.ref,'messageId':'1002','folderId':'999'},{**self.ref,'messageId':'1003','receivedTime':'1000000000000'}]))
        rows=await bridge.candidates(mail,1792500000,set())
        self.assertEqual([r['messageId'] for r in rows],['1001'])
    async def test_specific_replay_filter_is_respected(self):
        mail=SimpleNamespace(config=SimpleNamespace(account_id='123',folder_id='456'),_request=AsyncMock(return_value=[self.ref]))
        self.assertEqual(await bridge.candidates(mail,1792500000,{'9999'}),[])


class PollCadenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_worker_honors_twelve_hour_interval_and_bounds(self):
        for configured, expected in [('43200', 43200), ('60', 60), ('1', 60), ('86400', 43200)]:
            with self.subTest(configured=configured):
                env = {'MCK_EMAIL_INTAKE_ENABLED': 'true',
                       'MCK_EMAIL_START_AT': '2026-10-20T00:00:00Z',
                       'MCK_EMAIL_POLL_SECONDS': configured}
                sleep = AsyncMock(side_effect=[None, bridge.asyncio.CancelledError()])
                poll = AsyncMock(return_value={'checked': 0})
                with patch.dict(os.environ, env, clear=True), patch.object(bridge.asyncio, 'sleep', sleep), patch.object(bridge, 'poll_once', poll), patch.object(bridge, 'emit') as emit:
                    with self.assertRaises(bridge.asyncio.CancelledError):
                        await bridge.email_worker(object())
                    self.assertEqual([c.args[0] for c in sleep.await_args_list], [5, expected])
                    poll.assert_awaited_once()
                    self.assertEqual(emit.call_args_list[0].args[0]['interval_seconds'], expected)

    async def test_failed_poll_keeps_twelve_hour_wait(self):
        env = {'MCK_EMAIL_INTAKE_ENABLED': 'true',
               'MCK_EMAIL_START_AT': '2026-10-20T00:00:00Z',
               'MCK_EMAIL_POLL_SECONDS': '43200'}
        sleep = AsyncMock(side_effect=[None, bridge.asyncio.CancelledError()])
        with patch.dict(os.environ, env, clear=True), patch.object(bridge.asyncio, 'sleep', sleep), patch.object(bridge, 'poll_once', AsyncMock(side_effect=RuntimeError('synthetic'))), patch.object(bridge, 'emit'):
            with self.assertRaises(bridge.asyncio.CancelledError):
                await bridge.email_worker(object())
            self.assertEqual([c.args[0] for c in sleep.await_args_list], [5, 43200])

    async def test_invalid_interval_never_polls(self):
        env = {'MCK_EMAIL_INTAKE_ENABLED': 'true',
               'MCK_EMAIL_START_AT': '2026-10-20T00:00:00Z',
               'MCK_EMAIL_POLL_SECONDS': 'invalid'}
        with patch.dict(os.environ, env, clear=True), patch.object(bridge, 'poll_once', AsyncMock()) as poll, patch.object(bridge, 'emit') as emit:
            await bridge.email_worker(object())
            poll.assert_not_awaited()
            emit.assert_called_once_with({'status': 'configuration_required'})

if __name__=='__main__': unittest.main()
