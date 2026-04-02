import uuid

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.claim import Claim
from app.models.claim_line import ClaimLine
from app.services.auth_service import check_prior_auth
from app.services.denial_service import evaluate_denial_risk
from app.services.documentation_service import validate_documentation
from app.services.duplicate_detection_service import detect_duplicates
from app.services.dx_linking_service import map_diagnosis_to_lines
from app.services.modifier_service import assign_modifiers
from app.services.reimbursement_service import estimate_reimbursement


def build_claim(db: Session, input_payload: dict) -> dict:
    duplicate = detect_duplicates(
        db,
        input_payload["patient_id"],
        str(input_payload["date_of_service"]),
        [line["hcpcs_code"] for line in input_payload["lines"]],
    )
    if duplicate["duplicate_flag"]:
        db.add(
            AuditLog(
                trace_id=input_payload["idempotency_key"],
                actor="system",
                rule_invoked="duplicate_detection",
                input_values=input_payload,
                output_decision=duplicate,
                confidence=duplicate.get("match_confidence"),
                code_library_version="seed-2026q1",
            )
        )
        db.commit()
        return {
            "status": "BLOCKED",
            "reason": "duplicate_claim_attempt",
            "existing_claim_id": duplicate["existing_claim_id"],
        }

    built_lines: list[dict] = []
    for line in input_payload["lines"]:
        mod = assign_modifiers(
            db,
            line["hcpcs_code"],
            input_payload.get("laterality"),
            line.get("purchase_type", "NU"),
        )
        built_lines.append(
            {
                "hcpcs_code": line["hcpcs_code"],
                "units": int(line.get("units", 1)),
                "modifiers": mod["modifiers"],
                "modifier_errors": mod["errors"],
                "charge_amount": float(line.get("charge_amount", 0)),
            }
        )
        db.add(
            AuditLog(
                trace_id=input_payload["idempotency_key"],
                actor="system",
                rule_invoked="modifier_assignment",
                input_values=line,
                output_decision={"modifiers": mod["modifiers"], "errors": mod["errors"]},
                confidence=1.0 if not mod["errors"] else 0.5,
                code_library_version="seed-2026q1",
            )
        )

    linked = map_diagnosis_to_lines(db, built_lines, input_payload.get("diagnoses", []))
    doc = validate_documentation(db, {"lines": linked, "documents": input_payload.get("documents", {}), "laterality": input_payload.get("laterality"), "date_of_service": input_payload.get("date_of_service")})
    auth = check_prior_auth(db, input_payload["payer_name"], [l["hcpcs_code"] for l in linked])
    reimbursement = estimate_reimbursement(db, input_payload["payer_name"], linked)
    denial = evaluate_denial_risk(db, {"lines": linked})

    line_statuses = []
    for line in linked:
        status = "READY"
        if line.get("modifier_errors"):
            status = "FAIL"
        elif line.get("dx_link_status") == "FAIL":
            status = "FAIL"
        elif doc["status"] == "REVIEW" or auth["auth_required_flag"]:
            status = "REVIEW"
        line["line_status"] = status
        line_statuses.append(status)

    claim_status = "READY"
    if "FAIL" in line_statuses:
        claim_status = "REJECT"
    elif "REVIEW" in line_statuses:
        claim_status = "REVIEW"

    claim = Claim(
        id=uuid.uuid4(),
        patient_id=input_payload["patient_id"],
        payer_name=input_payload["payer_name"],
        date_of_service=input_payload["date_of_service"],
        procedure_family=input_payload["procedure_family"],
        laterality=input_payload.get("laterality"),
        status=claim_status,
        total_billed=sum(l["charge_amount"] for l in linked),
        expected_allowed=reimbursement["total_expected_allowed"],
        expected_paid=reimbursement["total_expected_paid"],
        diagnosis_codes=input_payload.get("diagnoses", []),
        idempotency_key=input_payload["idempotency_key"],
    )
    db.add(claim)
    db.flush()

    for line in linked:
        db.add(
            ClaimLine(
                claim_id=claim.id,
                hcpcs_code=line["hcpcs_code"],
                units=line["units"],
                modifiers=line["modifiers"],
                diagnosis_pointers=line["diagnosis_pointers"],
                charge_amount=line["charge_amount"],
                line_status=line["line_status"],
            )
        )
        db.add(
            AuditLog(
                trace_id=input_payload["idempotency_key"],
                actor="system",
                rule_invoked="claim_line_validation",
                input_values={"hcpcs_code": line["hcpcs_code"], "diagnoses": input_payload.get("diagnoses", [])},
                output_decision={
                    "line_status": line["line_status"],
                    "dx_link_status": line["dx_link_status"],
                    "modifier_errors": line["modifier_errors"],
                },
                confidence=1.0 if line["line_status"] == "READY" else 0.6,
                code_library_version="seed-2026q1",
            )
        )
    db.add(
        AuditLog(
            trace_id=input_payload["idempotency_key"],
            actor="system",
            rule_invoked="claim_build_result",
            input_values={"patient_id": input_payload["patient_id"], "payer_name": input_payload["payer_name"]},
            output_decision={"claim_id": str(claim.id), "status": claim_status, "denial_risk": denial["risk_score"]},
            confidence=1.0 if claim_status == "READY" else 0.7,
            code_library_version="seed-2026q1",
        )
    )
    db.commit()
    return {
        "claim_id": str(claim.id),
        "status": claim_status,
        "line_results": linked,
        "totals": {
            "total_billed": float(claim.total_billed),
            "expected_allowed": reimbursement["total_expected_allowed"],
            "expected_paid": reimbursement["total_expected_paid"],
            "denial_risk": denial["risk_score"],
        },
        "auth": auth,
        "documentation": doc,
        "denial": denial,
    }
