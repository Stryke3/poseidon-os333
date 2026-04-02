from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.engines.compliance_engine import compliance_check
from app.schemas.validation_schema import ClaimValidationIn

router = APIRouter()


@router.post("/check")
def compliance_route(payload: ClaimValidationIn, db: Session = Depends(get_db)) -> dict:
    claim_payload = payload.claim_payload or {}
    return compliance_check(db, claim_payload)
