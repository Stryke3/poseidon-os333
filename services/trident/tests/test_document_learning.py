"""End-to-end corpus receipts, complete extraction and tenant isolation."""
import base64
import json
import uuid
from datetime import datetime, timedelta, timezone

import pymupdf
import pytest

from test_learning_pipeline import database, close, ORG, OTHER
from learning_pipeline import rows, ensure_schema
from document_learning import discover_documents, process_documents, train_document_models, document_library
from document_extract import extract


@pytest.mark.asyncio
async def test_retained_case_and_appeal_facts_reach_model_without_reconstructing_files_or_labels(monkeypatch):
    from learning_pipeline import execute
    monkeypatch.setenv('TRIDENT_SPEAR_SQL_DOCUMENT_ORG_ID',ORG)
    conn=await database()
    try:
        source={'cases':[{'id':'case-syn','org_id':ORG,'patient_name':'Private Identity','dob':'1980-01-02',
             'payer':'Synthetic insurer','hcpcs':['E0676'],'source_icd':['SYN'],'billing_status':'appeal_pending'},
            {'id':'case-other','org_id':OTHER,'payer':'Other insurer','hcpcs':['L0650']}],
            'documents':[{'id':'missing','case_id':'case-syn','org_id':ORG,'filename':'unavailable.pdf','content_base64':'','kind':'signed_swo'}]}
        async with conn.cursor() as cur:
            await cur.execute('CREATE TABLE spear_store_snapshots(store_key text,store jsonb)')
            await cur.execute('INSERT INTO spear_store_snapshots VALUES(%s,%s::jsonb)',('spear-production',json.dumps(source)))
        await execute(conn,'''INSERT INTO trident_feedback_ingestion(source_key,org_id,record_kind,source_table,source_id,source_hash,evidence)
            VALUES('activity-syn',%s::uuid,'REBILL','ledger_events','synthetic','source-hash',%s::jsonb)''',
            (ORG,json.dumps({'status':'submitted','hcpcs':['E0676'],'notes':'Synthetic corrected claim after authorization'})))
        assert (await discover_documents(conn))['discovered']==4
        await process_documents(conn)
        assert (await train_document_models(conn,force=True,org_id=ORG))[0]['documents']==2
        files=await rows(conn,'SELECT source_table,text_content,status FROM trident_learning_documents WHERE org_id=%s::uuid',(ORG,))
        facts=next(f for f in files if f['source_table']=='spear_case_facts')
        assert 'Private Identity' not in facts['text_content'] and '1980-01-02' not in facts['text_content']
        assert json.loads(facts['text_content'])['original_files_reconstructed'] is False
        assert next(f for f in files if f['source_table']=='spear_store_snapshots')['status']=='MISSING_CONTENT'
        assert (await rows(conn,'SELECT COUNT(*) AS n FROM payment_outcomes'))[0]['n']==0
        assert (await rows(conn,'SELECT store FROM spear_store_snapshots'))[0]['store']==source
    finally:await close(conn)


def test_oversized_fax_raster_is_bounded_and_sparse_ocr_recovers(monkeypatch):
    import document_extract
    from types import SimpleNamespace
    document=pymupdf.open();page=document.new_page(width=20_000,height=30_000)
    raster=pymupdf.Pixmap(document_extract.raster_page(page))
    assert raster.width*raster.height<=document_extract.MAX_RASTER_PIXELS+10_000
    assert max(raster.width,raster.height)<=document_extract.MAX_RASTER_EDGE+1
    calls=[]
    def ocr(command,**kwargs):
        calls.append(command[-1])
        text=b'' if command[-1]=='3' else b'Synthetic insurance card payer plan identifier and authorization supporting documentation for E0676 claim'
        return SimpleNamespace(stdout=text)
    monkeypatch.setattr(document_extract.subprocess,'run',ocr)
    result=extract(document.tobytes(),'application/pdf')
    assert result['status']=='EXTRACTED' and 'E0676' in result['text']
    assert calls==['3','11']
    assert result['details']['parser_version']==3


def test_independent_pdf_engine_reads_every_page():
    from document_extract import extract_poppler
    pdf=pymupdf.open()
    for number in range(3):
        page=pdf.new_page();page.insert_text((72,72),f'Synthetic supporting record page {number+1}. Authorization E0676 evidence preserved.',fontsize=12)
    result=extract_poppler(pdf.tobytes())
    assert result['status']=='EXTRACTED'
    assert result['page_count']==result['extracted_pages']==result['ocr_pages']==3
    assert '[Page 3]' in result['text'] and result['details']['parser_engine']=='POPPLER'


