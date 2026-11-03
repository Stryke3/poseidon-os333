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
        snapshots = await rows(conn, """WITH scoped AS MATERIALIZED (
              SELECT store_key,store FROM spear_store_snapshots WHERE store_key=%s),
            cases AS MATERIALIZED (
              SELECT c.item FROM scoped s CROSS JOIN LATERAL
              jsonb_array_elements(COALESCE(s.store->'cases','[]'::jsonb)) c(item)),
            files AS MATERIALIZED (
              SELECT s.store_key,section.name,(d.item-'content_base64')||jsonb_build_object(
                'content_revision',md5(COALESCE(d.item->>'content_base64',''))) AS item
              FROM scoped s CROSS JOIN (VALUES ('documents'),('artifacts')) section(name)
              CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.store->section.name,'[]'::jsonb)) d(item))
            SELECT 'spear_store_snapshots' AS source_table,
            d.store_key||':'||d.name||':'||(d.item->>'id') AS source_id,
            d.item||jsonb_build_object('store_key',d.store_key,'section',d.name,
              'id',d.item->>'id','core_order_id',c.item->>'core_order_id') AS item,
            to_jsonb(o) AS order_context
            FROM files d LEFT JOIN cases c ON c.item->>'id'=d.item->>'case_id'
            LEFT JOIN LATERAL (SELECT o.* FROM orders o WHERE o.id::text=ANY(ARRAY[
              replace(c.item->>'core_order_id','ord_',''),replace(c.item->>'order_id','ord_','')])
              OR to_jsonb(o)->>'order_number'=ANY(ARRAY[c.item->>'order_number',c.item->>'order_id'])
              OR o.id::text IN(SELECT replace(to_jsonb(l)->>'order_id','ord_','') FROM ledger_claim_links l
                 WHERE to_jsonb(l)->>'case_id'=d.item->>'case_id')
              ORDER BY o.id LIMIT 2) o ON true
            WHERE d.item->>'id' IS NOT NULL""",
            (os.getenv('SPEAR_SQL_STORE_KEY', 'spear-production'),))
        # A document linked to multiple orders must not choose an arbitrary patient/org.
        grouped = {}
        for row in snapshots:
            grouped.setdefault(row['source_id'], []).append(row)
        for group in grouped.values():
            row = group[0]
            if len(group) > 1:
                row['order_context'] = None
                row['scope_conflict'] = True
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
                revisions.append(f"COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)::text FROM {child} l WHERE l.{fk}=e.id),'')")
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
    incoming = []
    existing = {r['source_key']:r for r in await rows(conn,
        'SELECT source_key,org_id::text AS org_id,order_id,active,scope_basis FROM trident_learning_documents')}
    for source in sources:
        item = source['item']; context = source.get('order_context') or {}
        table = source['source_table']; sid = source['source_id']
        revision = fingerprint(item)
        key = f'{table}:{sid}:{revision}'
        org = verified_org(context.get('org_id') or item.get('org_id'))
        scope_basis='ORDER_LINK' if context.get('org_id') else 'SOURCE_ORGANIZATION' if org else None
        # A deployment may explicitly bind its own SPEAR SQL document store to
        # its organization. This asserts file ownership only; it never invents
        # an order/patient link, overrides source orgs, or resolves ambiguity.
        if not org and table=='spear_store_snapshots' and not source.get('scope_conflict'):
            org=verified_org(os.getenv('TRIDENT_SPEAR_SQL_DOCUMENT_ORG_ID'))
            if org: scope_basis='CONFIGURED_SQL_STORE_OWNER'
        deleted = str(item.get('status', '')).lower() in {'deleted', 'void', 'voided'}
        order_id = str(context.get('id') or item.get('order_id') or '') or None
        old = existing.get(key)
        if old and old['org_id']==org and old['order_id']==order_id and old['active']==(not deleted) and old.get('scope_basis')==scope_basis:
            continue
        values = (key, table, sid, revision, item.get('content_revision'), org, order_id,
             item.get('case_id'), context.get('payer_id') or item.get('payer_id'), item.get('payer_name'),
             str(item.get('file_name') or item.get('filename') or f'{table}-{sid}.json'),
             str(item.get('doc_type') or item.get('kind') or table),
             item.get('mime_type') or item.get('content_type') or 'application/json',
             'PENDING' if org else 'UNLINKED', not deleted, scope_basis)
        incoming.append(dict(zip(('source_key','source_table','source_id','source_revision','content_token','org_id',
            'order_id','case_id','payer_id','payer_name','filename','document_kind','mime_type','status','active','scope_basis'),values)))
    if incoming:
        encoded = json.dumps(json_safe(incoming))
        # Two bulk statements rather than two round trips per historical file.
        await execute(conn, '''UPDATE trident_learning_documents d SET active=false
            FROM jsonb_to_recordset(%s::jsonb) p(source_table text,source_id text,source_key text)
            WHERE d.source_table=p.source_table AND d.source_id=p.source_id
              AND d.source_key<>p.source_key AND d.active''', (encoded,))
        indexed = await execute(conn, '''INSERT INTO trident_learning_documents
            (source_key,source_table,source_id,source_revision,content_token,org_id,order_id,case_id,payer_id,payer_name,
             filename,document_kind,mime_type,status,active,scope_basis)
            SELECT * FROM jsonb_to_recordset(%s::jsonb) p(source_key text,source_table text,source_id text,
              source_revision text,content_token text,org_id uuid,order_id text,case_id text,payer_id text,
              payer_name text,filename text,document_kind text,mime_type text,status text,active boolean,scope_basis text)
            ON CONFLICT(source_key) DO UPDATE SET org_id=EXCLUDED.org_id,order_id=EXCLUDED.order_id,scope_basis=EXCLUDED.scope_basis,
              status=CASE WHEN trident_learning_documents.status='UNLINKED' AND EXCLUDED.org_id IS NOT NULL
                THEN 'PENDING' ELSE trident_learning_documents.status END,active=EXCLUDED.active
            WHERE trident_learning_documents.org_id IS DISTINCT FROM EXCLUDED.org_id
              OR trident_learning_documents.order_id IS DISTINCT FROM EXCLUDED.order_id
              OR trident_learning_documents.scope_basis IS DISTINCT FROM EXCLUDED.scope_basis
              OR trident_learning_documents.active IS DISTINCT FROM EXCLUDED.active''', (encoded,))
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


