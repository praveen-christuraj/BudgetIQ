"""In-app notifications generated from budget, recurring, loan and goal rules."""
import uuid

from sqlalchemy import Boolean, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import GUID, TimestampMixin, new_uuid


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_household_read", "household_id", "is_read"),
        Index("ix_notifications_dedupe", "household_id", "dedupe_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)
    household_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    # Optional target member; NULL means everybody in the household.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="info", nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(200), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
