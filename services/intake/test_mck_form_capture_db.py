"""Database contract test using only a disposable synthetic CI schema."""
from __future__ import annotations
import json
import asyncio
import os
from pathlib import Path
import sys
import unittest
import uuid
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'core'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'shared'))
from mck_form_capture import capture_form_data, FormCaptureError

DSN = os.getenv('MCK_CAPTURE_TEST_DSN')
ORG='00000000-0000-0000-0000-000000000001'
PATIENT='00000000-0000-0000-0000-000000000002'
ORDER='00000000-0000-0000-0000-000000000003'

class Payload(SimpleNamespace):
    def model_dump(self, **_):
        return dict(vars(self))


@unittest.skipUnless(DSN, 'Disposable database not configured')
class CaptureDbTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import psycopg
        from psycopg_pool import AsyncConnectionPool
        self.schema='mck_capture_'+uuid.uuid4().hex
        with psycopg.connect(DSN,autocommit=True) as conn:
            conn.execute('CREATE SCHEMA '+self.schema)
        self.pool=AsyncConnectionPool(DSN,min_size=1,max_size=2,open=False,
            kwargs={'autocommit':True,'options':'-c search_path='+self.schema})
        await self.pool.open()
        async with self.pool.connection() as conn:
            await conn.execute('''CREATE TABLE patients (
                id uuid PRIMARY KEY,org_id uuid,first_name text,last_name text,
                date_of_birth date,dob date,email text,phone text,gender text,
                address_line1 text,address_line2 text,city text,state text,zip_code text,
                address jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),
                updated_at timestamptz DEFAULT now());
                CREATE TABLE orders (id uuid PRIMARY KEY,org_id uuid,patient_id uuid,
                source_reference text,intake_payload jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now(),
                created_at timestamptz DEFAULT now(),physician_id uuid,clinical_data jsonb DEFAULT '{}',
                product_category text,status text,source text,order_number text,referring_physician_npi text,
                vertical text,priority text,place_of_service text,clinical_notes text,hcpcs_codes jsonb,
                source_channel text,payer_id text);
                CREATE TABLE workflow_events (org_id uuid,order_id uuid,event_type text,payload jsonb,
                created_at timestamptz DEFAULT now());''')
            await conn.execute('''CREATE TABLE order_diagnoses (id uuid PRIMARY KEY,order_id uuid,
                icd10_code text,description text,is_primary boolean,sequence integer);''')
            await conn.execute('INSERT INTO patients(id,org_id,first_name,last_name,date_of_birth,phone,state) VALUES(%s,%s,%s,%s,%s,%s,%s)',
                (PATIENT,ORG,'Synthetic','Patient','1990-01-01','7025550100','NV'))
            await conn.execute('INSERT INTO orders(id,org_id,patient_id,source_reference) VALUES(%s,%s,%s,%s)',
                (ORDER,ORG,PATIENT,'synthetic-source'))
        self.payload=Payload(source_reference='synthetic-source',first_name='Synthetic',last_name='Patient',
            date_of_birth='1990-01-01',email='synthetic@example.test',phone='7025550100',state='NV')
        self.parsed={'_form_fields':{'name':'Synthetic Patient','email':'synthetic@example.test','sms_consent':'Yes'}}
        self.spear={'patient_id':PATIENT,'order_id':ORDER}
    async def asyncTearDown(self):
        import psycopg
        await self.pool.close()
        with psycopg.connect(DSN,autocommit=True) as conn:
            conn.execute('DROP SCHEMA '+self.schema+' CASCADE')
    async def test_fill_readback_and_idempotent_replay(self):
        first=await capture_form_data(self.pool,ORG,self.payload,self.parsed,self.spear)
        self.assertFalse(first['before']['patient_email_matches'])
        self.assertEqual(first['patient_fields_filled'],['email'])
        self.assertTrue(all(first['after'].values()))
        second=await capture_form_data(self.pool,ORG,self.payload,self.parsed,self.spear)
        self.assertEqual(second['patient_fields_filled'],[])
        self.assertFalse(second['source_snapshot_added'])
        async with self.pool.connection() as conn:
            count=await (await conn.execute('SELECT count(*) FROM workflow_events')).fetchone()
        self.assertEqual(count[0],1)
    async def test_conflict_rolls_back_without_overwrite(self):
        async with self.pool.connection() as conn:
            await conn.execute('UPDATE patients SET email=%s',('other@example.test',))
        with self.assertRaisesRegex(FormCaptureError,'chart_field_conflict'):
            await capture_form_data(self.pool,ORG,self.payload,self.parsed,self.spear)
        async with self.pool.connection() as conn:
            value=await (await conn.execute('SELECT email FROM patients')).fetchone()
            snapshot=await (await conn.execute('SELECT intake_payload FROM orders')).fetchone()
        self.assertEqual(value[0],'other@example.test')
        self.assertEqual(snapshot[0],{})
    async def test_resubmission_keeps_original_and_adds_source_on_same_order(self):
        await capture_form_data(self.pool,ORG,self.payload,self.parsed,self.spear)
        async with self.pool.connection() as conn:
            original=await (await conn.execute('SELECT intake_payload FROM orders')).fetchone()
            await conn.execute("UPDATE orders SET intake_payload=intake_payload || %s::jsonb",
                (json.dumps({'_intake_source_references':['synthetic-resubmission']}),))
        self.payload.source_reference='synthetic-resubmission'
        result=await capture_form_data(self.pool,ORG,self.payload,self.parsed,self.spear)
        self.assertTrue(all(result['after'].values()))
        async with self.pool.connection() as conn:
            current=await (await conn.execute('SELECT intake_payload FROM orders')).fetchone()
            count=await (await conn.execute('SELECT count(*) FROM orders')).fetchone()
        self.assertEqual(count[0],1)
        self.assertEqual(current[0]['_source_form'],original[0]['_source_form'])
        self.assertIn('synthetic-resubmission',current[0]['_source_forms'])
    async def test_wrong_organization_does_not_touch_record(self):
        with self.assertRaisesRegex(FormCaptureError,'spear_record_unconfirmed'):
            await capture_form_data(self.pool,'00000000-0000-0000-0000-000000000099',self.payload,self.parsed,self.spear)
    async def test_two_email_sources_converge_on_one_maternity_order(self):
        os.environ.setdefault('LOCAL_PROOF_MODE','true')
        from conveyor_api import MckIntakePayload,_spear_upsert
        async with self.pool.connection() as conn:
            await conn.execute("UPDATE orders SET product_category='Mommy Care Kit',status='intake',clinical_data=%s::jsonb",
                (json.dumps({'due_date':'2027-01-15','mck_record_id':'MCK-EXISTING'}),))
        def payload(source):
            return MckIntakePayload(source_reference=source,first_name='Synthetic',last_name='Patient',
                date_of_birth='1990-01-01',due_date='2027-01-15',phone='7025550100',email='synthetic@example.test')
        results=await asyncio.gather(*[_spear_upsert(self.pool,payload(source),org_id=ORG,record_id=record)
            for source,record in [('synthetic:new-email-one','MCK-EMAILONE'),('synthetic:new-email-two','MCK-EMAILTWO')]])
        for result in results:
            self.assertEqual((result['patient_id'],result['order_id'],result['record_id']),
                             (PATIENT,ORDER,'MCK-EXISTING'))
        replay=await _spear_upsert(self.pool,payload('synthetic:new-email-one'),org_id=ORG,record_id='MCK-OTHER')
        self.assertEqual(replay['record_id'],'MCK-EXISTING')
        async with self.pool.connection() as conn:
            counts=await (await conn.execute('SELECT (SELECT count(*) FROM patients),(SELECT count(*) FROM orders)')).fetchone()
            row=await (await conn.execute('SELECT product_category,intake_payload FROM orders')).fetchone()
        self.assertEqual(counts,(1,1))
        self.assertEqual(row[0],'Mommy Care Kit')
        self.assertEqual(set(row[1]['_intake_source_references']),{'synthetic:new-email-one','synthetic:new-email-two'})


if __name__=='__main__': unittest.main()
