"""Authenticated model library and insurance/HCPCS evidence search."""
from __future__ import annotations

import hmac
import uuid

import jwt
from fastapi import HTTPException, Request

from base import settings
from learning_pipeline import feedback_status, json_safe, rows


def authorize(request: Request, write: bool = False) -> str:
    internal = request.headers.get("X-Internal-API-Key", "")
    if settings.internal_api_key and internal and hmac.compare_digest(internal, settings.internal_api_key):
        raw_org = request.query_params.get("org_id", "")
        request.state.trident_case_access=True
    else:
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise HTTPException(401, "A signed application session is required")
        try:
            claims = jwt.decode(header[7:], settings.secret_key, algorithms=[settings.jwt_algorithm], options={"require": ["exp", "sub", "org_id"]})
        except jwt.InvalidTokenError:
            raise HTTPException(401, "Invalid application session")
        if write and str(claims.get("role", "")).lower() not in {"admin", "system"}:
            raise HTTPException(403, "Administrator permission is required")
        raw_org = claims.get("org_id", "")
        request.state.trident_case_access=str(claims.get("role","")).lower() in {"admin","system","billing","biller","intake","executive","clinical","supervisor"}
        requested_org = request.query_params.get("org_id")
        if requested_org and requested_org != raw_org:
            raise HTTPException(403, "Organization does not match the signed session")
    try:
        return str(uuid.UUID(str(raw_org)))
    except ValueError:
        raise HTTPException(403, "A verified organization is required")


async def library(conn, org_id: str, query: str = "", codes: list[str] | None = None, include_case_evidence: bool = False) -> dict:
    query = query.strip()[:200]
    codes = list(dict.fromkeys(str(c).strip().upper() for c in (codes or []) if str(c).strip()))[:100]
    # Each observed payer identity remains distinct; a kit filter expands into
    # its individual HCPCS codes and never invents a bundled payer allowable.
    payers = await rows(conn, """
        SELECT id,name FROM payers
        UNION SELECT payer_id AS id,COALESCE(NULLIF(payer_name,''),payer_id) AS name
              FROM payment_outcomes WHERE org_id=%s::uuid AND payer_id IS NOT NULL
        UNION SELECT DISTINCT payer_id AS id,payer_id AS name FROM trident_rules WHERE payer_id IS NOT NULL
        ORDER BY name,id""", (org_id,))
    observed = await rows(conn, """
        SELECT payer_id,COALESCE(NULLIF(payer_name,''),payer_id) AS payer_name,hcpcs_code,
               COUNT(*) AS samples,COUNT(*) FILTER(WHERE is_denial) AS denials,
               AVG(paid_amount) FILTER(WHERE paid_amount IS NOT NULL) AS mean_paid,
               PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY paid_amount)
                 FILTER(WHERE paid_amount IS NOT NULL) AS median_paid,
               MAX(adjudicated_at) AS latest_adjudication
        FROM payment_outcomes WHERE org_id=%s::uuid AND is_denial IS NOT NULL
          AND adjudicated_at IS NOT NULL
          AND (%s='' OR STRPOS(LOWER(COALESCE(payer_id,'')||' '||COALESCE(payer_name,'')),LOWER(%s))>0
            OR payer_id IN(SELECT id FROM payers WHERE STRPOS(LOWER(name),LOWER(%s))>0))
          AND (cardinality(%s::text[])=0 OR UPPER(hcpcs_code)=ANY(%s::text[]))
        GROUP BY payer_id,COALESCE(NULLIF(payer_name,''),payer_id),hcpcs_code
        ORDER BY payer_name,hcpcs_code""", (org_id,query,query,query,codes,codes))
    rules = await rows(conn, """SELECT payer_id,hcpcs_code,modifier_recommendation,notes
        FROM trident_rules WHERE
          (%s='' OR STRPOS(LOWER(COALESCE(payer_id,'')),LOWER(%s))>0
            OR payer_id IN(SELECT id FROM payers WHERE STRPOS(LOWER(name),LOWER(%s))>0))
          AND (cardinality(%s::text[])=0 OR UPPER(hcpcs_code)=ANY(%s::text[]))
        ORDER BY payer_id,hcpcs_code""", (query,query,query,codes,codes))
    models = await rows(conn, """SELECT model_version,training_run_id,metadata,created_at,
          (SELECT COUNT(*) FROM trident_training_membership m WHERE m.model_version=a.model_version) AS included_records
        FROM trident_model_artifacts a ORDER BY created_at DESC LIMIT 12"""
    )
    evidence=await rows(conn,"""SELECT f.source_key,f.record_kind,f.claim_version,f.payer_id,f.payer_name,
        f.occurred_at,f.evidence,
        (SELECT COUNT(*) FROM payment_outcomes p WHERE p.org_id=f.org_id
           AND p.claim_number=f.claim_number) AS related_outcomes
        FROM trident_feedback_ingestion f WHERE f.org_id=%s::uuid
        AND f.record_kind IN('APPEAL','APPEAL_PACKET','REBILL','OPERATOR_DECISION')
        AND (%s='' OR STRPOS(LOWER(COALESCE(f.payer_id,'')||' '||COALESCE(f.payer_name,'')),LOWER(%s))>0
          OR f.payer_id IN(SELECT id FROM payers WHERE STRPOS(LOWER(name),LOWER(%s))>0))
        AND (cardinality(%s::text[])=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(f.evidence->'hcpcs')='array' THEN f.evidence->'hcpcs' ELSE '[]'::jsonb END) code
          WHERE UPPER(code)=ANY(%s::text[]))) ORDER BY f.occurred_at DESC,f.source_key""",
        (org_id,query,query,query,codes,codes)) if include_case_evidence else []
    return json_safe({"payers": payers,"observed":observed,"rules":rules,"models":models,
                      "case_evidence":evidence,"feedback":await feedback_status(conn,org_id),"query":query,"codes":codes})
