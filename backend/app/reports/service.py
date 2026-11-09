"""Report calculations shared by JSON endpoints and Excel/PDF exports."""
import calendar
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.constants import (
    LOAN_ACTIVE,
    SCOPE_PERSONAL,
    SCOPE_SHARED,
    STATUS_POSTED,
    TXN_EXPENSE,
    TXN_INCOME,
    money,
)
from app.core.deps import CurrentContext
from app.models.account import Account
from app.models.budget import Budget
from app.models.category import Category
from app.models.household import HouseholdMember, User
from app.models.loan import Loan
from app.models.savings import SavingsContribution, SavingsGoal
from app.models.transaction import Transaction, Transfer
from app.permissions.rbac import is_admin, transaction_visibility_filter
from app.schemas.reporting import (
    AccountBalanceRow,
    AnnualSummary,
    BudgetVsActualRow,
    CategoryReportRow,
    LoanReportRow,
    MemberReportRow,
    MonthlySummary,
    RecurringRow,
    SavingsGrowthRow,
    ScopeReport,
)
from app.services.accounts import account_flow
from app.services.budgets import active_budgets_for_month, build_budget_out
from app.services.recurring import upcoming_rules


def _visible_transactions(ctx: CurrentContext):
    return and_(
        Transaction.household_id == ctx.household_id,
        transaction_visibility_filter(ctx),
    )


def _scoped_filters(
    ctx: CurrentContext,
    date_from: date | None = None,
    date_to: date | None = None,
    member_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    status: str = STATUS_POSTED,
):
    filters = [Transaction.household_id == ctx.household_id, Transaction.status == status]
    if not is_admin(ctx):
        filters.append(transaction_visibility_filter(ctx))
    if date_from:
        filters.append(Transaction.transaction_date >= date_from)
    if date_to:
        filters.append(Transaction.transaction_date <= date_to)
    if member_id:
        filters.append(
            or_(
                Transaction.owner_user_id == member_id,
                and_(Transaction.scope == SCOPE_SHARED, Transaction.created_by == member_id),
            )
        )
    if category_id:
        filters.append(Transaction.category_id == category_id)
    return filters


def month_label(year: int, month: int) -> str:
    return f"{calendar.month_name[month]} {year}"


def monthly_summary_row(db: Session, ctx: CurrentContext, year: int, month: int, member_id=None) -> MonthlySummary:
    start = date(year, month, 1)
    end = date(year, month, calendar.monthrange(year, month)[1])
    filters = _scoped_filters(ctx, start, end, member_id)
    income = money(0)
    expenses = money(0)
    count = 0
    for txn_type, amount in db.execute(
        select(Transaction.transaction_type, Transaction.amount).where(*filters)
    ).all():
        count += 1
        if txn_type == TXN_INCOME:
            income += money(amount)
        else:
            expenses += money(amount)

    contributions = money(0)
    savings_query = select(SavingsContribution.amount).where(
        SavingsContribution.contribution_date >= start,
        SavingsContribution.contribution_date <= end,
        SavingsContribution.goal_id.in_(
            select(SavingsGoal.id).where(SavingsGoal.household_id == ctx.household_id)
        ),
    )
    if not is_admin(ctx):
        savings_query = savings_query.where(SavingsContribution.created_by == ctx.user.id)
    for (amount,) in db.execute(savings_query).all():
        contributions += money(amount)

    transfer_filters = [
        Transfer.household_id == ctx.household_id,
        Transfer.status == STATUS_POSTED,
        Transfer.transfer_date >= start,
        Transfer.transfer_date <= end,
    ]
    transfers = money(0)
    for (amount,) in db.execute(select(Transfer.amount).where(*transfer_filters)).all():
        transfers += money(amount)

    return MonthlySummary(
        month=f"{year:04d}-{month:02d}",
        label=month_label(year, month),
        income=money(income),
        expenses=money(expenses),
        net=money(income - expenses),
        savings_contributions=money(contributions),
        transfers=money(transfers),
        transaction_count=count,
    )


def annual_summary(db: Session, ctx: CurrentContext, year: int, member_id=None) -> AnnualSummary:
    months = [monthly_summary_row(db, ctx, year, m, member_id) for m in range(1, 13)]
    return AnnualSummary(
        year=year,
        months=months,
        total_income=money(sum((m.income for m in months), start=money(0))),
        total_expenses=money(sum((m.expenses for m in months), start=money(0))),
        net=money(sum((m.net for m in months), start=money(0))),
        total_savings=money(sum((m.savings_contributions for m in months), start=money(0))),
    )


