import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReimbursementHistory(Base):
    __tablename__ = "reimbursement_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payer_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    plan: Mapped[str | None] = mapped_column(String(80))
    hcpcs_code: Mapped[str] = mapped_column(ForeignKey("hcpcs_master.hcpcs_code"), nullable=False, index=True)
    allowed_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    paid_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    adjudication_days: Mapped[int | None] = mapped_column(Integer)
    denial_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    denial_reason: Mapped[str | None] = mapped_column(Text)
    appeal_outcome: Mapped[str | None] = mapped_column(String(50))
    region: Mapped[str | None] = mapped_column(String(20))
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
