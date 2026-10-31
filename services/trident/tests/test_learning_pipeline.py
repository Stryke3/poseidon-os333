from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import uuid
import tempfile
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import httpx
import jwt
import pytest

SERVICE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(SERVICE))
sys.path.insert(0,str(SERVICE.parent/'shared'))
os.environ.setdefault('LOCAL_PROOF_MODE','true')
_model_directory=tempfile.TemporaryDirectory()
os.environ.setdefault('TRIDENT_MODELS_DIR',_model_directory.name)
import main
from learning_pipeline import ensure_schema,event_record,ingest_sources,index_outcomes,json_safe,rows,outcome_record

ORG='00000000-0000-0000-0000-000000000001'
OTHER='00000000-0000-0000-0000-000000000002'


class Cursor:
    def __init__(self,conn): self.conn=conn; self.data=[]; self.rowcount=0
    async def __aenter__(self): return self
    async def __aexit__(self,*args): pass
    async def execute(self,sql,params=()):
        if 'advisory_xact_lock' in sql and not self.conn.depth:
            raise AssertionError('Transaction-scoped locks require an explicit transaction on the production autocommit pool')
        request=json.dumps({'sql':sql,'params':params},default=lambda v:{'__bytes':base64.b64encode(v).decode()} if isinstance(v,bytes) else str(v))
        self.conn.process.stdin.write((request+'\n').encode()); await self.conn.process.stdin.drain()
        response=json.loads(await self.conn.process.stdout.readline())
        if 'error' in response: raise RuntimeError(response['error']+' SQL: '+sql)
        self.data=response['rows']; self.rowcount=response['rowcount']
        numeric={field['name'] for field in response.get('fields',[]) if field.get('dataTypeID')==1700}
        for row in self.data:
            for key,value in row.items():
                if isinstance(value,dict) and '__bytes' in value: row[key]=base64.b64decode(value['__bytes'])
                elif key in numeric and value is not None: row[key]=Decimal(str(value))
                elif value and isinstance(value,str) and key=='at': row[key]=datetime.fromisoformat(value.replace('Z','+00:00'))
    async def executemany(self,sql,values):
        for params in values: await self.execute(sql,params)
    async def fetchall(self): return self.data
    async def fetchone(self): return self.data[0] if self.data else None


class Connection:
    def __init__(self,process): self.process=process;self.depth=0
    def cursor(self,**kwargs): return Cursor(self)
    def transaction(self): return Transaction(self)
    async def __aenter__(self): return self
    async def __aexit__(self,*args): pass


class Transaction:
    def __init__(self,conn): self.conn=conn;self.name=''
    async def __aenter__(self):
        self.name=f'test_savepoint_{self.conn.depth}'
        async with self.conn.cursor() as cur:
            await cur.execute('BEGIN' if self.conn.depth==0 else 'SAVEPOINT '+self.name)
        self.conn.depth+=1
    async def __aexit__(self,typ,*args):
        self.conn.depth-=1
        async with self.conn.cursor() as cur:
            await cur.execute(('ROLLBACK' if typ else 'COMMIT') if self.conn.depth==0 else
                              ('ROLLBACK TO SAVEPOINT ' if typ else 'RELEASE SAVEPOINT ')+self.name)