def category_expenses(
    db: Session,
    ctx: CurrentContext,
    date_from: date | None = None,
    date_to: date | None = None,
    member_id=None,
    kind: str = TXN_EXPENSE,
) -> list[CategoryReportRow]:
    filters = _scoped_filters(ctx, date_from, date_to, member_id)
    filters.append(Transaction.transaction_type == kind)
    rows = db.execute(
        select(Transaction.category_id, Transaction.amount).where(*filters)
    ).all()
    totals: dict = {}
    counts: dict = {}
    for category_id, amount in rows:
        totals[category_id] = totals.get(category_id, money(0)) + money(amount)
        counts[category_id] = counts.get(category_id, 0) + 1
    grand = sum(totals.values(), start=money(0))
    categories = {
        c.id: c for c in db.execute(select(Category).where(Category.household_id == ctx.household_id)).scalars()
    }
    result = []
    for category_id, amount in sorted(totals.items(), key=lambda item: item[1], reverse=True):
        category = categories.get(category_id)
        result.append(
            CategoryReportRow(
                category_id=category_id,
                category=category.name if category else "Uncategorised",
                color=category.color if category else "#90a4ae",
                amount=money(amount),
                percent=round(float(amount / grand * 100) if grand > 0 else 0.0, 1),
                transaction_count=counts.get(category_id, 0),
            )
        )
    return result