@pytest.mark.asyncio
async def test_recovery_api_requires_a_signed_admin_in_the_same_org():
    import main,httpx,jwt
    token=lambda role:jwt.encode({'sub':'synthetic-user','org_id':ORG,'role':role,
        'exp':datetime.now(timezone.utc)+timedelta(minutes=5)},main.settings.secret_key,algorithm=main.settings.jwt_algorithm)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://localhost') as client:
        assert (await client.post('/api/v1/trident/documents/recover',json={})).status_code==401
        assert (await client.post('/api/v1/trident/documents/recover',json={},headers={'Authorization':'Bearer '+token('billing')})).status_code==403
        assert (await client.post('/api/v1/trident/documents/recover?org_id='+OTHER,json={},headers={'Authorization':'Bearer '+token('admin')})).status_code==403


@pytest.mark.asyncio
async def test_archive_recovery_verifies_identity_size_scope_and_keeps_source_immutable():
    import hashlib
    from document_recovery import recover_archive_copy
    conn=await database()
    try:
        pdf=pymupdf.open();page=pdf.new_page()
        page.insert_text((72,72),'Synthetic Patient DOB 01/02/1980. Payer authorization E0676 appeal source evidence for learning.',fontsize=12)
        content=pdf.tobytes();sha=hashlib.sha256(content).hexdigest()
        source={'cases':[{'id':'case-synthetic','org_id':ORG,'patient_name':'Synthetic Patient','dob':'1980-01-02'},
                         {'id':'case-different','org_id':ORG,'patient_name':'Different Patient','dob':'1980-01-02'}],
            'documents':[{'id':doc,'case_id':case,'org_id':org,'filename':'synthetic_source.pdf','kind':'source_intake',
                'content_type':'application/pdf','size':len(content),'content_base64':''}
                for doc,case,org in [('good','case-synthetic',ORG),('staging','pending-synthetic',ORG),
                                     ('wrong-patient','case-different',ORG),('other','case-synthetic',OTHER)]]}
        source['documents'][1]['case_id']='pending_synthetic'
        async with conn.cursor() as cur:
            await cur.execute('CREATE TABLE spear_store_snapshots(store_key text,store jsonb)')
            await cur.execute('INSERT INTO spear_store_snapshots VALUES(%s,%s::jsonb)',('spear-production',json.dumps(source)))
        await discover_documents(conn);await process_documents(conn)
        payload={'filename':'synthetic source.pdf','sha256':sha,'content_base64':base64.b64encode(content).decode(),
                 'provenance':{'provider':'test','file_id':'synthetic-source','url':'must-not-persist'}}
        with pytest.raises(ValueError):await recover_archive_copy(conn,ORG,{**payload,'sha256':'wrong'})
        result=await recover_archive_copy(conn,ORG,payload)
        assert result['recovered']==2
        assert (await rows(conn,'SELECT store FROM spear_store_snapshots'))[0]['store']==source
        assert (await rows(conn,'SELECT COUNT(*) AS n FROM trident_document_recoveries'))[0]['n']==2
        assert (await rows(conn,'SELECT provenance FROM trident_recovered_files'))[0]['provenance']=={'provider':'test','file_id':'synthetic-source'}
        assert (await recover_archive_copy(conn,ORG,payload))['recovered']==0
        held=await rows(conn,"SELECT source_id,status FROM trident_learning_documents WHERE status='MISSING_CONTENT'")
        assert len(held)==2
        await train_document_models(conn,force=True,org_id=ORG)
        manifest=(await rows(conn,'SELECT source_manifest FROM trident_document_models'))[0]['source_manifest']
        assert len(manifest)==2 and all(m['extraction_details']['content_origin']=='RECOVERED_ARCHIVE_COPY' for m in manifest)
        assert (await rows(conn,'SELECT COUNT(*) AS n FROM payment_outcomes'))[0]['n']==0
    finally:await close(conn)


