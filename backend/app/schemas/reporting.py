"""Dashboard, report, notification and audit schemas."""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import Money, ORMModel
from app.schemas.finance import TransactionOut


class DashboardTotals(BaseModel):
    total_income: Money = 0
    total_expenses: Money = 0
    remaining_cash_flow: Money = 0
    total_savings_contributions: Money = 0
    total_account_balance: Money = 0
    budget_utilization_percent: float = 0
    budget_planned: Money = 0
    budget_actual: Money = 0
    savings_goal_total: Money = 0
    savings_goal_target: Money = 0
    loan_outstanding: Money = 0
    unread_notifications: int = 0


class TrendPoint(BaseModel):
    month: str
    label: str
    income: Money = 0
    expenses: Money = 0
    net: Money = 0


class CategorySlice(BaseModel):
    category_id: UUID | None = None
    name: str
    color: str = "#607d8b"
    amount: Money = 0
    percent: float = 0


class MemberSpend(BaseModel):
    member_id: UUID | None = None
    name: str
    color: str = "#1976d2"
    income: Money = 0
    expenses: Money = 0


class DashboardOut(BaseModel):
    view: str
    month: str
    totals: DashboardTotals
    trend: list[TrendPoint] = Field(default_factory=list)
    category_breakdown: list[CategorySlice] = Field(default_factory=list)
    member_breakdown: list[MemberSpend] = Field(default_factory=list)
    upcoming_payments: list[dict] = Field(default_factory=list)
    recent_transactions: list[TransactionOut] = Field(default_factory=list)
    active_budgets: list[dict] = Field(default_factory=list)


class MonthlySummary(BaseModel):
    month: str
    label: str
    income: Money
    expenses: Money
    net: Money
    savings_contributions: Money
    transfers: Money
    transaction_count: int


class AnnualSummary(BaseModel):
    year: int
    months: list[MonthlySummary]
    total_income: Money
    total_expenses: Money
    net: Money
    total_savings: Money


class CategoryReportRow(BaseModel):
    category_id: UUID | None = None
    category: str
    color: str = "#607d8b"
    amount: Money
    percent: float
    transaction_count: int


class MemberReportRow(BaseModel):
    member_id: UUID | None = None
    member: str
    color: str
    income: Money
    expenses: Money
    net: Money
    shared_expenses: Money
    personal_expenses: Money


class ScopeReport(BaseModel):
    shared_income: Money
    personal_income: Money
    shared_expenses: Money
    personal_expenses: Money
    shared_percent: float
    personal_percent: float


class AccountBalanceRow(BaseModel):
    account_id: UUID
    name: str
    account_type: str
    owner: str
    opening_balance: Money
    income: Money
    expenses: Money
    transfers_in: Money
    transfers_out: Money
    current_balance: Money


class LoanReportRow(BaseModel):
    loan_id: UUID
    counterparty: str
    direction: str
    principal: Money
    repaid: Money
    outstanding: Money
    due_date: date | None
    status: str
    is_overdue: bool


class RecurringRow(BaseModel):
    rule_id: UUID
    name: str
    frequency: str
    amount: Money
    next_due_date: date
    days_until_due: int
    account: str
    responsible: str | None
    is_active: bool


class SavingsGrowthRow(BaseModel):
    goal_id: UUID
    goal: str
    target: Money
    current: Money
    progress_percent: float


class BudgetVsActualRow(BaseModel):
    budget_id: UUID
    budget: str
    period: str
    owner: str
    planned: Money
    actual: Money
    remaining: Money
    utilization_percent: float


class NotificationOut(ORMModel):
    id: UUID
    type: str
    severity: str
    title: str
    message: str
    entity_type: str | None = None
    entity_id: UUID | None = None
    is_read: bool
    created_at: datetime


class NotificationCounts(BaseModel):
    total: int = 0
    unread: int = 0
    warning: int = 0
    critical: int = 0


class AuditOut(ORMModel):
    id: UUID
    actor_user_id: UUID | None = None
    actor_name: str
    action: str
    entity_type: str
    entity_id: str | None = None
    summary: str
    before_json: str | None = None
    after_json: str | None = None
    ip_address: str | None = None
    created_at: datetime


class ReportExportRequest(BaseModel):
    format: str = Field(default="xlsx", pattern="^(xlsx|pdf)$")
    date_from: date | None = None
    date_to: date | None = None
    member_id: UUID | None = None
    category_id: UUID | None = None


class RegisterRow(BaseModel):
    transaction_id: UUID
    transaction_date: date
    transaction_type: str
    description: str
    scope: str
    owner: str
    amount: Money
    status: str


class TransactionRegisterReport(BaseModel):
    rows: list[RegisterRow]
    total_income: Money
    total_expenses: Money
    count: int
