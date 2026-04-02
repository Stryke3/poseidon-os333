import uuid

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ClaimLine(Base):
    __tablename__ = "claim_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True)
    hcpcs_code: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    units: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    modifiers: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    diagnosis_pointers: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=[])
    charge_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    line_status: Mapped[str] = mapped_column(String(20), nullable=False, default="READY")
