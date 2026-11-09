"""Dashboard aggregation for the Family Overview / My Finances toggle."""
import calendar
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import (
    LOAN_ACTIVE,
    LOAN_BORROWED,
    SCOPE_SHARED,
    STATUS_POSTED,
    TXN_EXPENSE,
    TXN_INCOME,
    money,
)
from app.core.deps import CurrentContext
from app.models.account import Account
from app.models.category import Category
from app.models.household import HouseholdMember, User
from app.models.loan import Loan
from app.models.notification import Notification
from app.models.savings import SavingsGoal
from app.models.transaction import Transaction
from app.permissions.rbac import is_admin, transaction_visibility_filter
from app.schemas.reporting import (
    CategorySlice,
    DashboardOut,
    DashboardTotals,
    MemberSpend,
    TrendPoint,
)
from app.services.accounts import balance_map
from app.services.budgets import active_budgets_for_month, build_budget_out
from app.services.recurring import upcoming_rules
from app.services.serializers import transaction_out
from app.services.transactions import TX_LOAD_OPTIONS


def month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def parse_month(value: str | None) -> tuple[int, int]:
    if value:
        try:
            year_str, month_str = value.split("-")
            return int(year_str), int(month_str)
        except (ValueError, AttributeError):
            pass
    today = date.today()
    return today.year, today.month


def scope_filter(ctx: CurrentContext, view: str):
    """Family view sees the whole household; personal view sees own records."""
    if view == "personal":
        return or_(
            Transaction.owner_user_id == ctx.user.id,
            and_(Transaction.scope == SCOPE_SHARED, Transaction.created_by == ctx.user.id),
        )
    return and_(Transaction.household_id == ctx.household_id, transaction_visibility_filter(ctx))


def month_totals(db: Session, ctx: CurrentContext, start: date, end: date, view: str) -> dict:
    query = select(Transaction.transaction_type, Transaction.amount).where(
        Transaction.household_id == ctx.household_id,
        Transaction.status == STATUS_POSTED,
        Transaction.transaction_date >= start,
        Transaction.transaction_date <= end,
        scope_filter(ctx, view),
    )
    income = money(0)
    expenses = money(0)
    count = 0
    for txn_type, amount in db.execute(query).all():
        count += 1
        if txn_type == TXN_INCOME:
            income += money(amount)
        elif txn_type == TXN_EXPENSE:
            expenses += money(amount)
    return {"income": money(income), "expenses": money(expenses), "count": count}


def savings_contributions_in_period(db: Session, ctx: CurrentContext, start: date, end: date, view: str) -> Decimal:
    from app.models.savings import SavingsContribution

    query = select(SavingsContribution).where(
        SavingsContribution.contribution_date >= start,
        SavingsContribution.contribution_date <= end,
        SavingsContribution.goal_id.in_(
            select(SavingsGoal.id).where(SavingsGoal.household_id == ctx.household_id)
        ),
    )
    if view == "personal":
        query = query.where(SavingsContribution.created_by == ctx.user.id)
    total = money(0)
    for contribution in db.execute(query).scalars():
        total += money(contribution.amount)
    return money(total)


def visible_accounts(db: Session, ctx: CurrentContext, view: str) -> list[Account]:
    query = select(Account).where(
        Account.household_id == ctx.household_id, Account.is_active.is_(True)
    )
    if view == "personal" or not is_admin(ctx):
        query = query.where(or_(Account.owner_user_id.is_(None), Account.owner_user_id == ctx.user.id))
    return list(db.execute(query).scalars())


def build_trend(db: Session, ctx: CurrentContext, year: int, month: int, view: str, months: int = 6) -> list[TrendPoint]:
    points: list[TrendPoint] = []
    cursor_year, cursor_month = year, month
    periods = []
    for _ in range(months):
        periods.append((cursor_year, cursor_month))
        cursor_month -= 1
        if cursor_month == 0:
            cursor_month = 12
            cursor_year -= 1
    for y, m in reversed(periods):
        start, end = month_bounds(y, m)
        totals = month_totals(db, ctx, start, end, view)
        points.append(
            TrendPoint(
                month=f"{y:04d}-{m:02d}",
                label=start.strftime("%b %y"),
                income=totals["income"],
                expenses=totals["expenses"],
                net=money(totals["income"] - totals["expenses"]),
            )
        )
    return points


