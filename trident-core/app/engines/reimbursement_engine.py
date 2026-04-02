from sqlalchemy.orm import Session

from app.services.reimbursement_service import estimate_reimbursement


def reimbursement_check(db: Session, payer_name: str, claim_lines: list[dict]) -> dict:
    return estimate_reimbursement(db, payer_name, claim_lines)
