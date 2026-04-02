from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.dx_hcpcs_rules import DxHcpcsRule


def suggest_codes(db: Session, procedure: str, laterality: str | None, diagnoses: list[str]) -> dict:
    dx = {d.upper() for d in diagnoses}
    rows = list(
        db.scalars(
            select(DxHcpcsRule).where(
                DxHcpcsRule.procedure_family == procedure,
                DxHcpcsRule.active_flag.is_(True),
            )
        )
    )
    result: dict[str, dict] = {}
    for row in rows:
        bucket = result.setdefault(
            row.hcpcs_code,
            {"hcpcs_code": row.hcpcs_code, "required": False, "optional": False, "unsupported": False, "reasons": []},
        )
        if row.diagnosis_code not in dx:
            continue
        if row.support_level == "required":
            bucket["required"] = True
            bucket["reasons"].append(f"required_by_{row.diagnosis_code}")
        elif row.support_level in {"supportive", "optional"}:
            bucket["optional"] = True
            bucket["reasons"].append(f"supported_by_{row.diagnosis_code}")
        elif row.support_level == "contraindicated":
            bucket["unsupported"] = True
            bucket["reasons"].append(f"contraindicated_by_{row.diagnosis_code}")
    return {"procedure": procedure, "laterality": laterality, "candidates": list(result.values())}
