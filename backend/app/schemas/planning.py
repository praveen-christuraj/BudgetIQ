"""Budget, recurring, savings and loan schemas."""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import Money, ORMModel, Rate


# --------------------------------------------------------------------------- #
# Budgets
# --------------------------------------------------------------------------- #
class AllocationIn(BaseModel):
    category_id: UUID
    planned_amount: Money = Field(ge=0)
    note: str | None = Field(default=None, max_length=255)


class BudgetCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    period_type: str = Field(default="monthly", pattern="^(monthly|annual)$")
    start_date: date
    end_date: date
    owner_user_id: UUID | None = None
    carry_forward: bool = False
    notes: str | None = None
    allocations: list[AllocationIn] = Field(default_factory=list)


class BudgetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    owner_user_id: UUID | None = None
    carry_forward: bool | None = None
    status: str | None = Field(default=None, pattern="^(active|archived)$")
    notes: str | None = None


class AllocationOut(ORMModel):
    id: UUID
    category_id: UUID
    category_name: str | None = None
    category_color: str | None = None
    planned_amount: Money
    carry_forward_amount: Money = 0
    actual_amount: Money = 0
    remaining_amount: Money = 0
    utilization_percent: float = 0
    status: str = "ok"
    note: str | None = None


class BudgetOut(ORMModel):
    id: UUID
    name: str
    period_type: str
    start_date: date
    end_date: date
    owner_user_id: UUID | None = None
    owner_name: str | None = None
    is_family_budget: bool = False
    carry_forward: bool = False
    status: str
    notes: str | None = None
    total_planned: Money = 0
    total_actual: Money = 0
    total_remaining: Money = 0
    utilization_percent: float = 0
    allocations: list[AllocationOut] = Field(default_factory=list)
    created_at: datetime


class BudgetSummary(BaseModel):
    budget: BudgetOut
    unbudgeted_actual: Money = 0
    total_income: Money = 0
    total_expenses: Money = 0
    warning_threshold: float = 80
    critical_threshold: float = 100


# --------------------------------------------------------------------------- #
# Recurring
# --------------------------------------------------------------------------- #
class RecurringCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    transaction_type: str = Field(default="expense", pattern="^(income|expense)$")
    scope: str = Field(default="shared", pattern="^(shared|personal)$")
    owner_user_id: UUID | None = None
    category_id: UUID | None = None
    account_id: UUID
    responsible_user_id: UUID | None = None
    amount: Money = Field(gt=0)
    frequency: str = Field(default="monthly", pattern="^(daily|weekly|monthly|quarterly|yearly)$")
    start_date: date
    end_date: date | None = None
    next_due_date: date | None = None
    payment_method: str = Field(default="bank_transfer", max_length=30)
    description: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    is_active: bool = True


class RecurringUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    amount: Money | None = Field(default=None, gt=0)
    category_id: UUID | None = None
    account_id: UUID | None = None
    responsible_user_id: UUID | None = None
    scope: str | None = Field(default=None, pattern="^(shared|personal)$")
    owner_user_id: UUID | None = None
    frequency: str | None = Field(default=None, pattern="^(daily|weekly|monthly|quarterly|yearly)$")
    start_date: date | None = None
    end_date: date | None = None
    next_due_date: date | None = None
    payment_method: str | None = None
    description: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class RecurringOut(ORMModel):
    id: UUID
    name: str
    transaction_type: str
    scope: str
    owner_user_id: UUID | None = None
    owner_name: str | None = None
    category_id: UUID | None = None
    category_name: str | None = None
    account_id: UUID
    account_name: str | None = None
    responsible_user_id: UUID | None = None
    responsible_name: str | None = None
    amount: Money
    frequency: str
    start_date: date
    end_date: date | None = None
    next_due_date: date
    payment_method: str
    description: str | None = None
    notes: str | None = None
    is_active: bool
    days_until_due: int | None = None
    created_at: datetime


class GenerateResult(BaseModel):
    created: int
    transactions: list = Field(default_factory=list)
    message: str


# --------------------------------------------------------------------------- #
# Savings
# --------------------------------------------------------------------------- #
class GoalCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    target_amount: Money = Field(gt=0)
    target_date: date | None = None
    owner_user_id: UUID | None = None
    account_id: UUID | None = None
    notes: str | None = None


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    target_amount: Money | None = Field(default=None, gt=0)
    target_date: date | None = None
    owner_user_id: UUID | None = None
    account_id: UUID | None = None
    status: str | None = Field(default=None, pattern="^(active|achieved|archived)$")
    notes: str | None = None


class ContributionCreate(BaseModel):
    amount: Money = Field(gt=0)
    contribution_date: date
    account_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=255)


class ContributionOut(ORMModel):
    id: UUID
    goal_id: UUID
    amount: Money
    contribution_date: date
    account_id: UUID | None = None
    account_name: str | None = None
    notes: str | None = None
    created_by: UUID
    created_by_name: str | None = None
    created_at: datetime


class GoalOut(ORMModel):
    id: UUID
    name: str
    target_amount: Money
    current_amount: Money = 0
    remaining_amount: Money = 0
    progress_percent: float = 0
    target_date: date | None = None
    owner_user_id: UUID | None = None
    owner_name: str | None = None
    is_shared: bool = False
    account_id: UUID | None = None
    account_name: str | None = None
    status: str
    notes: str | None = None
    contributions: list[ContributionOut] = Field(default_factory=list)
    created_at: datetime


# --------------------------------------------------------------------------- #
# Loans
# --------------------------------------------------------------------------- #
class LoanCreate(BaseModel):
    direction: str = Field(default="borrowed", pattern="^(borrowed|lent)$")
    counterparty: str = Field(min_length=2, max_length=150)
    principal_amount: Money = Field(gt=0)
    interest_rate: Rate | None = None
    start_date: date
    due_date: date | None = None
    account_id: UUID | None = None
    notes: str | None = None


class LoanUpdate(BaseModel):
    counterparty: str | None = Field(default=None, min_length=2, max_length=150)
    principal_amount: Money | None = Field(default=None, gt=0)
    interest_rate: Rate | None = None
    start_date: date | None = None
    due_date: date | None = None
    account_id: UUID | None = None
    status: str | None = Field(default=None, pattern="^(active|closed)$")
    notes: str | None = None


class RepaymentCreate(BaseModel):
    amount: Money = Field(gt=0)
    principal_component: Money | None = Field(default=None, ge=0)
    interest_component: Money | None = Field(default=None, ge=0)
    repayment_date: date
    account_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=255)


class RepaymentOut(ORMModel):
    id: UUID
    loan_id: UUID
    amount: Money
    principal_component: Money
    interest_component: Money
    repayment_date: date
    account_id: UUID | None = None
    account_name: str | None = None
    notes: str | None = None
    created_by: UUID
    created_by_name: str | None = None
    created_at: datetime


class LoanOut(ORMModel):
    id: UUID
    direction: str
    counterparty: str
    principal_amount: Money
    interest_rate: Rate | None = None
    start_date: date
    due_date: date | None = None
    account_id: UUID | None = None
    status: str
    notes: str | None = None
    total_repaid: Money = 0
    principal_repaid: Money = 0
    interest_paid: Money = 0
    outstanding_balance: Money = 0
    repayment_progress_percent: float = 0
    is_overdue: bool = False
    repayments: list[RepaymentOut] = Field(default_factory=list)
    created_at: datetime
