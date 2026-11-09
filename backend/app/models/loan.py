"""Loans (money borrowed or lent) and repayment records."""
import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import LOAN_ACTIVE, LOAN_BORROWED
from app.core.database import Base
from app.models.base import GUID, TimestampMixin, new_uuid


class Loan(Base, TimestampMixin):
    __tablename__ = "loans"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)
    household_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction: Mapped[str] = mapped_column(String(20), default=LOAN_BORROWED, nullable=False)
    counterparty: Mapped[str] = mapped_column(String(150), nullable=False)
    principal_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    interest_rate: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default=LOAN_ACTIVE, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    repayments: Mapped[list["LoanRepayment"]] = relationship(
        back_populates="loan", cascade="all, delete-orphan", order_by="LoanRepayment.repayment_date"
    )
    account = relationship("Account")


class LoanRepayment(Base, TimestampMixin):
    __tablename__ = "loan_repayments"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)
    loan_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("loans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    principal_component: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    interest_component: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    repayment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    loan: Mapped[Loan] = relationship(back_populates="repayments")
    account = relationship("Account")
    creator = relationship("User", foreign_keys=[created_by])
