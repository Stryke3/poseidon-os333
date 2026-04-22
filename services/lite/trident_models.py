"""
SUPER TRIDENT canonical case and rule scaffolding.

This module is intentionally conservative: it defines the narrow document-engine
data model and deterministic bundle/rule helpers without fabricating any facts.

TRIDENT 3.0: runtime intake and API use `trident30.TRIDENT_DOC_CLASSES` in the
Lite service (e.g. rx_order, insurance_card_*, chart_note, coding_cover_sheet, …).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ProcedureFamily = Literal["TKA", "THA", "other"]
Laterality = Literal["RT", "LT", "bilateral", "unknown"]
ReviewStatus = Literal["READY_TO_GENERATE", "DRAFT_NOT_READY", "BLOCKED"]
GeneratedDocumentType = Literal["SWO", "ADDENDUM"]


class ExtractionField(BaseModel):
    case_id: str
    field_name: str
    field_value: Optional[str] = None
    confidence: float = 0.0
    source_document_id: Optional[str] = None
    source_page: Optional[int] = None
    extraction_method: Literal["text", "ocr", "inferred", "manual_record"] = "manual_record"
    requires_review: bool = True


class RuleHit(BaseModel):
    case_id: str
    rule_name: str
    severity: Literal["info", "warning", "blocking"] = "warning"
    message: str
    blocking: bool = False


class GeneratedDocument(BaseModel):
    id: str
    case_id: str
    type: GeneratedDocumentType
    template_version: str
    rendered_html: str = ""
    rendered_pdf_path: Optional[str] = None
    json_payload: dict = Field(default_factory=dict)
    status: Literal["draft", "final"] = "draft"
    created_at: Optional[str] = None


class CaseRecord(BaseModel):
    id: str
    status: ReviewStatus = "DRAFT_NOT_READY"
    patient_first_name: str = ""
    patient_last_name: str = ""
    dob: Optional[str] = None
    sex: Optional[str] = None
    phone: Optional[str] = None
    address_1: Optional[str] = None
    address_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    primary_insurance: Optional[str] = None
    secondary_insurance: Optional[str] = None
    member_id_primary: Optional[str] = None
    member_id_secondary: Optional[str] = None
    procedure_name: Optional[str] = None
    procedure_family: ProcedureFamily = "other"
    laterality: Laterality = "unknown"
    surgery_date: Optional[str] = None
    order_date: Optional[str] = None
    bmi: Optional[str] = None
    provider_name: Optional[str] = None
    provider_npi: Optional[str] = None
    facility_name: Optional[str] = None
    diagnosis_codes: list[str] = Field(default_factory=list)
    diagnosis_text: list[str] = Field(default_factory=list)
    dvt_risk_factors: list[str] = Field(default_factory=list)
    dvt_risk_score: Optional[int] = None
    mobility_limitation_present: bool = False
    fall_risk_present: bool = False
    review_flags: list[str] = Field(default_factory=list)
    source_documents: list[dict] = Field(default_factory=list)
    generated_documents: list[GeneratedDocument] = Field(default_factory=list)
    internal_export_json: dict = Field(default_factory=dict)


class CodeMapping(BaseModel):
    product_label: str
    canonical_hcpcs: str
    alternatives: list[str] = Field(default_factory=list)
    conflict: bool = False
    requires_review: bool = False
    notes: str = ""


DEFAULT_CODE_MAPPINGS = [
    CodeMapping(
        product_label="ROM Elite Knee Brace",
        canonical_hcpcs="L1833",
        alternatives=["L1832"],
        conflict=True,
        requires_review=True,
        notes="Known internal conflict registry entry; human confirmation required.",
    ),
    CodeMapping(product_label="ROM Knee Ice Brace", canonical_hcpcs="L1832"),
    CodeMapping(product_label="ROM Hip Ice Brace", canonical_hcpcs="L1686"),
    CodeMapping(product_label="ManaCold 2.0", canonical_hcpcs="E0218"),
    CodeMapping(product_label="Walker", canonical_hcpcs="E0143"),
    CodeMapping(product_label="Raised Seat", canonical_hcpcs="E0165"),
    CodeMapping(
        product_label="ManaFlow DVT Device",
        canonical_hcpcs="E0651",
        requires_review=True,
        notes="Requires DVT risk support or human confirmation.",
    ),
]


def default_bundle_for(procedure_family: ProcedureFamily, mappings: list[CodeMapping] | None = None) -> list[str]:
    code_map = mappings or DEFAULT_CODE_MAPPINGS
    rom_elite = next(
        (mapping.canonical_hcpcs for mapping in code_map if mapping.product_label == "ROM Elite Knee Brace"),
        "L1833",
    )
    if procedure_family == "TKA":
        return [rom_elite, "L1832", "E0218", "E0143", "E0165", "E0651"]
    if procedure_family == "THA":
        return ["L1686", "E0218", "E0143", "E0165", "E0651"]
    return []


def blocking_rule_hits(case: CaseRecord, mappings: list[CodeMapping] | None = None) -> list[RuleHit]:
    code_map = mappings or DEFAULT_CODE_MAPPINGS
    hits: list[RuleHit] = []

    def add(rule_name: str, message: str) -> None:
        hits.append(
            RuleHit(
                case_id=case.id,
                rule_name=rule_name,
                severity="blocking",
                message=message,
                blocking=True,
            )
        )

    if not case.patient_first_name or not case.patient_last_name:
        add("missing_patient_name", "Patient full name is required before final generation.")
    if not case.dob:
        add("missing_dob", "DOB is required before final generation.")
    if not case.provider_name:
        add("missing_provider_name", "Provider name is required before final generation.")
    if not case.diagnosis_codes:
        add("missing_diagnosis", "At least one diagnosis is required before final generation.")
    if case.procedure_family in {"TKA", "THA"} and case.laterality == "unknown":
        add("missing_laterality", "Laterality is required for laterality-dependent items.")

    mapping_conflict = next((mapping for mapping in code_map if mapping.conflict and mapping.requires_review), None)
    if case.procedure_family == "TKA" and mapping_conflict is not None:
        add(
            "code_conflict_rom_elite",
            f"{mapping_conflict.product_label} mapping conflict detected ({mapping_conflict.canonical_hcpcs} vs {', '.join(mapping_conflict.alternatives)}).",
        )

    return hits
