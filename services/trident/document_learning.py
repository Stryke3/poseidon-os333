"""Revisioned learning corpus for uploaded appeals, EOBs and supporting files.

Source documents remain immutable. Corpus text is private to the source org and
is reference evidence, not an adjudication label or an instruction to an agent.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import pickle
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from learning_pipeline import execute, fingerprint, json_safe, rows, table_exists

def verified_org(value):
    try:
        return str(uuid.UUID(str(value)))
    except ValueError:
        return None


async def discover_documents(conn) -> dict:
    """Metadata anti-join finds late uploads and content revisions on every pass.

    No filename matching establishes patient identity. Unlinked files are
    quarantined until their source acquires an authoritative organization.
    """
    sources = []
    coverage = {}
    scanned_tables = set()
    if await table_exists(conn, 'order_documents'):
        scanned_tables.add('order_documents')
        chart = await rows(conn, """SELECT 'order_documents' AS source_table,d.id::text AS source_id,
            (to_jsonb(d)-'metadata') || jsonb_build_object('metadata',
              COALESCE(d.metadata,'{}'::jsonb)-'content_base64',
              'content_revision',md5(COALESCE(d.metadata->>'content_base64',''))) AS item,
            to_jsonb(o) AS order_context
            FROM order_documents d LEFT JOIN orders o ON o.id=d.order_id"""
        )
        sources.extend(chart); coverage['order_documents'] = len(chart)
    if await table_exists(conn, 'spear_store_snapshots'):
        scanned_tables.add('spear_store_snapshots')
        snapshots = await rows(conn, """SELECT 'spear_store_snapshots' AS source_table,
            s.store_key||':'||section.name||':'||(d.item->>'id') AS source_id,
            (d.item-'content_base64')||jsonb_build_object('store_key',s.store_key,'section',section.name,
              'content_revision',md5(COALESCE(d.item->>'content_base64','')),
              'id',d.item->>'id','core_order_id',c.item->>'core_order_id') AS item,
            to_jsonb(o) AS order_context
            FROM spear_store_snapshots s
            CROSS JOIN (VALUES ('documents'),('artifacts')) section(name)
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.store->section.name,'[]'::jsonb)) d(item)
            LEFT JOIN LATERAL (SELECT case_row.value AS item FROM jsonb_array_elements(COALESCE(s.store->'cases','[]'::jsonb)) case_row(value)
              WHERE case_row.value->>'id'=d.item->>'case_id' LIMIT 1) c ON true
            LEFT JOIN LATERAL (SELECT o.* FROM orders o WHERE o.id::text=replace(
              COALESCE(NULLIF(c.item->>'core_order_id',''),c.item->>'order_id'),'ord_','')
              OR o.id::text IN(SELECT replace(to_jsonb(l)->>'order_id','ord_','') FROM ledger_claim_links l
                 WHERE to_jsonb(l)->>'case_id'=d.item->>'case_id')
              ORDER BY o.id LIMIT 2) o ON true
            WHERE s.store_key=%s AND d.item->>'id' IS NOT NULL""",
            (os.getenv('SPEAR_SQL_STORE_KEY', 'spear-production'),))
        # A document linked to multiple orders must not choose an arbitrary patient/org.
        grouped = {}
        for row in snapshots:
            grouped.setdefault(row['source_id'], []).append(row)
        for group in grouped.values():
            row = group[0]
            if len(group) > 1:
                row['order_context'] = None
            sources.append(row)
        coverage['spear_store_documents_and_artifacts'] = len(grouped)
    if await table_exists(conn, 'remittance_batches'):
        scanned_tables.add('remittance_batches')
        batches = await rows(conn, """SELECT 'remittance_batches' AS source_table,b.id::text AS source_id,
            (to_jsonb(b)-'raw_content'-'raw_x12_inbound'-'workbench_evidence') || jsonb_build_object(
              'content_revision',md5(COALESCE(to_jsonb(b)->>'raw_content','')||COALESCE(to_jsonb(b)->>'raw_x12_inbound','')||COALESCE(to_jsonb(b)->>'workbench_evidence','')),
              'kind','835_SOURCE','mime_type','text/plain') AS item,NULL AS order_context
            FROM remittance_batches b"""
        )
        sources.extend(batches); coverage['remittance_batches'] = len(batches)
    for table in ('eob_claims', 'remittance_claims'):
        if not await table_exists(conn, table):
            continue
        scanned_tables.add(table)
        # Structured EOB/835 facts are retained even when the original attachment
        # has not yet been linked. They never manufacture payment_outcomes.
        dependencies = [('eob_line_items','claim_id')] if table=='eob_claims' else [
            ('remittance_service_lines','remittance_claim_id'),('remittance_adjustments','remittance_claim_id')]
        revisions = []
        for child, fk in dependencies:
            if await table_exists(conn, child):
                revisions.append(f"COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)::text FROM {child} l WHERE l.{fk}::text=e.id::text),'')")
        line_revision = "||".join(revisions) or "''"
        records = await rows(conn, f"""SELECT '{table}' AS source_table,e.id::text AS source_id,
            to_jsonb(e)-'patient_name'-'member_id'-'patient_control_number'-'patient_id'
              -'patient_first_name'-'patient_last_name'-'subscriber_id'-'patient_member_id'
              ||jsonb_build_object('line_revision',md5({line_revision})) AS item,
            to_jsonb(o) AS order_context FROM {table} e
            LEFT JOIN orders o ON o.id::text=replace(to_jsonb(e)->>'order_id','ord_','')"""
        )
        sources.extend(records); coverage[table] = len(records)
    indexed = 0
    existing = {r['source_key']:r for r in await rows(conn,
        'SELECT source_key,org_id::text AS org_id,order_id,active FROM trident_learning_documents')}
    for source in sources:
        item = source['item']; context = source.get('order_context') or {}
        table = source['source_table']; sid = source['source_id']
        revision = fingerprint(item)
        key = f'{table}:{sid}:{revision}'
        org = verified_org(context.get('org_id') or item.get('org_id'))
        deleted = str(item.get('status', '')).lower() in {'deleted', 'void', 'voided'}
        order_id = str(context.get('id') or item.get('order_id') or '') or None
        old = existing.get(key)
        if old and old['org_id']==org and old['order_id']==order_id and old['active']==(not deleted):
            continue
        # Each revision is immutable; current-source activation controls serving.
        await execute(conn, '''UPDATE trident_learning_documents SET active=false
            WHERE source_table=%s AND source_id=%s AND source_key<>%s AND active''', (table, sid, key))
        count = await execute(conn, '''INSERT INTO trident_learning_documents
            (source_key,source_table,source_id,source_revision,content_token,org_id,order_id,case_id,payer_id,payer_name,
             filename,document_kind,mime_type,status,active)
            VALUES(%s,%s,%s,%s,%s,%s::uuid,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT(source_key) DO UPDATE SET org_id=EXCLUDED.org_id,order_id=EXCLUDED.order_id,
              status=CASE WHEN trident_learning_documents.status='UNLINKED' AND EXCLUDED.org_id IS NOT NULL
                THEN 'PENDING' ELSE trident_learning_documents.status END,active=EXCLUDED.active
            WHERE trident_learning_documents.org_id IS DISTINCT FROM EXCLUDED.org_id
              OR trident_learning_documents.order_id IS DISTINCT FROM EXCLUDED.order_id
              OR trident_learning_documents.active IS DISTINCT FROM EXCLUDED.active''',
            (key, table, sid, revision, item.get('content_revision'), org, order_id,
             item.get('case_id'), context.get('payer_id') or item.get('payer_id'), item.get('payer_name'),
             str(item.get('file_name') or item.get('filename') or f'{table}-{sid}.json'),
             str(item.get('doc_type') or item.get('kind') or table),
             item.get('mime_type') or item.get('content_type') or 'application/json',
             'PENDING' if org else 'UNLINKED', not deleted))
        indexed += count
    # Removed source records remain in history but are no longer searchable or
    # included in a later model. Never serve deleted snapshot documents.
    for source_table in scanned_tables:
        await execute(conn, '''UPDATE trident_learning_documents SET active=false WHERE active
            AND source_table=%s AND NOT(source_id=ANY(%s::text[]))''',
            (source_table,[s['source_id'] for s in sources if s['source_table']==source_table]))
    result = {'discovered': len(sources), 'indexed': indexed, 'sources': coverage}
    await execute(conn, '''INSERT INTO trident_learning_jobs(job_key,last_success_at,last_result,last_error)
        VALUES('document_discovery',NOW(),%s::jsonb,NULL) ON CONFLICT(job_key) DO UPDATE
        SET last_success_at=NOW(),last_result=EXCLUDED.last_result,last_error=NULL''', (json.dumps(result),))
    return result


async def source_bytes(conn, record):
    table = record['source_table']; sid = record['source_id']
    if table == 'order_documents':
        data = await rows(conn, "SELECT metadata->>'content_base64' AS content FROM order_documents WHERE id::text=%s", (sid,))
    elif table == 'spear_store_snapshots':
        store, section, doc_id = sid.split(':', 2)
        data = await rows(conn, """SELECT d->>'content_base64' AS content FROM spear_store_snapshots s
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.store->%s,'[]'::jsonb)) d
            WHERE s.store_key=%s AND d->>'id'=%s""", (section, store, doc_id))
    elif table == 'remittance_batches':
        data = await rows(conn,"SELECT to_jsonb(b) AS item FROM remittance_batches b WHERE id::text=%s",(sid,))
        if data:
            item = data[0]['item']
            text = item.get('raw_content') or item.get('raw_x12_inbound') or item.get('workbench_evidence')
            if isinstance(text,dict): text=json.dumps(text,sort_keys=True)
            # Exact retained batch evidence, including unmatched 835 claims.
            return base64.b64encode(text.encode()).decode() if text else None
    elif table in {'eob_claims', 'remittance_claims'}:
        data = await rows(conn, f'SELECT to_jsonb(e) AS item FROM {table} e WHERE id::text=%s', (sid,))
        if data:
            # Structured learning text includes payer facts and codes only.
            allowed = ('claim_number','payer_claim_number','payer_id','payer_name','claim_status',
                       'total_billed','total_allowed','total_paid','total_patient_responsibility',
                       'date_of_service','date_of_remittance','raw_source','charge_amount','paid_amount',
                       'patient_responsibility','claim_status_code','adjustment_reason_code')
            item = {k: data[0]['item'].get(k) for k in allowed if data[0]['item'].get(k) is not None}
            line_tables = [('eob_line_items','claim_id')] if table == 'eob_claims' else [
                ('remittance_service_lines','remittance_claim_id'),('remittance_adjustments','remittance_claim_id')]
            for lines_table, foreign_key in line_tables:
                if await table_exists(conn, lines_table):
                    lines = await rows(conn, f"SELECT to_jsonb(l)-'id'-'{foreign_key}' AS item FROM {lines_table} l WHERE {foreign_key}::text=%s ORDER BY id", (sid,))
                    item[lines_table] = [r['item'] for r in lines]
            return base64.b64encode(json.dumps(item).encode()).decode()
    else:
        data = []
    return data[0].get('content') if data else None


async def process_documents(conn, limit=8, extractor=None):
    """Bounded batches, isolated parser, durable retries. A busy file cannot
    prevent later uploads from entering the corpus. Caller holds worker lock."""
    queue = await rows(conn, '''SELECT * FROM trident_learning_documents WHERE active AND org_id IS NOT NULL
        AND status IN('PENDING','RETRY') AND next_attempt_at<=NOW()
        ORDER BY attempts,created_at,source_key LIMIT %s''', (limit,))
    result = {'processed': 0, 'extracted': 0, 'held': 0}
    for record in queue:
        content = await source_bytes(conn, record)
        if content and record['source_table']!='remittance_batches' and record.get('content_token') and hashlib.md5(content.encode(),usedforsecurity=False).hexdigest()!=record['content_token']:
            parsed = {'status':'SOURCE_CHANGED','error':'AWAITING_SOURCE_REDISCOVERY','text':''}
        elif not content:
            parsed = {'status': 'MISSING_CONTENT', 'error': 'SOURCE_BYTES_UNAVAILABLE', 'text': ''}
        else:
            try:
                if extractor:
                    parsed = await extractor(content, record['mime_type'])
                elif record['mime_type'] in {'application/json','application/edi-x12','text/plain','text/csv'}:
                    decoded = base64.b64decode(content,validate=True)
                    text = decoded.decode('utf-8-sig')
                    parsed = {'status':'EXTRACTED' if text.strip() else 'NEEDS_REVIEW','text':text,
                        'sha256':hashlib.sha256(decoded).hexdigest(),'page_count':1,
                        'extracted_pages':int(bool(text.strip())),'ocr_pages':0}
                else:
                    proc = await asyncio.create_subprocess_exec(sys.executable, str(Path(__file__).with_name('document_extract.py')),
                        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
                    try:
                        output, _ = await asyncio.wait_for(proc.communicate(json.dumps({
                            'content_base64': content, 'mime_type': record['mime_type']}).encode()), timeout=180)
                    except BaseException:
                        if proc.returncode is None: proc.kill()
                        await proc.wait()
                        raise
                    parsed = json.loads(output)
            except (Exception, asyncio.TimeoutError):
                parsed = {'status': 'RETRY', 'error': 'EXTRACTION_RETRY', 'text': ''}
        text = parsed.get('text') or ''
        codes = sorted(set(re.findall(r'\b[A-V][0-9]{4}\b', text.upper())))
        await execute(conn, '''UPDATE trident_learning_documents SET status=%s,content_sha256=%s,
            text_content=%s,page_count=%s,extracted_pages=%s,ocr_pages=%s,hcpcs=%s::text[],last_error=%s,
            attempts=attempts+1,next_attempt_at=NOW()+INTERVAL '1 hour',extracted_at=NOW()
            WHERE source_key=%s''', (parsed['status'], parsed.get('sha256'), text, parsed.get('page_count'),
                parsed.get('extracted_pages'), parsed.get('ocr_pages'), codes, parsed.get('error'), record['source_key']))
        result['processed'] += 1
        result['extracted' if parsed['status'] == 'EXTRACTED' else 'held'] += 1
    return result


async def train_document_models(conn, force=False):
    """Weekly private TF-IDF reference models, with exact file/page membership.
    These use document language, not synthetic paid/denied labels."""
    organizations = await rows(conn, "SELECT DISTINCT org_id::text AS org_id FROM trident_learning_documents WHERE active AND status='EXTRACTED' AND org_id IS NOT NULL")
    trained = []
    for org in organizations:
        latest = await rows(conn, "SELECT EXISTS(SELECT 1 FROM trident_document_models WHERE org_id=%s::uuid AND created_at>NOW()-INTERVAL '7 days') AS fresh", (org['org_id'],))
        if not force and latest[0]['fresh']:
            continue
        docs = await rows(conn, """SELECT source_key,content_sha256,text_content,page_count,extracted_pages
            FROM trident_learning_documents WHERE org_id=%s::uuid AND active AND status='EXTRACTED'
            AND length(trim(text_content))>0 ORDER BY source_key""", (org['org_id'],))
        # Chunk all text, never just the first pages of long packets.
        chunks = []; keys = []
        for doc in docs:
            text = doc['text_content']
            for start in range(0, len(text), 3000):
                chunks.append(text[start:start+3200]); keys.append(doc['source_key'])
        if not chunks:
            continue
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=40000, sublinear_tf=True)
        try:
            matrix = vectorizer.fit_transform(chunks)
        except ValueError:
            continue
        manifest = [{k: d[k] for k in ('source_key','content_sha256','page_count','extracted_pages')} for d in docs]
        version = f"documents-{datetime.now(timezone.utc):%Y%m%d%H%M%S}-{uuid.uuid4().hex[:8]}"
        await execute(conn, '''INSERT INTO trident_document_models(model_version,org_id,artifact,source_manifest,document_count)
            VALUES(%s,%s::uuid,%s,%s::jsonb,%s)''', (version,org['org_id'],
            pickle.dumps({'vectorizer':vectorizer,'matrix':matrix,'source_keys':keys}),json.dumps(manifest),len(docs)))
        trained.append({'model_version':version,'documents':len(docs),'chunks':len(chunks)})
    return trained


async def document_library(conn, org_id, query='', codes=None, include_text=False, insurance=''):
    counts = await rows(conn, '''SELECT status,COUNT(*) AS count FROM trident_learning_documents
        WHERE org_id=%s::uuid AND active GROUP BY status''', (org_id,))
    models = await rows(conn, '''SELECT model_version,document_count,created_at,source_manifest FROM trident_document_models
        WHERE org_id=%s::uuid ORDER BY created_at DESC LIMIT 5''', (org_id,))
    membership = {m['source_key']:models[0]['model_version'] for m in models[0]['source_manifest']} if models else {}
    for model in models: model.pop('source_manifest')
    found = await rows(conn, '''SELECT source_key,source_table,source_id,filename,document_kind,status,
        content_sha256,page_count,extracted_pages,ocr_pages,last_error,extracted_at,
        LEFT(text_content,600) AS excerpt,COUNT(*) OVER() AS matched_files
        FROM trident_learning_documents WHERE org_id=%s::uuid AND active
        AND (%s='' OR STRPOS(LOWER(COALESCE(payer_id,'')||' '||COALESCE(payer_name,'')||' '||filename||' '||COALESCE(text_content,'')),LOWER(%s))>0)
        AND (%s='' OR STRPOS(LOWER(COALESCE(payer_id,'')||' '||COALESCE(payer_name,'')||' '||COALESCE(text_content,'')),LOWER(%s))>0
          OR payer_id IN(SELECT id FROM payers WHERE STRPOS(LOWER(name),LOWER(%s))>0))
        AND (cardinality(%s::text[])=0 OR hcpcs && %s::text[])
        ORDER BY extracted_at DESC NULLS LAST,created_at DESC LIMIT 100''', (org_id,query,query,insurance,insurance,insurance,codes or [],codes or [])) if include_text else []
    for doc in found: doc['model_version']=membership.get(doc['source_key'])
    # Use the learned corpus model to rank relevant reference files. Newer files
    # remain immediately searchable before their next weekly model inclusion.
    if query and found:
        saved = await rows(conn, 'SELECT artifact FROM trident_document_models WHERE org_id=%s::uuid ORDER BY created_at DESC LIMIT 1', (org_id,))
        if saved:
            model = pickle.loads(bytes(saved[0]['artifact']))
            scores = (model['matrix'] @ model['vectorizer'].transform([query]).T).toarray().ravel()
            ranks = {}
            for key, score in zip(model['source_keys'], scores): ranks[key] = max(ranks.get(key,0),float(score))
            found.sort(key=lambda d:ranks.get(d['source_key'],0),reverse=True)
    return json_safe({'counts':{r['status']:r['count'] for r in counts},'models':models,'files':found,
                     'matched_files':found[0]['matched_files'] if found else 0})
