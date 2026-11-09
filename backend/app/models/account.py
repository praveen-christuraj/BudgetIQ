"""Financial accounts (shared household accounts and member-owned accounts)."""
import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import CURRENCY_DEFAULT
from app.core.database import Base
from app.models.base import GUID, TimestampMixin, new_uuid


class Account(Base, TimestampMixin):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)
    household_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL owner_user_id means the account belongs to the household (shared).
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    account_type: Mapped[str] = mapped_column(String(30), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(120), nullable=True)
    account_number_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default=CURRENCY_DEFAULT, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner = relationship("User", foreign_keys=[owner_user_id])