def member_summary(
    db: Session,
    ctx: CurrentContext,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[MemberReportRow]:
    filters = _scoped_filters(ctx, date_from, date_to)
    rows = db.execute(
        select(
            Transaction.owner_user_id,
            Transaction.created_by,
            Transaction.transaction_type,
            Transaction.scope,
            Transaction.amount,
        ).where(*filters)
    ).all()
    members = db.execute(
        select(HouseholdMember, User)
        .join(User, HouseholdMember.user_id == User.id)
        .where(HouseholdMember.household_id == ctx.household_id)
    ).all()
    allowed = {m.HouseholdMember.user_id: (m.HouseholdMember, m.User) for m in members}
    if not is_admin(ctx):
        allowed = {ctx.user.id: allowed[ctx.user.id]} if ctx.user.id in allowed else {}

    buckets = {uid: {"income": money(0), "expenses": money(0), "shared": money(0), "personal": money(0)} for uid in allowed}
    for owner_id, creator_id, txn_type, scope, amount in rows:
        member_id = owner_id or creator_id
        if member_id not in buckets:
            continue
        bucket = buckets[member_id]
        if txn_type == TXN_INCOME:
            bucket["income"] += money(amount)
        else:
            bucket["expenses"] += money(amount)
            if scope == SCOPE_SHARED:
                bucket["shared"] += money(amount)
            else:
                bucket["personal"] += money(amount)
    return [
        MemberReportRow(
            member_id=uid,
            member=allowed[uid][1].full_name,
            color=allowed[uid][0].display_color or "#1976d2",
            income=money(b["income"]),
            expenses=money(b["expenses"]),
            net=money(b["income"] - b["expenses"]),
            shared_expenses=money(b["shared"]),
            personal_expenses=money(b["personal"]),
        )
        for uid, b in buckets.items()
    ]


def scope_report(db: Session, ctx: CurrentContext, date_from: date | None = None, date_to: date | None = None) -> ScopeReport:
    filters = _scoped_filters(ctx, date_from, date_to)
    rows = db.execute(
        select(Transaction.transaction_type, Transaction.scope, Transaction.amount).where(*filters)
    ).all()
    shared_income = personal_income = shared_expenses = personal_expenses = money(0)
    for txn_type, scope, amount in rows:
        if txn_type == TXN_INCOME:
            if scope == SCOPE_SHARED:
                shared_income += money(amount)
            else:
                personal_income += money(amount)
        else:
            if scope == SCOPE_SHARED:
                shared_expenses += money(amount)
            else:
                personal_expenses += money(amount)
    total = shared_expenses + personal_expenses
    return ScopeReport(
        shared_income=money(shared_income),
        personal_income=money(personal_income),
        shared_expenses=money(shared_expenses),
        personal_expenses=money(personal_expenses),
        shared_percent=round(float(shared_expenses / total * 100) if total > 0 else 0.0, 1),
        personal_percent=round(float(personal_expenses / total * 100) if total > 0 else 0.0, 1),
    )


def account_balances(db: Session, ctx: CurrentContext, date_from: date | None = None, date_to: date | None = None) -> list[AccountBalanceRow]:
    query = select(Account).where(Account.household_id == ctx.household_id)
    if not is_admin(ctx):
        query = query.where(or_(Account.owner_user_id.is_(None), Account.owner_user_id == ctx.user.id))
    accounts = list(db.execute(query).scalars())
    flows = account_flow(db, [a.id for a in accounts], date_from, date_to)
    rows = []
    for account in accounts:
        flow = flows.get(account.id, {"income": money(0), "expenses": money(0), "transfers_in": money(0), "transfers_out": money(0)})
        balance = money(
            money(account.opening_balance)
            + flow["income"]
            + flow["transfers_in"]
            - flow["expenses"]
            - flow["transfers_out"]
        )
        rows.append(
            AccountBalanceRow(
                account_id=account.id,
                name=account.name,
                account_type=account.account_type,
                owner=account.owner.full_name if account.owner else "Shared",
                opening_balance=money(account.opening_balance),
                income=flow["income"],
                expenses=flow["expenses"],
                transfers_in=flow["transfers_in"],
                transfers_out=flow["transfers_out"],
                current_balance=balance,
            )
        )
    return rows


def outstanding_loans(db: Session, ctx: CurrentContext) -> list[LoanReportRow]:
    loans = db.execute(
        select(Loan).where(Loan.household_id == ctx.household_id).order_by(Loan.start_date.desc())
    ).scalars().all()
    today = date.today()
    rows = []
    for loan in loans:
        principal_repaid = money(sum((money(r.principal_component) for r in loan.repayments), start=money(0)))
        outstanding = money(max(money(loan.principal_amount) - principal_repaid, money(0)))
        rows.append(
            LoanReportRow(
                loan_id=loan.id,
                counterparty=loan.counterparty,
                direction=loan.direction,
                principal=money(loan.principal_amount),
                repaid=principal_repaid,
                outstanding=outstanding,
                due_date=loan.due_date,
                status=loan.status,
                is_overdue=bool(loan.due_date and loan.due_date < today and outstanding > 0),
            )
        )
    return rows


def recurring_schedule(db: Session, ctx: CurrentContext) -> list[RecurringRow]:
    today = date.today()
    return [
        RecurringRow(
            rule_id=rule.id,
            name=rule.name,
            frequency=rule.frequency,
            amount=money(rule.amount),
            next_due_date=rule.next_due_date,
            days_until_due=(rule.next_due_date - today).days,
            account=rule.account.name if rule.account else "-",
            responsible=rule.responsible.full_name if rule.responsible else None,
            is_active=rule.is_active,
        )
        for rule in upcoming_rules(db, ctx.household_id, within_days=365)
    ]


def savings_growth(db: Session, ctx: CurrentContext) -> list[SavingsGrowthRow]:
    rows = []
    goals = db.execute(
        select(SavingsGoal).where(SavingsGoal.household_id == ctx.household_id)
    ).scalars().all()
    for goal in goals:
        current = money(sum((money(c.amount) for c in goal.contributions), start=money(0)))
        target = money(goal.target_amount)
        rows.append(
            SavingsGrowthRow(
                goal_id=goal.id,
                goal=goal.name,
                target=target,
                current=current,
                progress_percent=round(float(current / target * 100) if target > 0 else 0.0, 1),
            )
        )
    return rows


def budget_vs_actual(db: Session, ctx: CurrentContext, on_date: date | None = None) -> list[BudgetVsActualRow]:
    on_date = on_date or date.today()
    budgets = active_budgets_for_month(db, ctx.household_id, on_date)
    if not is_admin(ctx):
        budgets = [b for b in budgets if b.owner_user_id in (None, ctx.user.id)]
    rows = []
    for budget in budgets:
        summary = build_budget_out(db, ctx, budget)
        rows.append(
            BudgetVsActualRow(
                budget_id=budget.id,
                budget=budget.name,
                period=f"{budget.start_date:%d %b %Y} - {budget.end_date:%d %b %Y}",
                owner=summary.budget.owner_name or "Family",
                planned=summary.budget.total_planned,
                actual=summary.budget.total_actual,
                remaining=summary.budget.total_remaining,
                utilization_percent=summary.budget.utilization_percent,
            )
        )
    return rows
