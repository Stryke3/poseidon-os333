from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.hcpcs import HCPCSMaster
from app.models.icd10 import ICD10Master


def upsert_icd10(db: Session, rows: list[dict]) -> int:
    count = 0
    for row in rows:
        existing = db.get(ICD10Master, row["code"])
        if existing:
            for k, v in row.items():
                setattr(existing, k, v)
        else:
            db.add(ICD10Master(**row))
        count += 1
    db.commit()
    return count


def upsert_hcpcs(db: Session, rows: list[dict]) -> int:
    count = 0
    for row in rows:
        existing = db.get(HCPCSMaster, row["hcpcs_code"])
        if existing:
            for k, v in row.items():
                setattr(existing, k, v)
        else:
            db.add(HCPCSMaster(**row))
        count += 1
    db.commit()
    return count


def active_hcpcs(db: Session) -> list[HCPCSMaster]:
    return list(db.scalars(select(HCPCSMaster).where(HCPCSMaster.status_active_flag.is_(True))))
