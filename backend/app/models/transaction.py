"""Transactions, receipts/attachments and account transfers."""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import (
    CURRENCY_DEFAULT,
    SCOPE_PERSONAL,
    STATUS_DRAFT,
    TXN_EXPENSE,
)
from app.core.database import Base
from app.models.base import GUID, TimestampMixin, new_uuid, utcnow


class Transaction(Base, TimestampMixin):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_household_date", "household_id", "transaction_date"),
        Index("ix_transactions_household_category", "household_id", "category_id"),
        Index("ix_transactions_household_account", "household_id", "account_id"),
        Index("ix_transactions_household_owner", "household_id", "owner_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)
    household_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    # Financial owner. NULL for shared household transactions.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    transaction_type: Mapped[str] = mapped_column(String(20), default=TXN_EXPENSE, nullable=False)
    scope: Mapped[str] = mapped_column(String(20), default=SCOPE_PERSONAL, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=STATUS_DRAFT, nullable=False)

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("subcategories.id", ondelete="SET NULL"), nullable=True
    )

    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default=CURRENCY_DEFAULT, nullable=False)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_method: Mapped[str] = mapped_column(String(30), default="cash", nullable=False)

    # Reversal / soft-delete bookkeeping (financial history is preserved).
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reversal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reversed_by: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )

    account = relationship("Account", foreign_keys=[account_id])
    category = relationship("Category", foreign_keys=[category_id])
    subcategory = relationship("Subcategory", foreign_keys=[subcategory_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
    owner = relationship("User", foreign_keys=[owner_user_id])
    attachments: Mapped[list["TransactionAttachment"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )


class TransactionAttachment(Base):
    __tablename__ = "transaction_attachments"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    transaction: Mapped[Transaction] = relationship(back_populates="attachments")


class Transfer(Base, TimestampMixin):
    __tablename__ = "transfers"
    __table_args__ = (Index("ix_transfers_household_date", "household_id", "transfer_date"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)
    household_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    from_account_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False
    )
    to_account_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default=CURRENCY_DEFAULT, nullable=False)
    transfer_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="posted", nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reversal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    from_account = relationship("Account", foreign_keys=[from_account_id])
    to_account = relationship("Account", foreign_keys=[to_account_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
