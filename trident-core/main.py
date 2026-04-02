from fastapi import FastAPI

from app.api.routes_auth import router as auth_router
from app.api.routes_claims import router as claims_router
from app.api.routes_codes import router as codes_router
from app.api.routes_reimbursement import router as reimbursement_router
from app.api.routes_validation import router as validation_router
from app.core.database import Base, engine
from app.core.logging import configure_logging
from app.models import (  # noqa: F401
    audit_log,
    auth_rules,
    claim,
    claim_line,
    denial_rules,
    documentation_rules,
    dx_hcpcs_rules,
    fee_schedule,
    hcpcs,
    icd10,
    modifier_rules,
    payer_rules,
    reimbursement_history,
)


configure_logging()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Trident Core", version="1.0.0")

app.include_router(codes_router, prefix="/codes", tags=["codes"])
app.include_router(claims_router, prefix="/claim", tags=["claim"])
app.include_router(validation_router, prefix="/compliance", tags=["compliance"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(reimbursement_router, prefix="/reimbursement", tags=["reimbursement"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
