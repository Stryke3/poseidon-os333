from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.engines.denial_engine import denial_check
from app.engines.reimbursement_engine import reimbursement_check
from app.schemas.claim_schema import ClaimBuildIn
from app.services.claim_builder_service import build_claim

router = APIRouter()


@router.post("/build")
def claim_build(payload: ClaimBuildIn, db: Session = Depends(get_db)) -> dict:
    return build_claim(db, payload.model_dump())


@router.post("/validate")
def claim_validate(payload: ClaimBuildIn, db: Session = Depends(get_db)) -> dict:
    built = build_claim(db, payload.model_dump())
    return {"status": built.get("status"), "line_results": built.get("line_results", [])}


@router.post("/estimate")
def claim_estimate(payload: ClaimBuildIn, db: Session = Depends(get_db)) -> dict:
    return reimbursement_check(db, payload.payer_name, [line.model_dump() for line in payload.lines])


@router.post("/check-denial")
def claim_check_denial(payload: ClaimBuildIn, db: Session = Depends(get_db)) -> dict:
    return denial_check(
        db,
        {"lines": [line.model_dump() for line in payload.lines]},
    )
