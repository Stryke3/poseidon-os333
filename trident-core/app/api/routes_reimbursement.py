from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.reimbursement_schema import ReimbursementEstimateIn
from app.services.reimbursement_service import estimate_reimbursement

router = APIRouter()


@router.post("/estimate")
def reimbursement_estimate(payload: ReimbursementEstimateIn, db: Session = Depends(get_db)) -> dict:
    return estimate_reimbursement(db, payload.payer_name, payload.claim_lines)
