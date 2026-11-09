"""Recurring payment scheduling.

Due rules produce *draft* transactions for the family to review - the system
never silently marks a bill as paid.
"""
import calendar
import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import (
    NOTIF_RECURRING_DUE,
    SCOPE_SHARED,
    SEVERITY_WARNING,
    STATUS_DRAFT,
)
from app.core.deps import CurrentContext
from app.models.recurring import RecurringRule
from app.models.transaction import Transaction
from app.models.base import utcnow
from app.services.audit import log_event


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def advance_due_date(current: date, frequency: str) -> date:
    if frequency == "daily":
        return current + timedelta(days=1)
    if frequency == "weekly":
        return current + timedelta(days=7)
    if frequency == "monthly":
        return add_months(current, 1)
    if frequency == "quarterly":
        return add_months(current, 3)
    if frequency == "yearly":
        return add_months(current, 12)
    return add_months(current, 1)


def generate_draft(db: Session, ctx: CurrentContext, rule: RecurringRule) -> Transaction | None:
    """Create one draft transaction for the rule's current due date."""
    if rule.end_date and rule.next_due_date > rule.end_date:
        rule.is_active = False
        return None

    existing = db.execute(
        select(Transaction).where(
            Transaction.household_id == rule.household_id,
            Transaction.account_id == rule.account_id,
            Transaction.transaction_date == rule.next_due_date,
            Transaction.description == (rule.description or rule.name),
            Transaction.status == STATUS_DRAFT,
        )
    ).scalars().first()
    if existing is not None:
        rule.next_due_date = advance_due_date(rule.next_due_date, rule.frequency)
        return None

    txn = Transaction(
        household_id=rule.household_id,
        account_id=rule.account_id,
        created_by=ctx.user.id if ctx else rule.created_by,
        owner_user_id=rule.owner_user_id,
        transaction_type=rule.transaction_type,
        scope=rule.scope,
        status=STATUS_DRAFT,
        category_id=rule.category_id,
        amount=rule.amount,
        transaction_date=rule.next_due_date,
        description=(rule.description or rule.name)[:255],
        notes=f"Auto-generated draft from recurring rule '{rule.name}'",
        payment_method=rule.payment_method,
    )
    db.add(txn)
    rule.next_due_date = advance_due_date(rule.next_due_date, rule.frequency)
    rule.last_generated_at = utcnow()
    db.flush()
    log_event(
        db,
        ctx,
        action="recurring.generate",
        entity_type="recurring_rule",
        entity_id=rule.id,
        summary=f"Draft generated for '{rule.name}' on {txn.transaction_date}",
        after={"transaction_id": str(txn.id), "amount": str(rule.amount)},
    )
    return txn


def due_rules(db: Session, household_id: uuid.UUID, on_or_before: date) -> list[RecurringRule]:
    return list(
        db.execute(
            select(RecurringRule)
            .where(
                RecurringRule.household_id == household_id,
                RecurringRule.is_active.is_(True),
                RecurringRule.next_due_date <= on_or_before,
            )
            .options(
                selectinload(RecurringRule.account),
                selectinload(RecurringRule.category),
                selectinload(RecurringRule.responsible),
                selectinload(RecurringRule.owner),
            )
            .order_by(RecurringRule.next_due_date)
        ).scalars()
    )


def upcoming_rules(db: Session, household_id: uuid.UUID, within_days: int = 30) -> list[RecurringRule]:
    today = date.today()
    return list(
        db.execute(
            select(RecurringRule)
            .where(
                RecurringRule.household_id == household_id,
                RecurringRule.is_active.is_(True),
                RecurringRule.next_due_date >= today,
                RecurringRule.next_due_date <= today + timedelta(days=within_days),
            )
            .options(
                selectinload(RecurringRule.account),
                selectinload(RecurringRule.category),
                selectinload(RecurringRule.responsible),
                selectinload(RecurringRule.owner),
            )
            .order_by(RecurringRule.next_due_date)
        ).scalars()
    )
