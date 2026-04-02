import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.claim import Claim
from app.models.claim_line import ClaimLine


def stable_duplicate_key(patient_id: str, dos: str, hcpcs_set: list[str]) -> str:
    payload = f"{patient_id}|{dos}|{','.join(sorted(set(hcpcs_set)))}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def detect_duplicates(db: Session, patient_id: str, dos: str, hcpcs_set: list[str]) -> dict:
    target = sorted(set(hcpcs_set))
    existing = list(db.scalars(select(Claim).where(Claim.patient_id == patient_id, Claim.date_of_service == dos)))
    best = None
    for claim in existing:
        claim_codes = sorted(
            {
                row.hcpcs_code
                for row in db.scalars(select(ClaimLine).where(ClaimLine.claim_id == claim.id))
            }
        )
        if claim_codes == target:
            best = claim
            break
    return {
        "duplicate_flag": best is not None,
        "match_confidence": 1.0 if best else 0.0,
        "existing_claim_id": str(best.id) if best else None,
    }
