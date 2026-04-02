import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models.auth_rules import AuthRule
from app.models.denial_rules import DenialRule
from app.models.documentation_rules import DocumentationRule
from app.models.dx_hcpcs_rules import DxHcpcsRule
from app.models.modifier_rules import ModifierRule
from app.models.payer_rules import PayerRule


def seed_orthopedic_rules(db: Session) -> None:
    dx_map = [
        ("TKA", "M17.11", "L1833", "required"),
        ("TKA", "M17.12", "L1833", "required"),
        ("TKA", "M25.561", "L1832", "supportive"),
        ("TKA", "M25.562", "L1832", "supportive"),
        ("TKA", "Z48.89", "E0143", "supportive"),
        ("TKA", "Z48.89", "E0165", "optional"),
        ("TKA", "I87.1", "E0651", "supportive"),
        ("THA", "M16.11", "L1686", "required"),
        ("THA", "M16.12", "L1686", "required"),
        ("THA", "M25.551", "E0218", "supportive"),
        ("THA", "M25.552", "E0218", "supportive"),
        ("THA", "Z48.89", "E0143", "supportive"),
        ("THA", "I87.1", "E0651", "supportive"),
    ]
    for proc, dx, hcpcs, level in dx_map:
        db.add(
            DxHcpcsRule(
                rule_id=uuid.uuid4(),
                procedure_family=proc,
                diagnosis_code=dx,
                hcpcs_code=hcpcs,
                support_level=level,
                medical_necessity_basis=f"{proc}_{dx}_{hcpcs}",
                documentation_required=["swo", "dwo"] if hcpcs in {"L1833", "L1686"} else ["swo"],
                payer_scope="all",
                confidence_score=1.0,
                active_flag=True,
            )
        )

    for hcpcs in ["L1833", "L1832", "L1686", "L3960", "L3670"]:
        db.add(ModifierRule(hcpcs_code=hcpcs, modifier="RT", allowed_flag=True, required_flag=True))
        db.add(ModifierRule(hcpcs_code=hcpcs, modifier="LT", allowed_flag=True, required_flag=True))
        db.add(ModifierRule(hcpcs_code=hcpcs, modifier="NU", allowed_flag=True, required_flag=True, mutually_exclusive_with=["RR"]))
        db.add(ModifierRule(hcpcs_code=hcpcs, modifier="RR", allowed_flag=False, required_flag=False, mutually_exclusive_with=["NU"]))

    for hcpcs in ["L1833", "L1832", "L1686", "E0143", "E0165", "E0218", "E0651"]:
        db.add(
            DocumentationRule(
                hcpcs_code=hcpcs,
                required_document_type="swo",
                required_elements=["provider_signature", "npi", "date_of_service"],
                must_include_laterality_flag=hcpcs in {"L1833", "L1832", "L1686"},
                must_include_dos_flag=True,
                must_include_provider_signature_flag=True,
                must_include_npi_flag=True,
                must_include_medical_necessity_flag=hcpcs in {"E0651"},
                must_include_risk_score_flag=hcpcs in {"E0651"},
            )
        )

    db.add(AuthRule(payer_name="Medicare", hcpcs_code="E0651", auth_required_flag=False, auth_trigger_logic="recommended_if_risk_present"))
    db.add(AuthRule(payer_name="Commercial", hcpcs_code="E0651", auth_required_flag=True, auth_trigger_logic="required"))

    db.add(
        PayerRule(
            payer_name="Medicare",
            plan_type="Traditional",
            product="PartB",
            hcpcs_code="L1833",
            covered_flag=True,
            auth_required_flag=False,
            effective_date=date(2026, 1, 1),
        )
    )
    db.add(
        DenialRule(
            hcpcs_code="E0651",
            denial_category="medical_necessity_insufficient",
            denial_reason="Missing DVT risk support or LMN context",
            preventive_logic="Require risk score + LMN support before READY",
            common_root_cause="Compression line billed without supportive documentation",
            escalation_recommendation="Route to documentation deficiency queue",
        )
    )
    db.commit()
