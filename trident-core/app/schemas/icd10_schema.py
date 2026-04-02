from datetime import date

from pydantic import BaseModel


class ICD10In(BaseModel):
    code: str
    short_description: str
    long_description: str | None = None
    chapter: str | None = None
    category: str | None = None
    billable_flag: bool = True
    laterality_required_flag: bool = False
    effective_date: date
    version_year: int


class ICD10Out(ICD10In):
    status_active_flag: bool = True
