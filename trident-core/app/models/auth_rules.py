import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuthRule(Base):
    __tablename__ = "auth_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payer_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    hcpcs_code: Mapped[str] = mapped_column(ForeignKey("hcpcs_master.hcpcs_code"), nullable=False, index=True)
    auth_required_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    auth_trigger_logic: Mapped[str | None] = mapped_column(Text)
    lookback_period: Mapped[str | None] = mapped_column(String(50))
    clinical_documents_required: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    portal_or_submission_type: Mapped[str | None] = mapped_column(String(50))
