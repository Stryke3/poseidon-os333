import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DenialRule(Base):
    __tablename__ = "denial_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hcpcs_code: Mapped[str] = mapped_column(ForeignKey("hcpcs_master.hcpcs_code"), nullable=False, index=True)
    denial_category: Mapped[str] = mapped_column(String(80), nullable=False)
    denial_reason: Mapped[str] = mapped_column(Text, nullable=False)
    preventive_logic: Mapped[str] = mapped_column(Text, nullable=False)
    common_root_cause: Mapped[str | None] = mapped_column(Text)
    escalation_recommendation: Mapped[str | None] = mapped_column(Text)
