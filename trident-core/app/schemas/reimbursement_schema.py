from pydantic import BaseModel


class ReimbursementEstimateIn(BaseModel):
    payer_name: str
    plan: str | None = None
    region: str | None = None
    claim_lines: list[dict]


class ReimbursementEstimateOut(BaseModel):
    total_expected_allowed: float
    total_expected_paid: float
    lines: list[dict]
