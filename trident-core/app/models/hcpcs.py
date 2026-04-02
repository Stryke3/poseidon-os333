from sqlalchemy import Boolean, Date, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class HCPCSMaster(Base):
    __tablename__ = "hcpcs_master"

    hcpcs_code: Mapped[str] = mapped_column(String(10), primary_key=True)
    short_description: Mapped[str] = mapped_column(String(255), nullable=False)
    long_description: Mapped[str | None] = mapped_column(Text)
    code_type: Mapped[str] = mapped_column(String(5), nullable=False)
    dmepos_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    orthotics_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cold_therapy_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    compression_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mobility_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supply_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    capped_rental_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    purchase_allowed_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    prior_auth_possible_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    common_modifier_pattern: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    bilateral_allowed_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    laterality_applicable_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    typical_units: Mapped[float | None] = mapped_column(Numeric(10, 2))
    status_active_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_date: Mapped[Date] = mapped_column(Date, nullable=False)
    termination_date: Mapped[Date | None] = mapped_column(Date)
    version_quarter: Mapped[int] = mapped_column(Integer, nullable=False)
    version_year: Mapped[int] = mapped_column(Integer, nullable=False)