async def _extract_input(record, content, extractor=None):
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
    return parsed


async def process_documents(conn, limit=8, extractor=None):
    """Bounded batches, isolated parser, durable retries. A busy file cannot
    prevent later uploads from entering the corpus. Caller holds worker lock."""
    queue = await rows(conn, '''SELECT * FROM trident_learning_documents WHERE active AND org_id IS NOT NULL
        AND status IN('PENDING','RETRY') AND next_attempt_at<=NOW()
        ORDER BY attempts,created_at,source_key LIMIT %s''', (limit,))
    result = {'processed': 0, 'extracted': 0, 'held': 0}
    semaphore = asyncio.Semaphore(3)
    tasks = {}
    async def parse_one(record, content):
        async with semaphore:
            return await _extract_input(record, content, extractor)
    async with asyncio.TaskGroup() as group:
        for record in queue:
            content = await source_bytes(conn, record)
            tasks[record['source_key']] = group.create_task(parse_one(record, content))
    # Parsing holds no metadata write lock. Serialize the brief save phase
    # with discovery so a bulk source update cannot deadlock a file batch.
    async with conn.transaction():
        await rows(conn, 'SELECT pg_advisory_xact_lock(817260031)')
        for record in queue:
            parsed = tasks[record['source_key']].result()
            if parsed['status']=='RETRY' and record['attempts']>=1:
                parsed={**parsed,'status':'NEEDS_REVIEW','error':'REPEATED_EXTRACTION_FAILURE'}
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


