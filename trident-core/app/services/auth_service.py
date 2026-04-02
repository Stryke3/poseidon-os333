from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth_rules import AuthRule


def check_prior_auth(db: Session, payer: str, hcpcs_codes: list[str]) -> dict:
    details: list[dict] = []
    required = False
    for hcpcs in hcpcs_codes:
        rule = db.scalar(
            select(AuthRule).where(
                AuthRule.payer_name == payer,
                AuthRule.hcpcs_code == hcpcs,
            )
        )
        row = {
            "hcpcs_code": hcpcs,
            "required": bool(rule.auth_required_flag) if rule else False,
            "recommended": bool(rule and not rule.auth_required_flag and rule.auth_trigger_logic),
            "logic": rule.auth_trigger_logic if rule else None,
        }
        required = required or row["required"]
        details.append(row)
    return {
        "auth_status": "required" if required else "not_required",
        "auth_required_flag": required,
        "auth_missing_flag": required,
        "details": details,
    }
