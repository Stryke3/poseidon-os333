"""Synthetic credential bootstrap tests. No live credentials or records are used."""
from __future__ import annotations
import copy
import json
from pathlib import Path
import sys
import unittest
from urllib.parse import parse_qs
import httpx
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'shared'))
from zoho_bootstrap import Config, bootstrap

BASE = {
    'ZOHO_BOOTSTRAP_ENABLED': 'true',
    'ZOHO_OAUTH_CLIENT_ID': 'synthetic-client',
    'ZOHO_OAUTH_CLIENT_SECRET': 'synthetic-secret-0000000000000000',
    'MCK_ORG_ID': '00000000-0000-0000-0000-000000000001',
    'EMAIL_INTAKE_USERNAME': 'patients@strykefox.com',
    'ZOHO_REGION': 'com', 'DATABASE_URL': 'postgresql://synthetic.test',
    'MCK_ZOHO_SHEET_RESOURCE_ID': 'synthetic-workbook',
    'MCK_PAID_NOTIFICATION_ENABLED': 'false',
}

class Vault:
    def __init__(self):
        self.row = {'grant_digest': None, 'encrypted_token': None, 'state': 'empty'}
        self.reservations = 0
    def __call__(self, *_): return self
    def __enter__(self): return self
    def __exit__(self, *_): pass
    def read(self): return dict(self.row)
    def reserve(self, digest):
        self.reservations += 1
        self.row.update(grant_digest=digest, state='exchange_pending')
    def save(self, token): self.row.update(encrypted_token=token, state='token_saved')
    def state(self, value): self.row['state'] = value

