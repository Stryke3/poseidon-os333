from datetime import date

from pydantic import BaseModel


class HCPCSIn(BaseModel):
    hcpcs_code: str
    short_description: str
    code_type: str
    dmepos_flag: bool = True
    orthotics_flag: bool = False
    cold_therapy_flag: bool = False
    compression_flag: bool = False
    mobility_flag: bool = False
    laterality_applicable_flag: bool = False
    bilateral_allowed_flag: bool = False
    purchase_allowed_flag: bool = True
    capped_rental_flag: bool = False
    prior_auth_possible_flag: bool = False
    common_modifier_pattern: list[str] = []
    effective_date: date
    version_quarter: int
    version_year: int


class HCPCSOut(HCPCSIn):
    status_active_flag: bool = True
