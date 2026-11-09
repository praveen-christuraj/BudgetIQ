"""Budget planning: planned vs actual, thresholds, carry-forward."""
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import (
    BUDGET_ACTIVE,
    SCOPE_SHARED,
    STATUS_POSTED,
    TXN_EXPENSE,
    money,
)
from app.core.deps import CurrentContext
from app.models.budget import Budget, BudgetAllocation
from app.models.transaction import Transaction
from app.schemas.finance import CategoryOut
from app.schemas.planning import AllocationOut, BudgetOut, BudgetSummary
from app.services.serializers import allocation_out, budget_out

BUDGET_LOAD = (
    selectinload(Budget.allocations).selectinload(BudgetAllocation.category),
    selectinload(Budget.owner),
)


def budget_expense_filter(budget: Budget):
    """Which transactions count towards a budget.

    * Family budget: every posted household expense in the period.
    * Member budget: expenses financially owned by that member (personal) plus
      shared expenses they recorded.
    """
    base = [
        Transaction.household_id == budget.household_id,
        Transaction.status == STATUS_POSTED,
        Transaction.transaction_type == TXN_EXPENSE,
        Transaction.transaction_date >= budget.start_date,
        Transaction.transaction_date <= budget.end_date,
    ]
    if budget.owner_user_id is None:
        return and_(*base)
    return and_(
        *base,
        or_(
            Transaction.owner_user_id == budget.owner_user_id,
            and_(Transaction.scope == SCOPE_SHARED, Transaction.created_by == budget.owner_user_id),
        ),
    )


def category_actuals(db: Session, budget: Budget) -> dict[uuid.UUID | None, Decimal]:
    query = (
        select(Transaction.category_id, Transaction.amount)
        .where(budget_expense_filter(budget))
    )
    totals: dict[uuid.UUID | None, Decimal] = {}
    for category_id, amount in db.execute(query).all():
        totals[category_id] = totals.get(category_id, money(0)) + money(amount)
    return totals


def thresholds(ctx: CurrentContext) -> tuple[Decimal, Decimal]:
    warning = money(ctx.settings.budget_warning_threshold if ctx.settings else 80)
    critical = money(ctx.settings.budget_critical_threshold if ctx.settings else 100)
    return warning, critical


def status_for(utilization: float, warning: Decimal, critical: Decimal) -> str:
    if utilization >= float(critical):
        return "critical"
    if utilization >= float(warning):
        return "warning"
    return "ok"


def build_budget_out(db: Session, ctx: CurrentContext, budget: Budget) -> BudgetSummary:
    actuals = category_actuals(db, budget)
    warning, critical = thresholds(ctx)
    allocations: list[AllocationOut] = []
    allocated_ids = set()

    for allocation in budget.allocations:
        planned = money(allocation.planned_amount) + money(allocation.carry_forward_amount)
        actual = money(actuals.get(allocation.category_id, money(0)))
        utilization = float(actual / planned * 100) if planned > 0 else (100.0 if actual > 0 else 0.0)
        allocations.append(
            allocation_out(allocation, actual, status_for(utilization, warning, critical), utilization)
        )
        allocated_ids.add(allocation.category_id)

    unbudgeted = money(
        sum((amount for cid, amount in actuals.items() if cid not in allocated_ids), start=money(0))
    )
    summary_budget = budget_out(
        budget, allocations, budget.owner.full_name if budget.owner else "Family"
    )
    if unbudgeted > 0:
        summary_budget = summary_budget.model_copy(
            update={
                "total_actual": money(summary_budget.total_actual + unbudgeted),
                "total_remaining": money(summary_budget.total_planned - summary_budget.total_actual),
            }
        )
        planned = summary_budget.total_planned
        summary_budget = summary_budget.model_copy(
            update={
                "utilization_percent": round(
                    float(summary_budget.total_actual / planned * 100) if planned > 0 else 0.0, 2
                )
            }
        )

    month_income = household_period_income(db, budget)
    return BudgetSummary(
        budget=summary_budget,
        unbudgeted_actual=unbudgeted,
        total_income=month_income,
        total_expenses=money(summary_budget.total_actual),
        warning_threshold=float(warning),
        critical_threshold=float(critical),
    )


def household_period_income(db: Session, budget: Budget) -> Decimal:
    query = select(Transaction.amount).where(
        Transaction.household_id == budget.household_id,
        Transaction.status == STATUS_POSTED,
        Transaction.transaction_type == "income",
        Transaction.transaction_date >= budget.start_date,
        Transaction.transaction_date <= budget.end_date,
    )
    if budget.owner_user_id:
        query = query.where(
            or_(
                Transaction.owner_user_id == budget.owner_user_id,
                Transaction.created_by == budget.owner_user_id,
            )
        )
    return money(sum((money(row[0]) for row in db.execute(query).all()), start=money(0)))


def previous_budget(db: Session, budget: Budget) -> Budget | None:
    query = (
        select(Budget)
        .where(
            Budget.household_id == budget.household_id,
            Budget.period_type == budget.period_type,
            Budget.end_date < budget.start_date,
            Budget.status == BUDGET_ACTIVE,
        )
        .options(*BUDGET_LOAD)
        .order_by(Budget.end_date.desc())
        .limit(5)
    )
    if budget.owner_user_id is None:
        query = query.where(Budget.owner_user_id.is_(None))
    else:
        query = query.where(Budget.owner_user_id == budget.owner_user_id)
    return db.execute(query).scalars().first()


def apply_carry_forward(db: Session, budget: Budget) -> Budget:
    """Roll unspent (positive) amounts from the previous matching budget into
    this one as carry-forward allocations."""
    previous = previous_budget(db, budget)
    if previous is None:
        return budget

    previous_actuals = category_actuals(db, previous)
    existing = {a.category_id: a for a in budget.allocations}

    for allocation in previous.allocations:
        planned = money(allocation.planned_amount) + money(allocation.carry_forward_amount)
        actual = money(previous_actuals.get(allocation.category_id, money(0)))
        remaining = money(planned - actual)
        if remaining <= 0:
            continue
        if allocation.category_id in existing:
            target = existing[allocation.category_id]
            target.carry_forward_amount = money(target.carry_forward_amount) + remaining
        else:
            target = BudgetAllocation(
                budget_id=budget.id,
                category_id=allocation.category_id,
                planned_amount=money(0),
                carry_forward_amount=remaining,
                note="Carried forward from previous period",
            )
            db.add(target)
    db.flush()
    return budget


def active_budgets_for_month(db: Session, household_id: uuid.UUID, on_date: date, owner_user_id: uuid.UUID | None = None) -> list[Budget]:
    query = select(Budget).where(
        Budget.household_id == household_id,
        Budget.status == BUDGET_ACTIVE,
        Budget.start_date <= on_date,
        Budget.end_date >= on_date,
    ).options(*BUDGET_LOAD)
    if owner_user_id:
        query = query.where(Budget.owner_user_id == owner_user_id)
    return list(db.execute(query).scalars())