def build_category_breakdown(db: Session, ctx: CurrentContext, start: date, end: date, view: str) -> list[CategorySlice]:
    rows = db.execute(
        select(Transaction.category_id, Transaction.amount).where(
            Transaction.household_id == ctx.household_id,
            Transaction.status == STATUS_POSTED,
            Transaction.transaction_type == TXN_EXPENSE,
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
            scope_filter(ctx, view),
        )
    ).all()
    totals: dict = {}
    for category_id, amount in rows:
        totals[category_id] = totals.get(category_id, money(0)) + money(amount)
    grand = sum(totals.values(), start=money(0))
    categories = {
        c.id: c
        for c in db.execute(select(Category).where(Category.household_id == ctx.household_id)).scalars()
    }
    slices = []
    for category_id, amount in sorted(totals.items(), key=lambda item: item[1], reverse=True):
        category = categories.get(category_id)
        slices.append(
            CategorySlice(
                category_id=category_id,
                name=category.name if category else "Uncategorised",
                color=category.color if category else "#90a4ae",
                amount=money(amount),
                percent=round(float(amount / grand * 100) if grand > 0 else 0.0, 1),
            )
        )
    return slices[:8]


def build_member_breakdown(db: Session, ctx: CurrentContext, start: date, end: date, view: str) -> list[MemberSpend]:
    members = db.execute(
        select(HouseholdMember, User)
        .join(User, HouseholdMember.user_id == User.id)
        .where(HouseholdMember.household_id == ctx.household_id)
    ).all()
    allowed_ids = {m.HouseholdMember.user_id for m in members}
    if view == "personal" or not is_admin(ctx):
        allowed_ids = {ctx.user.id}

    rows = db.execute(
        select(
            Transaction.owner_user_id,
            Transaction.created_by,
            Transaction.transaction_type,
            Transaction.amount,
        ).where(
            Transaction.household_id == ctx.household_id,
            Transaction.status == STATUS_POSTED,
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
            scope_filter(ctx, view),
        )
    ).all()

    buckets: dict[uuid.UUID, dict] = {user_id: {"income": money(0), "expenses": money(0)} for user_id in allowed_ids}
    for owner_id, creator_id, txn_type, amount in rows:
        member_id = owner_id or creator_id
        if member_id not in buckets:
            continue
        if txn_type == TXN_INCOME:
            buckets[member_id]["income"] += money(amount)
        else:
            buckets[member_id]["expenses"] += money(amount)

    output = []
    for membership, user in members:
        if user.id not in buckets:
            continue
        bucket = buckets[user.id]
        output.append(
            MemberSpend(
                member_id=user.id,
                name=user.full_name,
                color=membership.display_color or "#1976d2",
                income=money(bucket["income"]),
                expenses=money(bucket["expenses"]),
            )
        )
    return output


def build_upcoming(db: Session, ctx: CurrentContext) -> list[dict]:
    today = date.today()
    upcoming: list[dict] = []
    for rule in upcoming_rules(db, ctx.household_id, within_days=30)[:6]:
        upcoming.append(
            {
                "kind": "recurring",
                "id": str(rule.id),
                "title": rule.name,
                "amount": float(money(rule.amount)),
                "due_date": rule.next_due_date.isoformat(),
                "days_until": (rule.next_due_date - today).days,
                "account": rule.account.name if rule.account else None,
                "type": rule.transaction_type,
            }
        )
    loans = db.execute(
        select(Loan).where(
            Loan.household_id == ctx.household_id,
            Loan.status == LOAN_ACTIVE,
            Loan.due_date.isnot(None),
            Loan.due_date <= today + timedelta(days=30),
        )
    ).scalars().all()
    for loan in loans:
        installment = money(loan.principal_amount) - money(
            sum((money(r.principal_component) for r in loan.repayments), start=money(0))
        )
        if installment <= 0:
            continue
        upcoming.append(
            {
                "kind": "loan",
                "id": str(loan.id),
                "title": f"Loan repayment - {loan.counterparty}",
                "amount": float(installment),
                "due_date": loan.due_date.isoformat(),
                "days_until": (loan.due_date - today).days,
                "account": None,
                "type": "expense",
            }
        )
    upcoming.sort(key=lambda item: item["due_date"])
    return upcoming


