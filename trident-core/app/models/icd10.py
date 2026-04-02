from sqlalchemy import Boolean, Date, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ICD10Master(Base):
    __tablename__ = "icd10_master"

    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    short_description: Mapped[str] = mapped_column(String(255), nullable=False)
    long_description: Mapped[str | None] = mapped_column(Text)
    chapter: Mapped[str | None] = mapped_column(String(50))
    category: Mapped[str | None] = mapped_column(String(50))
    billable_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    laterality_required_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    postop_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    chronic_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    surgical_episode_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    effective_date: Mapped[Date] = mapped_column(Date, nullable=False)
    termination_date: Mapped[Date | None] = mapped_column(Date)
    version_year: Mapped[int] = mapped_column(Integer, nullable=False)
    status_active_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
