import uuid

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DxHcpcsRule(Base):
    __tablename__ = "dx_hcpcs_rules"

    rule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    procedure_family: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    diagnosis_code: Mapped[str] = mapped_column(ForeignKey("icd10_master.code"), nullable=False, index=True)
    hcpcs_code: Mapped[str] = mapped_column(ForeignKey("hcpcs_master.hcpcs_code"), nullable=False, index=True)
    support_level: Mapped[str] = mapped_column(String(20), nullable=False)
    medical_necessity_basis: Mapped[str | None] = mapped_column(Text)
    documentation_required: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    payer_scope: Mapped[str] = mapped_column(String(100), nullable=False, default="all")
    confidence_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, default=1.0)
    active_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
