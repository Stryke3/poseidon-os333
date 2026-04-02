# Trident Core

FastAPI + PostgreSQL backend for deterministic DMEPOS coding, compliance, auth, reimbursement, and denial risk.

## Local run

1. Create virtualenv and install deps:
   - `python3 -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -r requirements.txt`
2. Set environment:
   - `export DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/trident_core`
3. Start API:
   - `uvicorn main:app --reload --port 8015`
4. Optional seed:
   - run from Python shell:
     - `from app.core.database import SessionLocal`
     - `from app.seed.seed_icd10 import ICD10_SEED`
     - `from app.seed.seed_hcpcs import HCPCS_SEED`
     - `from app.services.code_service import upsert_icd10, upsert_hcpcs`
     - `from app.seed.seed_orthopedic_rules import seed_orthopedic_rules`
     - `db = SessionLocal(); upsert_icd10(db, ICD10_SEED); upsert_hcpcs(db, HCPCS_SEED); seed_orthopedic_rules(db)`

## Endpoints

- `POST /codes/sync/icd10`
- `POST /codes/sync/hcpcs`
- `POST /claim/build`
- `POST /claim/validate`
- `POST /claim/estimate`
- `POST /claim/check-denial`
- `POST /auth/check`
- `POST /compliance/check`
- `POST /reimbursement/estimate`
