from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.denial_rules import DenialRule


def evaluate_denial_risk(db: Session, claim: dict) -> dict:
    reasons: list[dict] = []
    score = 0.0
    for line in claim.get("lines", []):
        hcpcs = line["hcpcs_code"]
        line_score = 0.05
        if not line.get("diagnosis_pointers"):
            line_score += 0.35
            reasons.append({"hcpcs_code": hcpcs, "reason": "invalid_diagnosis_linkage", "severity": "high"})
        if not line.get("modifiers"):
            line_score += 0.2
            reasons.append({"hcpcs_code": hcpcs, "reason": "missing_modifier", "severity": "medium"})
        known = list(db.scalars(select(DenialRule).where(DenialRule.hcpcs_code == hcpcs)))
        for rule in known:
            reasons.append(
                {
                    "hcpcs_code": hcpcs,
                    "reason": rule.denial_category,
                    "detail": rule.denial_reason,
                    "severity": "medium",
                }
            )
            line_score += 0.05
        score += min(line_score, 1.0)
    n = max(len(claim.get("lines", [])), 1)
    return {"risk_score": round(score / n, 4), "likely_denials": reasons}
