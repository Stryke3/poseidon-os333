import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DocumentationRule(Base):
    __tablename__ = "documentation_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hcpcs_code: Mapped[str] = mapped_column(ForeignKey("hcpcs_master.hcpcs_code"), nullable=False, index=True)
    required_document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    required_elements: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    must_include_laterality_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    must_include_dos_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    must_include_provider_signature_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    must_include_npi_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    must_include_medical_necessity_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    must_include_risk_score_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
