import uuid
from datetime import datetime

from sqlalchemy import DateTime, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trace_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    actor: Mapped[str] = mapped_column(String(64), nullable=False, default="system")
    rule_invoked: Mapped[str] = mapped_column(String(120), nullable=False)
    input_values: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    output_decision: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    confidence: Mapped[float | None] = mapped_column(Numeric(5, 4))
    override_status: Mapped[str | None] = mapped_column(String(20))
    override_reason: Mapped[str | None] = mapped_column(Text)
    code_library_version: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