def build_dashboard(db: Session, ctx: CurrentContext, month: str | None = None, view: str = "family") -> DashboardOut:
    view = view if view in ("family", "personal") else "family"
    year, month_number = parse_month(month)
    start, end = month_bounds(year, month_number)

    totals = month_totals(db, ctx, start, end, view)
    accounts = visible_accounts(db, ctx, view)
    balances = balance_map(db, accounts)
    total_balance = money(sum((b["current_balance"] for b in balances.values()), start=money(0)))

    budgets = active_budgets_for_month(
        db, ctx.household_id, start, owner_user_id=ctx.user.id if view == "personal" else None
    )
    budget_cards = []
    planned_total = money(0)
    actual_total = money(0)
    for budget in budgets:
        summary = build_budget_out(db, ctx, budget)
        planned_total += money(summary.budget.total_planned)
        actual_total += money(summary.budget.total_actual)
        budget_cards.append(
            {
                "id": str(budget.id),
                "name": budget.name,
                "owner": summary.budget.owner_name,
                "planned": float(summary.budget.total_planned),
                "actual": float(summary.budget.total_actual),
                "utilization": summary.budget.utilization_percent,
                "warning_threshold": summary.warning_threshold,
                "critical_threshold": summary.critical_threshold,
            }
        )
    utilization = float(actual_total / planned_total * 100) if planned_total > 0 else 0.0

    goal_query = select(SavingsGoal).where(SavingsGoal.household_id == ctx.household_id, SavingsGoal.status != "archived")
    if view == "personal":
        goal_query = goal_query.where(SavingsGoal.owner_user_id == ctx.user.id)
    goals = db.execute(goal_query).scalars().all()
    goal_total = money(0)
    goal_target = money(0)
    for goal in goals:
        goal_total += money(sum((money(c.amount) for c in goal.contributions), start=money(0)))
        goal_target += money(goal.target_amount)

    loan_query = select(Loan).where(
        Loan.household_id == ctx.household_id,
        Loan.status == LOAN_ACTIVE,
        Loan.direction == LOAN_BORROWED,
    )
    loans = db.execute(loan_query).scalars().all()
    loan_outstanding = money(0)
    for loan in loans:
        repaid = money(sum((money(r.principal_component) for r in loan.repayments), start=money(0)))
        loan_outstanding += money(max(money(loan.principal_amount) - repaid, money(0)))

    unread = db.execute(
        select(Notification.id).where(
            Notification.household_id == ctx.household_id,
            Notification.is_read.is_(False),
            or_(Notification.user_id.is_(None), Notification.user_id == ctx.user.id),
        )
    ).all()

    recent_query = (
        select(Transaction)
        .where(
            Transaction.household_id == ctx.household_id,
            Transaction.status == STATUS_POSTED,
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
            scope_filter(ctx, view),
        )
        .options(*TX_LOAD_OPTIONS)
        .order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
        .limit(8)
    )
    recent = list(db.execute(recent_query).scalars())

    return DashboardOut(
        view=view,
        month=f"{year:04d}-{month_number:02d}",
        totals=DashboardTotals(
            total_income=totals["income"],
            total_expenses=totals["expenses"],
            remaining_cash_flow=money(totals["income"] - totals["expenses"]),
            total_savings_contributions=savings_contributions_in_period(db, ctx, start, end, view),
            total_account_balance=total_balance,
            budget_utilization_percent=round(utilization, 1),
            budget_planned=planned_total,
            budget_actual=actual_total,
            savings_goal_total=goal_total,
            savings_goal_target=goal_target,
            loan_outstanding=loan_outstanding,
            unread_notifications=len(unread),
        ),
        trend=build_trend(db, ctx, year, month_number, view),
        category_breakdown=build_category_breakdown(db, ctx, start, end, view),
        member_breakdown=build_member_breakdown(db, ctx, start, end, view),
        upcoming_payments=build_upcoming(db, ctx),
        recent_transactions=[transaction_out(txn, ctx) for txn in recent],
        active_budgets=budget_cards,
    )
