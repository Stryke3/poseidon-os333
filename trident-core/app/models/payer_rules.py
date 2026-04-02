import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PayerRule(Base):
    __tablename__ = "payer_rules"
    __table_args__ = (
        UniqueConstraint(
            "payer_name",
            "plan_type",
            "product",
            "hcpcs_code",
            "effective_date",
            name="uq_payer_rule",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payer_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    plan_type: Mapped[str | None] = mapped_column(String(80))
    product: Mapped[str | None] = mapped_column(String(80))
    hcpcs_code: Mapped[str] = mapped_column(ForeignKey("hcpcs_master.hcpcs_code"), nullable=False, index=True)
    covered_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    auth_required_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    auth_logic: Mapped[str | None] = mapped_column(Text)
    frequency_limit: Mapped[str | None] = mapped_column(String(100))
    bundling_risk: Mapped[str | None] = mapped_column(String(50))
    modifier_requirements: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    dx_restrictions: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    documentation_requirements: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    termination_date: Mapped[date | None] = mapped_column(Date)
