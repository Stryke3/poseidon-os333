"""Synthetic parser and queue contracts. No live service is contacted."""
from __future__ import annotations
import asyncio
from datetime import datetime,timezone
from email.message import EmailMessage
from html import escape
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock,patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"shared"))
import mck_mail_listener as m

FIELDS={"Name":"Synthetic Example","Email":"synthetic@example.test","Phone":"7025550100","Due date":"2030-01-12","State":"Nevada","Insurance plan":"Medicaid / CHIP","Referring physician":"My obgyn","Physician office contact":"7025550101","Date of birth":"1990-01-02","Medicaid":"yes","Items requested":"Maternity Back Brace / Belly Band, Compression Stockings","Notes":"","Sms consent":"Yes"}
REF={"messageId":"1234567890","folderId":"200","receivedTime":"1792475000000","subject":"New MommyCareKit Request - Synthetic Example","fromAddress":"forms@web3forms.com"}

def raw(fields=None, html=True, sender="forms@web3forms.com"):
    f=FIELDS if fields is None else fields
    message=EmailMessage()
    message["From"]=sender
    message["Subject"]="New MommyCareKit Request - Synthetic Example"
    if html:
        message.set_content("Plain alternative")
        message.add_alternative("<html><head><style>Name: bad</style></head><body><p>Hello</p>"+"".join("<div><strong>"+escape(k)+"</strong><p>"+escape(v)+"</p></div>" for k,v in f.items())+"<p>Visitor IP: 192.0.2.1</p><p>Unsubscribe</p></body></html>",subtype="html")
    else:
        message.set_content("\n".join(k+": "+v for k,v in f.items())+"\nVisitor IP: 192.0.2.1")
    return message.as_string()

class ParserTests(unittest.TestCase):
    def payload(self,**changes): return m.form_payload(raw({**FIELDS,**changes}),REF,"100")
    def test_html_template_and_empty_fields_keep_alignment(self):
        p=self.payload()
        self.assertEqual(p["first_name"],"Synthetic")
        self.assertEqual(p["last_name"],"Example")
        self.assertIsNone(p["provider_name"])
        self.assertEqual(p["provider_practice"],"My obgyn")
        self.assertEqual(p["state"],"NV")
        self.assertEqual(len(p["items_requested"]),2)
        self.assertNotIn("Unsubscribe",p["notes"])
        self.assertNotIn("hcpcs_codes",p)
    def test_plain_template(self):
        p=m.form_payload(raw(html=False),REF,"100")
        self.assertEqual(p["date_of_birth"],"1990-01-02")
    def test_missing_dob_and_email_are_preserved(self):
        p=self.payload(**{"Date of birth":"","Email":""})
        self.assertIsNone(p["date_of_birth"])
        self.assertIsNone(p["email"])
    def test_source_is_provider_identity_not_patient_data(self):
        self.assertEqual(self.payload()["source_reference"],"zoho-mail:100:1234567890")
    def test_compound_last_name_preserved(self):
        self.assertEqual(self.payload(Name="Synthetic Example Patient")["last_name"],"Example Patient")
    def test_specific_provider_remains_provider(self):
        p=self.payload(**{"Referring physician":"Dr Synthetic"})
        self.assertEqual(p["provider_name"],"Dr Synthetic")
        self.assertIsNone(p["provider_practice"])
    def test_blank_medicaid_is_not_invented(self):
        self.assertIsNone(self.payload(Medicaid="")["medicaid"])
    def test_future_dob_review(self):
        with self.assertRaisesRegex(m.FormReview,"dob_needs_confirmation"): self.payload(**{"Date of birth":"2099-01-01"})
    def test_equal_dob_due_review(self):
        with self.assertRaisesRegex(m.FormReview,"dob_equals_due_date"): self.payload(**{"Due date":"1990-01-02"})
    def test_unknown_product_review(self):
        with self.assertRaisesRegex(m.FormReview,"requested_product_needs_review"): self.payload(**{"Items requested":"Unrequested medicine"})
    def test_other_sender_is_ignored(self):
        self.assertFalse(m.is_form({**REF,"fromAddress":"forms@evil.example"},"web3forms.com"))
    def test_reply_subject_is_ignored(self):
        self.assertFalse(m.is_form({**REF,"subject":"Re: New MommyCareKit Request"},"web3forms.com"))
    def test_raw_sender_must_match_envelope(self):
        with self.assertRaisesRegex(m.FormReview,"message_sender_mismatch"):
            m.form_payload(raw(sender="other@web3forms.com"),REF,"100")
    def test_large_message_review(self):
        with self.assertRaisesRegex(m.FormReview,"raw_message_invalid"): m.form_payload("x"*1048577,REF,"100")
    def test_unverified_core_destination_rejected(self):
        for url in ("http://api.strykefox.com","https://evil.example","https://api.strykefox.com@evil.example","https://api.strykefox.com/other","https://api.strykefox.com?secret=x"):
            with self.assertRaises(ValueError): m.safe_core_url(url)
    def test_approved_core_destinations(self):
        self.assertEqual(m.safe_core_url("https://api.strykefox.com/"),"https://api.strykefox.com")
        self.assertEqual(m.safe_core_url("http://core.railway.internal:8080"),"http://core.railway.internal:8080")
    def test_received_timestamp_must_be_provider_milliseconds(self):
        with self.assertRaises(m.FormReview): m.received_ms({"receivedTime":"2026-10-20"})
        with self.assertRaises(m.FormReview): m.received_ms({"receivedTime":"1792475000"})
    def test_read_state_never_changed_by_listing(self):
        params=m.listing_params("200",1)
        self.assertEqual(params["status"],"all")
        self.assertEqual(params["sortorder"],"false")

