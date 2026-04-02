from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.dx_hcpcs_rules import DxHcpcsRule


def map_diagnosis_to_lines(db: Session, claim_lines: list[dict], diagnoses: list[str]) -> list[dict]:
    diag_set = {d.upper() for d in diagnoses}
    out: list[dict] = []
    for line in claim_lines:
        hcpcs = line["hcpcs_code"]
        rules = list(
            db.scalars(
                select(DxHcpcsRule).where(
                    DxHcpcsRule.hcpcs_code == hcpcs,
                    DxHcpcsRule.active_flag.is_(True),
                )
            )
        )
        required = [r.diagnosis_code for r in rules if r.support_level == "required"]
        supportive = [r.diagnosis_code for r in rules if r.support_level in {"supportive", "optional"}]
        pointers: list[str] = []
        for code in required:
            if code in diag_set:
                pointers.append(code)
        if not pointers:
            for code in supportive:
                if code in diag_set:
                    pointers.append(code)
        line_out = dict(line)
        line_out["diagnosis_pointers"] = pointers
        line_out["dx_link_status"] = "PASS" if pointers else "FAIL"
        out.append(line_out)
    return out