@pytest.mark.asyncio
async def test_repair_retries_old_parser_once_and_refreshes_only_its_org():
    from document_learning import request_document_repair,complete_document_repairs
    conn=await database()
    try:
        async with conn.cursor() as cur:
            await cur.execute('''CREATE TABLE order_documents(id uuid,order_id uuid,org_id uuid,doc_type text,
                file_name text,mime_type text,metadata jsonb,status text)''')
            for org in (ORG,OTHER):
                await cur.execute("INSERT INTO order_documents VALUES(%s,NULL,%s,'eob','synthetic.txt','text/plain',%s::jsonb,'final')",
                    (str(uuid.uuid4()),org,json.dumps({'content_base64':base64.b64encode(b'Synthetic payer E0676 authorization evidence').decode()})))
        await discover_documents(conn)
        async with conn.cursor() as cur:
            await cur.execute("UPDATE trident_learning_documents SET status='NEEDS_REVIEW',attempts=2")
        assert await request_document_repair(conn,ORG)==1
        assert await request_document_repair(conn,ORG)==0
        assert await complete_document_repairs(conn,settle_seconds=0)==[]
        await process_documents(conn)
        completed=await complete_document_repairs(conn,settle_seconds=0)
        assert len(completed)==1 and completed[0]['models'][0]['documents']==1
        assert await complete_document_repairs(conn,settle_seconds=0)==[]
        assert (await rows(conn,'SELECT org_id::text AS org_id FROM trident_document_models'))==[{'org_id':ORG}]
        assert (await rows(conn,'SELECT status FROM trident_learning_documents WHERE org_id=%s::uuid',(OTHER,)))[0]['status']=='NEEDS_REVIEW'
        assert (await rows(conn,'SELECT COUNT(*) AS n FROM payment_outcomes'))[0]['n']==0
    finally:
        await close(conn)


@pytest.mark.asyncio
async def test_warm_schema_checks_do_not_repeat_locking_ddl(monkeypatch):
    import learning_pipeline
    conn=await database()
    try:
        original=learning_pipeline.execute
        async def reject_ddl(*args,**kwargs):
            raise AssertionError('A warm schema check must not repeat DDL')
        monkeypatch.setattr(learning_pipeline,'execute',reject_ddl)
        await ensure_schema(conn)
        monkeypatch.setattr(learning_pipeline,'execute',original)
        async with conn.cursor() as cur:
            await cur.execute('DROP INDEX trident_documents_org_idx')
        await ensure_schema(conn)
        assert (await rows(conn,"SELECT to_regclass('trident_documents_org_idx') IS NOT NULL AS present"))[0]['present']
    finally:
        await close(conn)


@pytest.mark.asyncio
async def test_repeated_parser_failures_become_an_explicit_review_hold():
    conn=await database()
    try:
        async with conn.cursor() as cur:
            await cur.execute('''CREATE TABLE order_documents(id uuid,order_id uuid,org_id uuid,doc_type text,
                file_name text,mime_type text,metadata jsonb,status text)''')
            await cur.execute("INSERT INTO order_documents VALUES(%s,NULL,%s,'swo','synthetic.pdf','application/pdf',%s::jsonb,'final')",
                (str(uuid.uuid4()),ORG,json.dumps({'content_base64':base64.b64encode(b'%PDF-synthetic').decode()})))
        await discover_documents(conn)
        async def failure(*args): raise RuntimeError('Synthetic parser failure')
        assert (await process_documents(conn,extractor=failure))['held']==1
        assert (await rows(conn,'SELECT status FROM trident_learning_documents'))[0]['status']=='RETRY'
        async with conn.cursor() as cur:
            await cur.execute('UPDATE trident_learning_documents SET next_attempt_at=NOW()')
        await process_documents(conn,extractor=failure)
        held=(await rows(conn,'SELECT status,last_error FROM trident_learning_documents'))[0]
        assert held=={'status':'NEEDS_REVIEW','last_error':'REPEATED_EXTRACTION_FAILURE'}
        assert (await process_documents(conn,extractor=failure))['processed']==0
        assert await train_document_models(conn)==[]
    finally:
        await close(conn)


