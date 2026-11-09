"""Notification generation and de-duplication.

Notifications are derived from current financial state each time they are
requested (and after relevant mutations), so they always reflect the latest
posted transactions without needing a background worker.
"""
import uuid
from datetime import date, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.constants import (
    LOAN_ACTIVE,
    NOTIF_BUDGET_EXCEEDED,
    NOTIF_BUDGET_WARNING,
    NOTIF_GOAL_ACHIEVED,
    NOTIF_LOAN_DUE,
    NOTIF_RECURRING_DUE,
    SEVERITY_CRITICAL,
    SEVERITY_SUCCESS,
    SEVERITY_WARNING,
    money,
)
from app.core.deps import CurrentContext
from app.models.loan import Loan
from app.models.notification import Notification
from app.models.savings import SavingsGoal
from app.services.budgets import active_budgets_for_month, build_budget_out
from app.services.recurring import upcoming_rules


def existing_keys(db: Session, household_id: uuid.UUID) -> set[str]:
    rows = db.execute(
        select(Notification.dedupe_key).where(Notification.household_id == household_id)
    ).all()
    return {row[0] for row in rows}


def add_notification(
    db: Session,
    *,
    household_id: uuid.UUID,
    dedupe_key: str,
    type: str,
    severity: str,
    title: str,
    message: str,
    user_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
) -> Notification | None:
    exists = db.execute(
        select(Notification.id).where(
            Notification.household_id == household_id, Notification.dedupe_key == dedupe_key
        )
    ).first()
    if exists:
        return None
    notification = Notification(
        household_id=household_id,
        user_id=user_id,
        type=type,
        severity=severity,
        title=title[:180],
        message=message,
        dedupe_key=dedupe_key[:200],
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(notification)
    return notification


def sync_notifications(db: Session, ctx: CurrentContext) -> int:
    """Create any notifications that current data warrants. Returns count."""
    today = date.today()
    lead_days = ctx.settings.notification_lead_days if ctx.settings else 7
    created = 0

    # --- budget thresholds -------------------------------------------------
    for budget in active_budgets_for_month(db, ctx.household_id, today):
        summary = build_budget_out(db, ctx, budget)
        if summary.budget.total_planned <= 0:
            continue
        utilization = summary.budget.utilization_percent
        period_key = f"{budget.start_date.isoformat()}"
        if utilization >= summary.critical_threshold:
            if add_notification(
                db,
                household_id=ctx.household_id,
                dedupe_key=f"budget-exceeded:{budget.id}:{period_key}",
                type=NOTIF_BUDGET_EXCEEDED,
                severity=SEVERITY_CRITICAL,
                title=f"Budget exceeded: {budget.name}",
                message=(
                    f"Spending has reached {utilization:.0f}% of the {budget.name} budget "
                    f"({summary.budget.total_actual} of {summary.budget.total_planned})."
                ),
                entity_type="budget",
                entity_id=budget.id,
            ):
                created += 1
        elif utilization >= summary.warning_threshold:
            if add_notification(
                db,
                household_id=ctx.household_id,
                dedupe_key=f"budget-warning:{budget.id}:{period_key}",
                type=NOTIF_BUDGET_WARNING,
                severity=SEVERITY_WARNING,
                title=f"Budget nearing its limit: {budget.name}",
                message=(
                    f"Spending has reached {utilization:.0f}% of the {budget.name} budget. "
                    "Review planned versus actual before the period ends."
                ),
                entity_type="budget",
                entity_id=budget.id,
            ):
                created += 1

    # --- upcoming recurring payments --------------------------------------
    for rule in upcoming_rules(db, ctx.household_id, within_days=lead_days):
        days = (rule.next_due_date - today).days
        if add_notification(
            db,
            household_id=ctx.household_id,
            dedupe_key=f"recurring-due:{rule.id}:{rule.next_due_date.isoformat()}",
            type=NOTIF_RECURRING_DUE,
            severity=SEVERITY_WARNING if days <= 3 else "info",
            title=f"Upcoming payment: {rule.name}",
            message=(
                f"{rule.name} of {money(rule.amount)} is due on {rule.next_due_date:%d %b %Y}"
                f" ({'today' if days == 0 else f'in {days} day(s)'})."
            ),
            entity_type="recurring_rule",
            entity_id=rule.id,
            user_id=rule.responsible_user_id,
        ):
            created += 1

    # --- loans due ---------------------------------------------------------
    loans = db.execute(
        select(Loan).where(Loan.household_id == ctx.household_id, Loan.status == LOAN_ACTIVE)
    ).scalars().all()
    for loan in loans:
        if not loan.due_date:
            continue
        days = (loan.due_date - today).days
        if days > lead_days:
            continue
        if add_notification(
            db,
            household_id=ctx.household_id,
            dedupe_key=f"loan-due:{loan.id}:{loan.due_date.isoformat()}",
            type=NOTIF_LOAN_DUE,
            severity=SEVERITY_CRITICAL if days < 0 else SEVERITY_WARNING,
            title=("Loan overdue" if days < 0 else "Loan repayment due") + f": {loan.counterparty}",
            message=(
                f"The {loan.direction} loan from {loan.counterparty} "
                f"({'was due' if days < 0 else 'is due'} on {loan.due_date:%d %b %Y})."
            ),
            entity_type="loan",
            entity_id=loan.id,
        ):
            created += 1

    # --- savings goals achieved -------------------------------------------
    goals = db.execute(
        select(SavingsGoal).where(
            SavingsGoal.household_id == ctx.household_id,
            SavingsGoal.status.in_(("active", "achieved")),
        )
    ).scalars().all()
    for goal in goals:
        current = money(sum((money(c.amount) for c in goal.contributions), start=money(0)))
        if current >= money(goal.target_amount):
            if add_notification(
                db,
                household_id=ctx.household_id,
                dedupe_key=f"goal-achieved:{goal.id}",
                type=NOTIF_GOAL_ACHIEVED,
                severity=SEVERITY_SUCCESS,
                title=f"Savings goal achieved: {goal.name}",
                message=f"You reached the {goal.name} target of {money(goal.target_amount)}.",
                entity_type="savings_goal",
                entity_id=goal.id,
            ):
                created += 1

    db.flush()
    return created


def visible_notifications_filter(ctx: CurrentContext):
    from app.models.notification import Notification

    return or_(Notification.user_id.is_(None), Notification.user_id == ctx.user.id)
