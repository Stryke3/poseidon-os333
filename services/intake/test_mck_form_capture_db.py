"""Database contract test using only a disposable synthetic CI schema."""
from __future__ import annotations
import json
import os
from pathlib import Path
import sys
import unittest
import uuid
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'core'))
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
                updated_at timestamptz DEFAULT now());
                CREATE TABLE orders (id uuid PRIMARY KEY,org_id uuid,patient_id uuid,
                source_reference text,intake_payload jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());
                CREATE TABLE workflow_events (org_id uuid,order_id uuid,event_type text,payload jsonb);''')
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
    async def test_wrong_organization_does_not_touch_record(self):
        with self.assertRaisesRegex(FormCaptureError,'spear_record_unconfirmed'):
            await capture_form_data(self.pool,'00000000-0000-0000-0000-000000000099',self.payload,self.parsed,self.spear)


if __name__=='__main__': unittest.main()
