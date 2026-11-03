"""Verified archive copies for the private learning corpus; source charts stay immutable."""
import base64
import hashlib
import json
import os
import re
from datetime import datetime,timezone

from learning_pipeline import rows,execute,json_safe,table_exists
from document_learning import _extract_input

MAX_RECOVERY_BYTES=3*1024*1024


def normalized_name(value):
    return re.sub(r'[^a-z0-9]','',str(value).lower())


def identity_matches(case,text):
    name=str(case.get('patient_name') or '')
    dob=str(case.get('dob') or '')[:10]
    words=[w for w in re.findall(r'[a-z]+',name.lower()) if len(w)>1]
    found=set(re.findall(r'[a-z]+',text.lower()))
    if len(words)<2 or not all(w in found for w in words):
        return False
    match=re.fullmatch(r'(\d{4})-(\d{2})-(\d{2})',dob)
    if not match:
        # Older live records retain the input date format.
        match=re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})',dob)
        if not match:return False
        month,day,year=map(int,match.groups())
    else:
        year,month,day=map(int,match.groups())
    dates=re.findall(r'\b(\d{1,4})[/-](\d{1,2})[/-](\d{2,4})\b',text)
    for first,middle,last in dates:
        if len(first)==4 and (int(first),int(middle),int(last))==(year,month,day):return True
        if (int(first),int(middle),int(last)) in {(month,day,year),(month,day,year%100)}:return True
    return False


