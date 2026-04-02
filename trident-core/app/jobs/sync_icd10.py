from sqlalchemy.orm import Session

from app.seed.seed_icd10 import ICD10_SEED
from app.services.code_service import upsert_icd10


def run_sync_icd10(db: Session) -> int:
    return upsert_icd10(db, ICD10_SEED)
