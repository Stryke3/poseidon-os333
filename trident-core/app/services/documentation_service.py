from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.documentation_rules import DocumentationRule


def validate_documentation(db: Session, claim: dict) -> dict:
    docs = claim.get("documents", {}) or {}
    missing: list[str] = []
    line_results: list[dict] = []

    for line in claim.get("lines", []):
        hcpcs = line["hcpcs_code"]
        rules = list(db.scalars(select(DocumentationRule).where(DocumentationRule.hcpcs_code == hcpcs)))
        line_missing: list[str] = []
        for rule in rules:
            if not docs.get(rule.required_document_type):
                line_missing.append(rule.required_document_type)
            for element in rule.required_elements:
                if element and not docs.get(element):
                    line_missing.append(element)
            if rule.must_include_laterality_flag and not claim.get("laterality"):
                line_missing.append("laterality")
            if rule.must_include_dos_flag and not claim.get("date_of_service"):
                line_missing.append("date_of_service")
            if rule.must_include_provider_signature_flag and not docs.get("provider_signature"):
                line_missing.append("provider_signature")
            if rule.must_include_npi_flag and not docs.get("npi"):
                line_missing.append("npi")
            if rule.must_include_medical_necessity_flag and not docs.get("medical_necessity"):
                line_missing.append("medical_necessity")
            if rule.must_include_risk_score_flag and not docs.get("risk_score"):
                line_missing.append("risk_score")
        line_status = "PASS" if not line_missing else "REVIEW"
        line_results.append({"hcpcs_code": hcpcs, "missing_elements": sorted(set(line_missing)), "status": line_status})
        missing.extend(line_missing)

    final = "PASS" if not missing else "REVIEW"
    return {"status": final, "missing_elements": sorted(set(missing)), "line_results": line_results}