class OutcomeTests(unittest.TestCase):
    def test_confirmed(self):
        self.assertEqual(m.outcome(200,{"complete":True},1)[0],"complete")
    def test_missing_dob_is_review(self):
        self.assertEqual(m.outcome(207,{"spear":{"status":"blocked"}},1)[0],"review")
    def test_unknown_send_is_never_automatically_resent(self):
        self.assertEqual(m.outcome(207,{"welcome":{"status":"uncertain"}},1)[0],"uncertain")
    def test_known_presend_failure_retries_bounded(self):
        self.assertEqual(m.outcome(207,{"welcome":{"status":"failed"}},1)[0],"retry")
        self.assertEqual(m.outcome(207,{"welcome":{"status":"failed"}},3)[0],"review")
    def test_non_json_response_is_uncertain(self):
        self.assertEqual(m.outcome(200,[],1)[0],"uncertain")

class QueueTests(unittest.IsolatedAsyncioTestCase):
    async def test_discovery_queues_only_new_trusted_forms_and_deduplicates(self):
        cfg=SimpleNamespace(account_id="100",folder_id="200")
        cutoff=int(REF["receivedTime"])-1000
        conn=SimpleNamespace(execute=AsyncMock(),commit=AsyncMock())
        older={**REF,"messageId":"12","receivedTime":str(cutoff-1)}
        unrelated={**REF,"messageId":"13","subject":"Invoice"}
        mail=SimpleNamespace(_request=AsyncMock(return_value=[REF,REF,older,unrelated]))
        events=[]
        async def record(*args): events.append(args[-1])
        with patch.object(m,"one",AsyncMock(return_value=None)),patch.object(m,"latest_receipt",AsyncMock(return_value={})),patch.object(m,"receipt",record):
            result=await m.discover(conn,mail,cfg,"org",cutoff,"web3forms.com")
        self.assertEqual(result["queued"],1)
        self.assertEqual(len(events),1)
        self.assertEqual(events[0]["message_id"],REF["messageId"])
        self.assertNotIn("subject",events[0])
        self.assertNotIn("Synthetic",json.dumps(events))
    async def test_existing_receipt_is_not_requeued(self):
        cfg=SimpleNamespace(account_id="100",folder_id="200")
        conn=SimpleNamespace(execute=AsyncMock(),commit=AsyncMock())
        mail=SimpleNamespace(_request=AsyncMock(return_value=[REF]))
        rec=AsyncMock()
        with patch.object(m,"one",AsyncMock(return_value=None)),patch.object(m,"latest_receipt",AsyncMock(return_value={"status":"complete"})),patch.object(m,"receipt",rec):
            result=await m.discover(conn,mail,cfg,"org",int(REF["receivedTime"])-1,"web3forms.com")
        rec.assert_not_awaited()
        self.assertEqual(result["queued"],0)
    async def test_partial_core_result_is_logged_without_patient_values(self):
        base={"message_id":REF["messageId"],"source_reference":"zoho-mail:100:"+REF["messageId"],"received_ms":int(REF["receivedTime"]),"sender_address":REF["fromAddress"],"attempts":0}
        cfg=SimpleNamespace(account_id="100",folder_id="200")
        mail=SimpleNamespace(_request=AsyncMock(return_value={"content":raw()}))
        body={"complete":False,"spear":{"status":"confirmed"},"sheet":{"status":"confirmed"},"welcome":{"status":"failed"}}
        client=SimpleNamespace(post=AsyncMock(return_value=SimpleNamespace(status_code=207,json=lambda:body)))
        rec=AsyncMock()
        with patch.object(m,"one",AsyncMock(return_value={"payload":base})),patch.object(m,"receipt",rec):
            result=await m.process_one(None,client,mail,cfg,"org","https://api.strykefox.com","synthetic-key","web3forms.com")
        self.assertEqual(result["retry"],1)
        self.assertEqual(client.post.await_args.kwargs["headers"]["Idempotency-Key"],base["source_reference"])
        logs=json.dumps([c.args[-1] for c in rec.await_args_list])
        self.assertNotIn("Synthetic Example",logs)
        self.assertNotIn("synthetic@example.test",logs)
    async def test_invalid_form_cannot_call_core(self):
        base={"message_id":REF["messageId"],"source_reference":"zoho-mail:100:"+REF["messageId"],"received_ms":int(REF["receivedTime"]),"sender_address":REF["fromAddress"],"attempts":0}
        mail=SimpleNamespace(_request=AsyncMock(return_value={"content":raw({**FIELDS,"Name":"Incomplete"})}))
        client=SimpleNamespace(post=AsyncMock())
        with patch.object(m,"one",AsyncMock(return_value={"payload":base})),patch.object(m,"receipt",AsyncMock()):
            result=await m.process_one(None,client,mail,SimpleNamespace(account_id="100",folder_id="200"),"org","https://api.strykefox.com","synthetic-key","web3forms.com")
        self.assertEqual(result["review"],1)
        client.post.assert_not_awaited()
    async def test_empty_queue_has_no_outbound_transaction(self):
        client=SimpleNamespace(post=AsyncMock())
        with patch.object(m,"one",AsyncMock(return_value=None)):
            self.assertEqual(await m.process_one(None,client,None,SimpleNamespace(account_id="100",folder_id="200"),None,None,None,None),{"processed":0})
        client.post.assert_not_awaited()

if __name__=="__main__": unittest.main()