async def recover_archive_copy(conn,org_id,payload):
    encoded=payload.get('content_base64') or ''
    if not isinstance(encoded,str) or len(encoded)>MAX_RECOVERY_BYTES*4//3+8:
        raise ValueError('Recovery files must be at most 3 MiB.')
    try: content=base64.b64decode(encoded,validate=True)
    except Exception:raise ValueError('The recovery file encoding is invalid.')
    digest=hashlib.sha256(content).hexdigest()
    if not content or len(content)>MAX_RECOVERY_BYTES or digest!=payload.get('sha256'):
        raise ValueError('The recovery file checksum does not match.')
    if not content.startswith(b'%PDF-'):
        raise ValueError('Use an original PDF source copy for this recovery.')
    filename=str(payload.get('filename') or '')[:250]
    provenance=payload.get('provenance') or {}
    if not isinstance(provenance,dict) or not provenance.get('file_id'):
        raise ValueError('The original archive file identifier is required.')
    # No URLs, credentials, arbitrary source fetches, or executable instructions.
    provenance={k:str(provenance[k])[:1000] for k in ('provider','file_id','path','revision') if provenance.get(k)}
    if not await table_exists(conn,'spear_store_snapshots'):
        return {'recovered':0,'reason':'No retained archive references are available.'}
    candidates=await rows(conn, '''WITH files AS MATERIALIZED (
        SELECT s.store_key,section.name,d.item
        FROM spear_store_snapshots s CROSS JOIN (VALUES ('documents'),('artifacts')) section(name)
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.store->section.name,'[]'::jsonb)) d(item)
        WHERE s.store_key=%s), cases AS MATERIALIZED (
        SELECT c.item FROM spear_store_snapshots s CROSS JOIN LATERAL
        jsonb_array_elements(COALESCE(s.store->'cases','[]'::jsonb)) c(item) WHERE s.store_key=%s)
        SELECT l.source_key,l.source_revision,l.case_id,f.item,c.item AS case_record
        FROM files f JOIN trident_learning_documents l ON l.source_table='spear_store_snapshots'
          AND l.source_id=f.store_key||':'||f.name||':'||(f.item->>'id')
        LEFT JOIN cases c ON c.item->>'id'=l.case_id
        WHERE l.active AND l.org_id=%s::uuid AND l.status='MISSING_CONTENT' ''',
        (os.getenv('SPEAR_SQL_STORE_KEY','spear-production'),os.getenv('SPEAR_SQL_STORE_KEY','spear-production'),org_id))
    candidates=[c for c in candidates if normalized_name(c['item'].get('filename'))==normalized_name(filename)
        and int(c['item'].get('size') or 0)==len(content)]
    if not candidates:return {'recovered':0,'reason':'No missing source has this filename and original byte count.'}
    parsed=await _extract_input({'source_table':'archive_copy','mime_type':'application/pdf'},encoded)
    if parsed.get('status')!='EXTRACTED':
        return {'recovered':0,'reason':'The archive copy could not be fully extracted.'}
    verified=[]; staging=[]
    for candidate in candidates:
        item=candidate['item'];case=candidate['case_record']
        expected=item.get('sha256') or (item.get('metadata') or {}).get('sha256')
        if expected:
            if expected!=digest:continue
            basis='EXACT_SOURCE_HASH'
        elif case and str(case.get('org_id') or os.getenv('TRIDENT_SPEAR_SQL_DOCUMENT_ORG_ID'))==org_id and identity_matches(case,parsed['text']):
            basis='CASE_IDENTITY_FILENAME_AND_SIZE'
        elif not case and str(candidate['case_id'] or '').startswith('pending_'):
            staging.append(candidate);continue
        else:continue
        verified.append((candidate,basis))
    # A staging upload has no patient assertion. It can reference the same file
    # only after an actual in-scope case validates that archive copy's identity.
    if verified:
        verified.extend((candidate,'SAME_VERIFIED_FILE_STAGING_REFERENCE') for candidate in staging)
    elif staging:
        known=await rows(conn,'''SELECT EXISTS(SELECT 1 FROM trident_learning_documents
            WHERE org_id=%s::uuid AND active AND status='EXTRACTED' AND content_sha256=%s
            AND source_table IN('order_documents','spear_store_snapshots')) AS present''',(org_id,digest))
        if known[0]['present']:
            verified.extend((candidate,'SAME_CONTENT_SHA256_IN_ORGANIZATION_NO_CASE_ASSERTION') for candidate in staging)
    if not verified:return {'recovered':0,'reason':'Patient identity or the original source hash could not be verified.'}
    async with conn.transaction():
        await rows(conn,'SELECT pg_advisory_xact_lock(817260031)')
        await execute(conn,'''INSERT INTO trident_recovered_files(org_id,content_sha256,content,filename,provenance)
            VALUES(%s::uuid,%s,%s,%s,%s::jsonb) ON CONFLICT(org_id,content_sha256) DO NOTHING''',
            (org_id,digest,content,filename,json.dumps(provenance)))
        recovered=[]
        for candidate,basis in verified:
            # Recheck the revision under the same lock as discovery.
            current=await rows(conn,"""SELECT source_key FROM trident_learning_documents WHERE source_key=%s
                AND org_id=%s::uuid AND active AND status='MISSING_CONTENT' AND source_revision=%s""",
                (candidate['source_key'],org_id,candidate['source_revision']))
            if not current:continue
            await execute(conn,'''INSERT INTO trident_document_recoveries(source_key,org_id,content_sha256,verification_basis)
                VALUES(%s,%s::uuid,%s,%s) ON CONFLICT(source_key) DO NOTHING''',
                (candidate['source_key'],org_id,digest,basis))
            details={**parsed.get('details',{}),'content_origin':'RECOVERED_ARCHIVE_COPY',
                'verification_basis':basis,'original_chart_unchanged':True,'provenance':provenance}
            codes=sorted(set(re.findall(r'\b[A-V][0-9]{4}\b',parsed['text'].upper())))
            await execute(conn,'''UPDATE trident_learning_documents SET status='EXTRACTED',content_sha256=%s,
                text_content=%s,page_count=%s,extracted_pages=%s,ocr_pages=%s,hcpcs=%s::text[],last_error=NULL,
                extraction_details=%s::jsonb,extracted_at=NOW() WHERE source_key=%s AND org_id=%s::uuid''',
                (digest,parsed['text'],parsed['page_count'],parsed['extracted_pages'],parsed['ocr_pages'],codes,
                 json.dumps(details),candidate['source_key'],org_id))
            recovered.append(candidate['source_key'])
        if recovered:
            await execute(conn,'''INSERT INTO trident_learning_jobs(job_key,last_result) VALUES(%s,%s::jsonb)
                ON CONFLICT(job_key) DO UPDATE SET last_result=EXCLUDED.last_result''',
                ('document_repair:'+org_id,json.dumps({'state':'REQUESTED','org_id':org_id,'recovered_files':len(recovered),
                    'requested_at':datetime.now(timezone.utc).isoformat()})))
    return json_safe({'recovered':len(recovered),'source_keys':recovered,'sha256':digest,
        'content_origin':'RECOVERED_ARCHIVE_COPY','model_state':'REPAIR_REFRESH_QUEUED'})
