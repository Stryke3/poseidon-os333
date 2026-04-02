from sqlalchemy.orm import Session

from app.services.denial_service import evaluate_denial_risk


def denial_check(db: Session, claim_payload: dict) -> dict:
    return evaluate_denial_risk(db, claim_payload)
