import uuid
from datetime import datetime

from sqlalchemy import Date, DateTime, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    payer_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    date_of_service: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    procedure_family: Mapped[str] = mapped_column(String(50), nullable=False)
    laterality: Mapped[str | None] = mapped_column(String(5))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="READY")
    total_billed: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    expected_allowed: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    expected_paid: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    diagnosis_codes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
