from datetime import date

from pydantic import BaseModel, Field


class ClaimBuildLineIn(BaseModel):
    hcpcs_code: str
    units: int = 1
    purchase_type: str = "NU"


class ClaimBuildIn(BaseModel):
    patient_id: str
    payer_name: str
    plan: str | None = None
    procedure_family: str
    laterality: str | None = None
    date_of_service: date
    diagnoses: list[str] = Field(default_factory=list)
    lines: list[ClaimBuildLineIn] = Field(default_factory=list)
    documents: dict = Field(default_factory=dict)
    idempotency_key: str


class ClaimBuildOut(BaseModel):
    claim_id: str
    status: str
    line_results: list[dict]
    totals: dict