@pytest.mark.asyncio
async def test_all_upload_stores_revisions_models_and_org_boundaries():
    conn = await database()
    try:
        order = str(uuid.uuid4()); doc = str(uuid.uuid4()); eob = str(uuid.uuid4())
        text = 'Synthetic insurer E0676 appeal supporting records received with authorization. Final page denial reason CO-197.'
        encoded = base64.b64encode(text.encode()).decode()
        async with conn.cursor() as cur:
            await cur.execute('''CREATE TABLE order_documents(id uuid,order_id uuid,org_id uuid,doc_type text,
                file_name text,mime_type text,metadata jsonb,status text);
                CREATE TABLE spear_store_snapshots(store_key text PRIMARY KEY,store jsonb);
                CREATE TABLE eob_claims(id uuid,org_id uuid,order_id uuid,payer_name text,claim_status text);
                CREATE TABLE eob_line_items(id uuid,claim_id uuid,hcpcs_code text,paid_amount numeric)''')
            await cur.execute('INSERT INTO orders VALUES(%s,%s)', (order,ORG))
            await cur.execute("INSERT INTO order_documents VALUES(%s,%s,%s,'appeal','synthetic-appeal.txt','text/plain',%s::jsonb,'final')",
                              (doc,order,ORG,json.dumps({'content_base64':encoded})))
            await cur.execute('INSERT INTO spear_store_snapshots VALUES(%s,%s::jsonb)', ('spear-production',json.dumps({
                'cases':[{'id':'case-syn','core_order_id':order}],
                'documents':[{'id':'snapshot-syn','case_id':'case-syn','kind':'eob','filename':'synthetic-eob.txt','content_type':'text/plain','content_base64':encoded}],
                'artifacts':[{'id':'artifact-syn','case_id':'case-syn','kind':'supporting_records','filename':'synthetic-support.txt','content_type':'text/plain','content_base64':encoded}]})))
            await cur.execute("INSERT INTO eob_claims VALUES(%s,%s,%s,'Synthetic insurer','denied')",(eob,ORG,order))
            await cur.execute("INSERT INTO eob_line_items VALUES(%s,%s,'E0676',0)",(str(uuid.uuid4()),eob))
        assert (await discover_documents(conn))['discovered']==4
        assert (await discover_documents(conn))['indexed']==0
        processed = await process_documents(conn)
        assert processed['extracted']==4, await rows(conn,'SELECT source_id,status,last_error FROM trident_learning_documents')
        models = await train_document_models(conn)
        assert models[0]['documents']==4
        assert await train_document_models(conn)==[]
        result = await document_library(conn,ORG,'E0676',['E0676'],True)
        assert len(result['files'])==4
        assert all(d['content_sha256'] for d in result['files'])
        assert (await document_library(conn,OTHER,'',[],True))['files']==[]
        assert (await document_library(conn,ORG,'',[],False))['files']==[]
        assert len(await rows(conn,'SELECT * FROM payment_outcomes'))==0
        # Content changes under the same filename receive a new immutable version.
        async with conn.cursor() as cur:
            await cur.execute('UPDATE order_documents SET metadata=%s::jsonb WHERE id=%s',
                (json.dumps({'content_base64':base64.b64encode((text+' Corrected.').encode()).decode()}),doc))
            await cur.execute("UPDATE eob_line_items SET hcpcs_code='L0650' WHERE claim_id=%s",(eob,))
        assert (await discover_documents(conn))['indexed']==2
        assert len(await rows(conn,"SELECT * FROM trident_learning_documents WHERE active"))==4
        assert len(await rows(conn,"SELECT * FROM trident_learning_documents"))==6
        assert (await process_documents(conn))['extracted']==2
        # Deletion retires serving/training eligibility, retaining earlier receipts.
        async with conn.cursor() as cur:
            await cur.execute("UPDATE order_documents SET status='deleted' WHERE id=%s",(doc,))
        await discover_documents(conn)
        assert len((await document_library(conn,ORG,'',[],True))['files'])==3
        # An existing model remains weekly; new files are already searchable.
        assert await train_document_models(conn)==[]
        async with conn.cursor() as cur:
            await cur.execute("UPDATE trident_document_models SET created_at=NOW()-INTERVAL '8 days'")
        assert (await train_document_models(conn))[0]['documents']==3
    finally:
        await close(conn)


def test_pdf_reads_every_page_and_ocr_scanned_page_with_text_header():
    document = pymupdf.open()
    for i in range(4):
        page = document.new_page()
        page.insert_text((72,72),f'Synthetic appeal supporting documentation page {i+1}. E0676 authorization evidence.',fontsize=12)
    scanned = pymupdf.open(); scan = scanned.new_page()
    scan.insert_text((72,150),'LAST PAGE DENIAL CO-197 REQUIRES AUTHORIZATION',fontsize=15)
    document[0].insert_image(pymupdf.Rect(450,20,520,45),stream=scan.get_pixmap(dpi=80).tobytes('png'))
    # A real raster scan beneath a readable header must not be skipped.
    document[-1].insert_image(pymupdf.Rect(0,90,595,800),stream=scan.get_pixmap(dpi=150).tobytes('png'))
    result = extract(document.tobytes(),'application/pdf')
    assert result['status']=='EXTRACTED'
    assert result['page_count']==result['extracted_pages']==4
    assert result['ocr_pages']==1
    assert 'CO-197' in result['text']


