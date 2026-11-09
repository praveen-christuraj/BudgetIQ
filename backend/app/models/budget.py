"""Monthly / annual budgets and their category allocations."""
import uuid
from decimal import Decimal
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import BUDGET_ACTIVE, PERIOD_MONTHLY
from app.core.database import Base
from app.models.base import GUID, TimestampMixin, new_uuid


class Budget(Base, TimestampMixin):
    __tablename__ = "budgets"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)
    household_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL owner_user_id = family budget; otherwise the member's personal budget.
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    period_type: Mapped[str] = mapped_column(String(20), default=PERIOD_MONTHLY, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    carry_forward: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=BUDGET_ACTIVE, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    allocations: Mapped[list["BudgetAllocation"]] = relationship(
        back_populates="budget", cascade="all, delete-orphan", order_by="BudgetAllocation.created_at"
    )
    owner = relationship("User", foreign_keys=[owner_user_id])
    created_by_user = relationship("User", foreign_keys=[created_by])


class BudgetAllocation(Base, TimestampMixin):
    __tablename__ = "budget_allocations"
    __table_args__ = (UniqueConstraint("budget_id", "category_id", name="uq_allocation_budget_category"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=new_uuid)
    budget_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    planned_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    carry_forward_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    budget: Mapped[Budget] = relationship(back_populates="allocations")
    category = relationship("Category")