class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.env = copy.deepcopy(BASE)
        self.vault = Vault()
        self.calls = []
        self.mailbox = BASE['EMAIL_INTAKE_USERNAME']
        self.override = None
    def handler(self, request):
        self.calls.append(request)
        self.assertFalse(request.url.params)
        if self.override:
            result = self.override(request)
            if result is not None: return result
        if request.url.path == '/oauth/v2/token':
            params = parse_qs(request.content.decode())
            if params['grant_type'] == ['authorization_code']:
                self.assertEqual(self.vault.row['state'], 'exchange_pending')
                return httpx.Response(200, json={'access_token': 'synthetic-access', 'refresh_token': 'synthetic-refresh'})
            return httpx.Response(200, json={'access_token': 'synthetic-access'})
        self.assertEqual(request.headers['authorization'], 'Zoho-oauthtoken synthetic-access')
        if request.url.path == '/api/accounts':
            return httpx.Response(200, json={'status': {'code':200}, 'data':[
                {'accountId':'9999999999999999999', 'primaryEmailAddress':self.mailbox}]})
        if request.url.path.endswith('/folders'):
            return httpx.Response(200, json={'status': {'code':200}, 'data':[
                {'folderId':'8888888888888888888', 'folderType':'Inbox', 'folderName':'Inbox', 'path':'/Inbox'},
                {'folderId':'12', 'folderType':'Sent', 'folderName':'Sent', 'path':'/Sent'},
                {'folderId':'13', 'folderType':'Inbox', 'folderName':'Forms', 'path':'/Forms'}]})
        if request.url.path == '/api/v2/synthetic-workbook':
            self.assertEqual(parse_qs(request.content.decode()), {'method':['worksheet.list']})
            return httpx.Response(200, json={'status':'success','method':'worksheet.list',
                'worksheet_names':[{'worksheet_name':'Patient Details'},{'worksheet_name':'Heather Cover'}]})
        raise AssertionError('Unexpected outbound endpoint')
    def client(self, **kwargs):
        self.assertFalse(kwargs['follow_redirects'])
        return httpx.Client(transport=httpx.MockTransport(self.handler), **kwargs)
    def run_setup(self):
        return bootstrap(self.env, vault_factory=self.vault, client_factory=self.client)
    def grant(self, value='synthetic-grant'):
        self.env['ZOHO_OAUTH_GRANT_CODE'] = value

    def test_waits_without_generating_or_guessing_grant(self):
        self.assertEqual(self.run_setup()['status'], 'waiting_for_authorization_code')
        self.assertEqual(self.calls, [])
    def test_disabled_does_nothing_and_removes_transient_grant(self):
        self.env['ZOHO_BOOTSTRAP_ENABLED']='false'
        self.grant()
        self.assertEqual(self.run_setup()['status'], 'disabled')
        self.assertEqual(self.calls, [])
        self.assertNotIn('ZOHO_OAUTH_GRANT_CODE', self.env)
    def test_exchange_encrypts_token_and_verifies_mailbox_and_sheet(self):
        self.grant()
        result = self.run_setup()
        self.assertEqual(result['status'], 'mail_and_sheet_verified')
        self.assertEqual(result['account_id'], '9999999999999999999')
        self.assertEqual(self.env['ZOHO_OAUTH_REFRESH_TOKEN'], 'synthetic-refresh')
        self.assertEqual(self.env['ZOHO_MAIL_FOLDER_ID'], '8888888888888888888')
        self.assertNotIn('synthetic-refresh', json.dumps(self.vault.row))
        self.assertNotIn('synthetic-grant', json.dumps(self.vault.row))
        self.assertNotIn('synthetic-secret', repr(Config.read(BASE)))
        self.assertNotIn('ZOHO_OAUTH_GRANT_CODE', self.env)
        self.assertEqual(self.env['MCK_PAID_NOTIFICATION_ENABLED'], 'false')
        self.assertFalse(any('/messages' in r.url.path for r in self.calls))
    def test_restart_uses_encrypted_refresh_not_grant_again(self):
        self.grant(); self.run_setup()
        self.env = copy.deepcopy(BASE); self.grant()
        self.assertEqual(self.run_setup()['status'], 'mail_and_sheet_verified')
        grants=[parse_qs(r.content.decode())['grant_type'][0] for r in self.calls if r.url.path=='/oauth/v2/token']
        self.assertEqual(grants,['authorization_code','refresh_token'])
        self.assertEqual(self.vault.reservations,1)
    def test_new_code_does_not_silently_replace_existing_grant(self):
        self.grant(); self.run_setup()
        self.env = copy.deepcopy(BASE); self.grant('another-synthetic-grant')
        count=len(self.calls)
        self.assertEqual(self.run_setup()['status'],'existing_grant_preserved_rotation_required')
        self.assertEqual(len(self.calls),count)
    def test_token_survives_sheet_outage(self):
        self.override=lambda r: httpx.Response(503,json={}) if '/api/v2/' in r.url.path else None
        self.grant()
        self.assertEqual(self.run_setup()['status'],'mail_verified_sheet_pending')
        self.assertEqual(self.vault.row['state'],'token_saved')
        self.assertTrue(self.vault.row['encrypted_token'])
        self.env=copy.deepcopy(BASE); self.override=None
        self.assertEqual(self.run_setup()['status'],'mail_and_sheet_verified')
    def test_wrong_mailbox_never_populates_service_credentials(self):
        self.mailbox='other@strykefox.com'; self.grant()
        self.assertEqual(self.run_setup()['status'],'expected_mailbox_not_uniquely_verified')
        self.assertNotIn('ZOHO_OAUTH_REFRESH_TOKEN',self.env)
        self.assertNotIn('ZOHO_MAIL_ACCOUNT_ID',self.env)
        self.assertTrue(self.vault.row['encrypted_token'])
    def test_known_existing_mail_mapping_cannot_be_overwritten(self):
        self.env['ZOHO_MAIL_ACCOUNT_ID']='111'; self.grant()
        self.assertEqual(self.run_setup()['status'],'existing_mail_mapping_conflicts')
        self.assertEqual(self.env['ZOHO_MAIL_ACCOUNT_ID'],'111')
    def test_ambiguous_exchange_is_not_retried(self):
        def timeout(r):
            if r.url.path=='/oauth/v2/token': raise httpx.ReadTimeout('secret-synthetic-grant')
        self.override=timeout; self.grant()
        self.assertEqual(self.run_setup()['status'],'oauth_response_uncertain')
        self.grant()
        self.assertEqual(self.run_setup()['status'],'new_authorization_code_required')
        self.assertEqual(len(self.calls),1)
    def test_expired_code_can_be_replaced_with_fresh_code(self):
        self.override=lambda r: httpx.Response(400,json={'error':'invalid_code'})
        self.grant()
        self.assertEqual(self.run_setup()['status'],'oauth_request_failed')
        self.override=None; self.grant('fresh-synthetic-code')
        self.assertEqual(self.run_setup()['status'],'mail_and_sheet_verified')
    def test_wrong_region_is_rejected_before_request(self):
        self.env['ZOHO_REGION']='attacker.test'; self.grant()
        self.assertEqual(self.run_setup()['status'],'region_invalid')
        self.assertEqual(self.calls,[])
    def test_cipher_is_bound_to_org_client_mailbox_and_secret(self):
        cipher=Config.read(BASE).cipher().encrypt(b'synthetic-refresh')
        for key, value in [('MCK_ORG_ID','00000000-0000-0000-0000-000000000002'),
                           ('ZOHO_OAUTH_CLIENT_ID','other-client'),
                           ('EMAIL_INTAKE_USERNAME','other@strykefox.com'),
                           ('ZOHO_OAUTH_CLIENT_SECRET','different-secret')]:
            env={**BASE,key:value}
            with self.assertRaises(Exception): Config.read(env).cipher().decrypt(cipher)
    def test_html_error_response_is_never_returned(self):
        self.override=lambda r: httpx.Response(502,text='client_secret=DO-NOT-LOG')
        self.grant()
        result=self.run_setup()
        self.assertNotIn('DO-NOT-LOG',json.dumps(result))
        self.assertEqual(result['status'],'oauth_request_failed')
    def test_canadian_host_mapping(self):
        config=Config.read({**BASE,'ZOHO_REGION':'ca'})
        self.assertEqual(config.origin('mail'),'https://mail.zohocloud.ca')
        self.assertEqual(config.origin('accounts'),'https://accounts.zohocloud.ca')
    def test_missing_expected_worksheet_is_detected_without_any_write(self):
        self.override=lambda r: httpx.Response(200,json={'status':'success','worksheet_names':[]}) if '/api/v2/' in r.url.path else None
        self.grant()
        result=self.run_setup()
        self.assertEqual(result['status'],'mail_verified_sheet_pending')
        self.assertEqual(result['reason'],'worksheet_names_need_mapping')
    def test_missing_refresh_token_cannot_be_marked_authorized(self):
        self.override=lambda r: httpx.Response(200,json={'access_token':'synthetic-access'}) if r.url.path=='/oauth/v2/token' else None
        self.grant()
        self.assertEqual(self.run_setup()['status'],'refresh_token_not_returned')
        self.assertIsNone(self.vault.row['encrypted_token'])
    def folder_response(self, folders):
        self.override=lambda r: httpx.Response(200,json={'status':{'code':200},'data':folders}) if r.url.path.endswith('/folders') else None
    def test_custom_inbox_type_and_nested_inbox_do_not_replace_root(self):
        self.folder_response([
            {'folderId':'11','folderType':'Inbox','folderName':'Custom','path':'/Custom'},
            {'folderId':'12','folderType':'Inbox','folderName':'Inbox','path':'/Imported/Inbox'},
            {'folderId':'13','folderType':'Inbox','folderName':'Inbox','path':'/Inbox'},
        ])
        self.grant()
        self.assertEqual(self.run_setup()['status'],'mail_and_sheet_verified')
        self.assertEqual(self.env['ZOHO_MAIL_FOLDER_ID'],'13')
    def test_two_root_inboxes_fail_closed(self):
        self.folder_response([
            {'folderId':'11','folderType':'Inbox','folderName':'Inbox','path':'/Inbox'},
            {'folderId':'12','folderType':'Inbox','folderName':'Inbox','path':'/Inbox'},
        ])
        self.grant()
        self.assertEqual(self.run_setup()['status'],'inbox_not_uniquely_verified')
        self.assertNotIn('ZOHO_MAIL_FOLDER_ID',self.env)
    def test_type_alone_cannot_identify_inbox(self):
        self.folder_response([{'folderId':'11','folderType':'Inbox'}])
        self.grant()
        self.assertEqual(self.run_setup()['status'],'inbox_not_uniquely_verified')
    def test_explicit_name_with_missing_path_is_supported(self):
        self.folder_response([{'folderId':'11','folderType':'Inbox','folderName':'Inbox'}])
        self.grant()
        self.assertEqual(self.run_setup()['status'],'mail_and_sheet_verified')
    def test_inbox_failure_recovers_with_stored_token_without_new_grant(self):
        self.folder_response([{'folderId':'11','folderType':'Inbox','path':'/Custom','folderName':'Custom'}])
        self.grant()
        self.assertEqual(self.run_setup()['status'],'inbox_not_uniquely_verified')
        self.assertTrue(self.vault.row['encrypted_token'])
        self.env=copy.deepcopy(BASE)
        self.override=None
        self.assertEqual(self.run_setup()['status'],'mail_and_sheet_verified')
        grants=[parse_qs(r.content.decode())['grant_type'][0] for r in self.calls if r.url.path=='/oauth/v2/token']
        self.assertEqual(grants,['authorization_code','refresh_token'])
        self.assertEqual(self.vault.reservations,1)

if __name__=='__main__': unittest.main()
