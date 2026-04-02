from sqlalchemy.orm import Session

from app.seed.seed_hcpcs import HCPCS_SEED
from app.services.code_service import upsert_hcpcs


def run_sync_hcpcs(db: Session) -> int:
    return upsert_hcpcs(db, HCPCS_SEED)