SCHEMA='''
CREATE TABLE orders(id uuid PRIMARY KEY,org_id uuid);
CREATE TABLE ledger_claims(patient_control_number text PRIMARY KEY,payer_id text,payer_name text);
CREATE TABLE ledger_claim_links(patient_control_number text PRIMARY KEY,order_id uuid);
CREATE TABLE ledger_events(event_id bigserial PRIMARY KEY,patient_control_number text,event_type text,
    workbench_data jsonb,occurred_at timestamptz DEFAULT NOW(),detail text,payer text,stedi_transaction_id text);
CREATE TABLE appeals(id uuid PRIMARY KEY,org_id uuid,order_id uuid,status text,submitted_at timestamptz,
    created_at timestamptz DEFAULT NOW(),updated_at timestamptz,letter_storage_key text,supporting_docs jsonb);
CREATE TABLE payment_outcomes(id uuid PRIMARY KEY,org_id uuid,order_id uuid,claim_number text,payer_id text,payer_name text,
    hcpcs_code text,icd10_code text,diagnosis_codes text,billed_amount numeric,paid_amount numeric,is_denial boolean,
    denial_reason text,carc_code text,rarc_code text,date_of_service date,adjudicated_at timestamptz,created_at timestamptz DEFAULT NOW());
CREATE TABLE trident_training_ledger(id bigserial PRIMARY KEY,training_run_id uuid,trigger_type text,
    records_ingested int,records_labeled int,model_version text,accuracy_before numeric,accuracy_after numeric,
    accuracy_delta numeric,status text,started_at timestamptz DEFAULT NOW(),completed_at timestamptz);
CREATE TABLE learned_rates(org_id uuid,payer_id text,hcpcs_code text,avg_paid numeric,median_paid numeric,min_paid numeric,
    max_paid numeric,denial_rate numeric,sample_count int,last_updated timestamptz,UNIQUE(org_id,payer_id,hcpcs_code));
CREATE TABLE payers(id text PRIMARY KEY,name text);
CREATE TABLE trident_rules(payer_id text,hcpcs_code text,modifier_recommendation text,notes text);
CREATE TABLE denials(id text); CREATE TABLE claim_submissions(id text); CREATE TABLE eligibility_checks(id text);
'''


async def database():
    bridge=os.environ.get('TRIDENT_PGLITE_BRIDGE')
    if not bridge: pytest.skip('Set TRIDENT_PGLITE_BRIDGE for PostgreSQL integration tests')
    proc=await asyncio.create_subprocess_exec('node',bridge,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE)
    conn=Connection(proc)
    async with conn.cursor() as cur: await cur.execute(SCHEMA)
    await ensure_schema(conn)
    return conn


async def close(conn):
    conn.process.stdin.close(); await conn.process.wait()


def test_json_metadata_rejects_model_objects():
    from decimal import Decimal
    assert json.loads(json.dumps(json_safe({'accuracy':Decimal('.5'),'at':datetime.now(timezone.utc)})))['accuracy']==.5
    with pytest.raises(TypeError): json_safe({'model':object()})


def test_operator_and_refile_evidence_never_create_a_payer_label():
    source={'event_id':10,'event_type':'claim_diagnosis_refile','patient_control_number':'SYN-1',
            'workbench_data':{'status':'SUBMITTED','sourceTransactionId':'original-837','receipt':'accepted'}}
    record=event_record({'event':source,'org_id':ORG})
    assert record['record_kind']=='REBILL'
    assert record['claim_version']=='original-837'
    assert record['evidence']['training_state']=='EVIDENCE_INDEXED'
    assert 'is_denial' not in record['evidence']


@pytest.mark.asyncio
async def test_ingestion_backfill_replay_and_late_commit_are_idempotent():
    conn=await database()
    try:
        order=str(uuid.uuid4())
        async with conn.cursor() as cur:
            await cur.execute('INSERT INTO orders VALUES(%s,%s)',(order,ORG))
            await cur.execute("INSERT INTO ledger_claims VALUES('SYN-1','SYN','Synthetic insurer')")
            await cur.execute("INSERT INTO ledger_claim_links VALUES('SYN-1',%s)",(order,))
            await cur.execute("INSERT INTO ledger_events(event_id,patient_control_number,event_type,workbench_data) VALUES(20,'SYN-1','trident_rcm_feedback',%s::jsonb)",(json.dumps({'orgId':ORG,'feedback_id':'synthetic-feedback','orderId':order}),))
        assert (await ingest_sources(conn))['ingested']==1
        assert (await ingest_sources(conn))['ingested']==0
        async with conn.cursor() as cur:
            await cur.execute("INSERT INTO ledger_events(event_id,patient_control_number,event_type) VALUES(10,'SYN-1','appeal_submitted')")
        assert (await ingest_sources(conn))['ingested']==1
        assert len(await rows(conn,'SELECT * FROM trident_feedback_ingestion'))==2
        assert len(await rows(conn,'SELECT * FROM payment_outcomes'))==0
    finally: await close(conn)


