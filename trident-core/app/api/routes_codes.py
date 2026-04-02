from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.hcpcs_schema import HCPCSIn
from app.schemas.icd10_schema import ICD10In
from app.services.code_service import upsert_hcpcs, upsert_icd10

router = APIRouter()


@router.post("/sync/icd10")
def sync_icd10(payload: list[ICD10In], db: Session = Depends(get_db)) -> dict:
    count = upsert_icd10(db, [p.model_dump() for p in payload])
    return {"synced": count}


@router.post("/sync/hcpcs")
def sync_hcpcs(payload: list[HCPCSIn], db: Session = Depends(get_db)) -> dict:
    count = upsert_hcpcs(db, [p.model_dump() for p in payload])
    return {"synced": count}
