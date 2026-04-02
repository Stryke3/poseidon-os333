from pydantic import BaseModel


class AuthCheckIn(BaseModel):
    payer_name: str
    hcpcs_codes: list[str]


class AuthCheckOut(BaseModel):
    auth_status: str
    auth_required_flag: bool
    auth_missing_flag: bool
    details: list[dict]
