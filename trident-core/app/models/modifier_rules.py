import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ModifierRule(Base):
    __tablename__ = "modifier_rules"
    __table_args__ = (UniqueConstraint("hcpcs_code", "modifier", name="uq_modifier_rule"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hcpcs_code: Mapped[str] = mapped_column(ForeignKey("hcpcs_master.hcpcs_code"), nullable=False, index=True)
    modifier: Mapped[str] = mapped_column(String(5), nullable=False)
    allowed_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    required_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mutually_exclusive_with: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    payer_specific_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
