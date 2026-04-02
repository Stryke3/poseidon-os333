from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.auth_schema import AuthCheckIn
from app.services.auth_service import check_prior_auth

router = APIRouter()


@router.post("/check")
def auth_check(payload: AuthCheckIn, db: Session = Depends(get_db)) -> dict:
    return check_prior_auth(db, payload.payer_name, payload.hcpcs_codes)
