from pydantic import BaseModel


class ClaimValidationIn(BaseModel):
    claim_id: str | None = None
    claim_payload: dict | None = None


class ClaimValidationOut(BaseModel):
    status: str
    issues: list[dict]
