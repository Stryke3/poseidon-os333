"""End-to-end corpus receipts, complete extraction and tenant isolation."""
import base64
import json
import uuid
from datetime import datetime, timedelta, timezone

import pymupdf
import pytest

from test_learning_pipeline import database, close, ORG, OTHER
from learning_pipeline import rows
from document_learning import discover_documents, process_documents, train_document_models, document_library
from document_extract import extract


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
    # A real raster scan beneath a readable header must not be skipped.
    document[-1].insert_image(pymupdf.Rect(0,90,595,800),stream=scan.get_pixmap(dpi=150).tobytes('png'))
    result = extract(document.tobytes(),'application/pdf')
    assert result['status']=='EXTRACTED'
    assert result['page_count']==result['extracted_pages']==4
    assert result['ocr_pages']>=1
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
async def test_legacy_order_number_linkage_requires_a_unique_order():
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
                    'content_base64':base64.b64encode(b'Synthetic authorization appeal').decode()}]}
            await cur.execute('INSERT INTO spear_store_snapshots VALUES(%s,%s::jsonb)',('spear-production',json.dumps(data)))
        await discover_documents(conn)
        found=await rows(conn,'SELECT source_id,org_id::text AS org_id,status FROM trident_learning_documents ORDER BY source_id')
        assert found[0]['org_id'] is None and found[0]['status']=='UNLINKED'
        assert found[1]['org_id']==ORG and found[1]['status']=='PENDING'
    finally:
        await close(conn)