@pytest.mark.asyncio
async def test_training_persists_membership_json_and_restart_load_and_weekly_cadence(monkeypatch):
    conn=await database()
    try:
        async with conn.cursor() as cur:
            for i in range(48):
                await cur.execute('''INSERT INTO payment_outcomes(id,org_id,order_id,claim_number,payer_id,hcpcs_code,
                  billed_amount,paid_amount,is_denial,date_of_service,adjudicated_at)
                  VALUES(%s,%s,%s,%s,'SYN','L0648',100,%s,%s,'2026-10-01',NOW())''',
                  (str(uuid.uuid4()),ORG,str(uuid.uuid4()),f'SYN-{i}',0 if i%2 else 75,bool(i%2)))
            # Pending and unclassified records must never get a supervised label.
            await cur.execute("INSERT INTO payment_outcomes(id,org_id,payer_id,hcpcs_code,is_denial) VALUES(%s,%s,'SYN','L0648',NULL)",(str(uuid.uuid4()),ORG))
        result=await main._train_trident_model(conn,'integration_test')
        assert result['status']=='completed'
        assert result['record_count']==48
        json.dumps(main._serialize(result))
        assert len(await rows(conn,'SELECT * FROM trident_training_membership'))==48
        artifact=await main._durable_model(conn)
        assert artifact['version']==result['version'] and artifact['model'] is not None
        assert not main.TRIDENT_MODEL_PATH.exists()
        async def unexpected(*args): raise AssertionError('Weekly model trained again before seven days elapsed')
        monkeypatch.setattr(main,'_run_learning_sync',unexpected)
        monkeypatch.setattr(main.settings,'trident_learning_mode','weekly')
        app=SimpleNamespace(state=SimpleNamespace(db_pool=SimpleNamespace(connection=lambda:conn)))
        await main._maybe_run_learning_refresh(app)
    finally: await close(conn)


@pytest.mark.asyncio
async def test_library_auth_org_isolation_and_insurance_kit_search():
    conn=await database()
    try:
        async with conn.cursor() as cur:
            await cur.execute("INSERT INTO payers VALUES('SYN','Synthetic insurer')")
            await cur.execute("INSERT INTO trident_rules VALUES('SYN','L0648','KX','Synthetic reference')")
            for org,code,paid in [(ORG,'L0648',75),(OTHER,'L0648',999),(ORG,'E0676',20)]:
                await cur.execute("INSERT INTO payment_outcomes(id,org_id,payer_id,hcpcs_code,paid_amount,is_denial,adjudicated_at) VALUES(%s,%s,'SYN',%s,%s,false,NOW())",(str(uuid.uuid4()),org,code,paid))
        main.app.state.db_pool=SimpleNamespace(connection=lambda:conn)
        token=jwt.encode({'sub':'synthetic-admin','org_id':ORG,'role':'admin','exp':datetime.now(timezone.utc)+timedelta(minutes=5)},main.settings.secret_key,algorithm=main.settings.jwt_algorithm)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://localhost') as client:
            assert (await client.get('/api/v1/trident/library')).status_code==401
            response=await client.get('/api/v1/trident/library?query=Synthetic&code=L0648',headers={'Authorization':'Bearer '+token})
            assert response.status_code==200,response.text
            data=response.json()
            assert len(data['observed'])==1 and data['observed'][0]['mean_paid']==75
            assert len(data['rules'])==1
            assert (await client.get('/api/v1/trident/library?org_id='+OTHER,headers={'Authorization':'Bearer '+token})).status_code==403
    finally: await close(conn)
