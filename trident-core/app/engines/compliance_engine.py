from sqlalchemy.orm import Session

from app.services.auth_service import check_prior_auth
from app.services.documentation_service import validate_documentation


def compliance_check(db: Session, payload: dict) -> dict:
    doc = validate_documentation(db, payload)
    auth = check_prior_auth(db, payload.get("payer_name", ""), [l["hcpcs_code"] for l in payload.get("lines", [])])
    status = "PASS"
    if doc["status"] == "REVIEW" or auth["auth_required_flag"]:
        status = "REVIEW"
    return {"status": status, "documentation": doc, "auth": auth}
