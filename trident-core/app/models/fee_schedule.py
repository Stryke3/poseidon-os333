import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class HCPCSFeeSchedule(Base):
    __tablename__ = "hcpcs_fee_schedule"
    __table_args__ = (
        UniqueConstraint(
            "hcpcs_code",
            "jurisdiction",
            "state",
            "rural_flag",
            "effective_date",
            name="uq_fee_schedule_row",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hcpcs_code: Mapped[str] = mapped_column(ForeignKey("hcpcs_master.hcpcs_code"), nullable=False, index=True)
    jurisdiction: Mapped[str] = mapped_column(String(30), nullable=False)
    state: Mapped[str | None] = mapped_column(String(2))
    rural_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fee_schedule_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    purchase_rental_indicator: Mapped[str | None] = mapped_column(String(5))
    ceiling_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    floor_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    source_version: Mapped[str] = mapped_column(String(50), nullable=False)