async def document_library(conn, org_id, query='', codes=None, include_text=False, insurance='', include_admin=False):
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
        ORDER BY CASE WHEN status IN('MISSING_CONTENT','NEEDS_REVIEW','UNSUPPORTED_FORMAT','SOURCE_CHANGED','RETRY')
          THEN 0 ELSE 1 END,extracted_at DESC NULLS LAST,created_at DESC LIMIT 100''', (org_id,query,query,insurance,insurance,insurance,codes or [],codes or [])) if include_text else []
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
    diagnostics = await rows(conn, """SELECT DISTINCT a.pid,a.state,a.wait_event_type,a.wait_event,
        EXTRACT(EPOCH FROM NOW()-a.query_start)::float AS running_seconds,
        CASE WHEN STRPOS(a.query,'FROM spear_store_snapshots s')>0
          AND STRPOS(a.query,'''spear_store_snapshots'' AS source_table')>0 THEN 'LEGACY_SNAPSHOT_SCAN'
          WHEN STRPOS(a.query,'WITH scoped AS MATERIALIZED')>0 THEN 'SNAPSHOT_SCAN'
          ELSE 'LEARNING_JOB' END AS phase
        FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
        WHERE l.locktype='advisory' AND l.objid=ANY(ARRAY[817260030,817260031,817260032,817260033]::oid[])
          AND a.pid<>pg_backend_pid()"""
    ) if include_text else []
    unlinked = await rows(conn, '''SELECT source_table,source_id,case_id,document_kind,status
        FROM trident_learning_documents WHERE active AND org_id IS NULL ORDER BY source_table,source_id''') if include_admin else []
    repair_inventory = await document_repair_inventory(conn, org_id) if include_admin and include_text else None
    return json_safe({'counts':{r['status']:r['count'] for r in counts},'models':models,'files':found,'jobs':diagnostics,
                     'repair_inventory':repair_inventory,
                     'unlinked_sources':unlinked if include_admin else None,
                     'matched_files':found[0]['matched_files'] if found else 0})


async def document_repair_inventory(conn, org_id):
    """Scoped source locators for repair, without bytes or patient identity fields."""
    held = await rows(conn, '''SELECT source_key,source_table,source_id,source_revision,order_id,case_id,
        filename,document_kind,status,last_error,content_sha256,page_count,extracted_pages,ocr_pages
        FROM trident_learning_documents WHERE active AND org_id=%s::uuid
        AND status<>'EXTRACTED' ORDER BY source_table,source_id LIMIT 1000''', (org_id,))
    locators = {}
    if await table_exists(conn,'order_documents'):
        for row in await rows(conn, '''SELECT d.id::text AS id,d.metadata-'content_base64' AS metadata
            FROM order_documents d JOIN trident_learning_documents l ON l.source_table='order_documents'
              AND l.source_id=d.id::text WHERE l.active AND l.org_id=%s::uuid AND l.status<>'EXTRACTED' ''',(org_id,)):
            locators[('order_documents',row['id'])]=row['metadata'] or {}
    if await table_exists(conn,'spear_store_snapshots'):
        for row in await rows(conn, '''WITH files AS MATERIALIZED (
            SELECT s.store_key,section.name,d.item-'content_base64' AS item
            FROM spear_store_snapshots s CROSS JOIN (VALUES ('documents'),('artifacts')) section(name)
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.store->section.name,'[]'::jsonb)) d(item)
            WHERE s.store_key=%s)
            SELECT f.store_key||':'||f.name||':'||(f.item->>'id') AS id,f.item AS metadata
            FROM files f JOIN trident_learning_documents l ON l.source_table='spear_store_snapshots'
              AND l.source_id=f.store_key||':'||f.name||':'||(f.item->>'id')
            WHERE l.active AND l.org_id=%s::uuid AND l.status<>'EXTRACTED' ''',
            (os.getenv('SPEAR_SQL_STORE_KEY','spear-production'),org_id)):
            locators[('spear_store_snapshots',row['id'])]=row['metadata'] or {}
    safe_keys={'id','case_id','order_id','kind','size','created_at','source','source_id','source_document_id',
        'source_doc_id','source_artifact_id','document_id','artifact_id','storage_note','sha256','content_sha256',
        'source_sha256','dropbox_path','source_path','original_filename','original_file_name','file_name','filename',
        'storage_key','object_key','bucket','extracted_text','ocr_text','text_content'}
    for item in held:
        metadata=locators.get((item['source_table'],item['source_id']),{})
        item['metadata_keys']=sorted(metadata)
        item['source_locator']={k:v for k,v in metadata.items() if k in safe_keys and k not in {'extracted_text','ocr_text','text_content'}}
        item['retained_text_fields']=[k for k in ('extracted_text','ocr_text','text_content') if metadata.get(k)]
    return held


async def cancel_obsolete_scans(conn):
    # A removed deployment can leave a CPU-bound PostgreSQL SELECT alive until
    # the server notices the disconnected client. Cancel only our obsolete,
    # read-only snapshot query, holding our ingestion lock, older than 5 min.
    # The materialized replacement, models, claims and payment jobs cannot match.
    result = await rows(conn, """SELECT DISTINCT a.pid FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
        WHERE l.locktype='advisory' AND l.objid=817260031::oid AND l.granted
          AND a.pid<>pg_backend_pid() AND a.state='active' AND a.query_start<NOW()-INTERVAL '5 minutes'
          AND STRPOS(a.query,'FROM spear_store_snapshots s')>0
          AND STRPOS(a.query,'''spear_store_snapshots'' AS source_table')>0
          AND STRPOS(a.query,'WITH scoped AS MATERIALIZED')=0"""
    )
    cancelled=0
    for job in result:
        response=await rows(conn,'SELECT pg_cancel_backend(%s) AS cancelled',(job['pid'],))
        cancelled+=int(bool(response[0]['cancelled']))
    return cancelled