@pytest.mark.asyncio
async def test_missing_bytes_and_unlinked_files_are_visible_holds():
    conn = await database()
    try:
        async with conn.cursor() as cur:
            await cur.execute('''CREATE TABLE order_documents(id uuid,order_id uuid,org_id uuid,doc_type text,
                file_name text,mime_type text,metadata jsonb,status text)''')
            await cur.execute("INSERT INTO order_documents VALUES(%s,NULL,%s,'eob','missing.pdf','application/pdf','{}','final')",(str(uuid.uuid4()),ORG))
            await cur.execute("INSERT INTO order_documents VALUES(%s,NULL,NULL,'eob','unlinked.pdf','application/pdf','{}','final')",(str(uuid.uuid4()),))
        await discover_documents(conn)
        assert (await process_documents(conn))['held']==1
        status = await document_library(conn,ORG,'',[],True)
        assert status['counts']=={'MISSING_CONTENT':1}
        assert status['unlinked_sources'] is None
        assert len((await document_library(conn,ORG,'',[],True,'',True))['unlinked_sources'])==1
        assert await train_document_models(conn)==[]
        assert (await rows(conn,"SELECT COUNT(*) AS n FROM trident_learning_documents WHERE status='UNLINKED'"))[0]['n']==1
    finally:
        await close(conn)


@pytest.mark.asyncio
async def test_retained_835_includes_unmatched_claims_without_posting():
    conn=await database()
    try:
        evidence={'kind':'835','batch':{'claims':[{'claim':'SYN-UNMATCHED','code':'L0650','denial':'CO-197'}]}}
        async with conn.cursor() as cur:
            await cur.execute('CREATE TABLE remittance_batches(id uuid,org_id uuid,filename text,workbench_evidence jsonb)')
            await cur.execute("INSERT INTO remittance_batches VALUES(%s,%s,'synthetic-835.json',%s::jsonb)",
                (str(uuid.uuid4()),ORG,json.dumps(evidence)))
        assert (await discover_documents(conn))['discovered']==1
        assert (await process_documents(conn))['extracted']==1
        files=(await document_library(conn,ORG,'CO-197',[],True))['files']
        assert len(files)==1 and 'SYN-UNMATCHED' in files[0]['excerpt']
        assert len(await rows(conn,'SELECT * FROM payment_outcomes'))==0
    finally:
        await close(conn)


@pytest.mark.asyncio
async def test_legacy_order_number_linkage_requires_a_unique_order(monkeypatch):
    monkeypatch.setenv('TRIDENT_SPEAR_SQL_DOCUMENT_ORG_ID',ORG)
    conn=await database()
    try:
        async with conn.cursor() as cur:
            await cur.execute('ALTER TABLE orders ADD COLUMN order_number text')
            await cur.execute('CREATE TABLE spear_store_snapshots(store_key text,store jsonb)')
            for org,number in [(ORG,'SYN-UNIQUE'),(ORG,'SYN-AMBIGUOUS'),(OTHER,'SYN-AMBIGUOUS')]:
                await cur.execute('INSERT INTO orders VALUES(%s,%s,%s)',(str(uuid.uuid4()),org,number))
            data={'cases':[{'id':'case-unique','order_id':'SYN-UNIQUE'}, {'id':'case-ambiguous','order_number':'SYN-AMBIGUOUS'}],
                'documents':[{'id':'file-unique','case_id':'case-unique','filename':'synthetic.txt','content_type':'text/plain',
                    'content_base64':base64.b64encode(b'Synthetic authorization appeal').decode()},
                    {'id':'file-ambiguous','case_id':'case-ambiguous','filename':'synthetic.txt','content_type':'text/plain',
                    'content_base64':base64.b64encode(b'Synthetic authorization appeal').decode()},
                    {'id':'file-workspace','case_id':None,'filename':'synthetic.txt','content_type':'text/plain'},
                    {'id':'file-other','case_id':None,'org_id':OTHER,'filename':'synthetic.txt','content_type':'text/plain'}]}
            await cur.execute('INSERT INTO spear_store_snapshots VALUES(%s,%s::jsonb)',('spear-production',json.dumps(data)))
        await discover_documents(conn)
        found=await rows(conn,'SELECT source_id,org_id::text AS org_id,status,order_id,scope_basis FROM trident_learning_documents ORDER BY source_id')
        assert found[0]['org_id'] is None and found[0]['status']=='UNLINKED'
        assert found[1]['org_id']==OTHER
        assert found[2]['org_id']==ORG and found[2]['status']=='PENDING'
        assert found[3]['org_id']==ORG and found[3]['order_id'] is None
        assert found[3]['scope_basis']=='CONFIGURED_SQL_STORE_OWNER'
    finally:
        await close(conn)
