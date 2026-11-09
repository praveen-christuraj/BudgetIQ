"""Convert ORM objects into API schemas with derived/display fields."""
from decimal import Decimal

from app.permissions.rbac import can_edit_transaction
from app.schemas.finance import (
    AccountOut,
    AttachmentOut,
    TransactionOut,
    TransferOut,
)
from app.schemas.planning import (
    AllocationOut,
    BudgetOut,
    ContributionOut,
    GoalOut,
    LoanOut,
    RecurringOut,
    RepaymentOut,
)
from app.core.constants import money


def account_out(account, metrics: dict | None = None) -> AccountOut:
    data = AccountOut.model_validate(account)
    metrics = metrics or {}
    return data.model_copy(
        update={
            "owner_name": account.owner.full_name if account.owner else None,
            "is_shared": account.owner_user_id is None,
            "current_balance": metrics.get("current_balance", money(account.opening_balance)),
        }
    )


def transaction_out(txn, ctx=None) -> TransactionOut:
    data = TransactionOut.model_validate(txn)
    return data.model_copy(
        update={
            "account_name": txn.account.name if txn.account else None,
            "category_name": txn.category.name if txn.category else None,
            "subcategory_name": txn.subcategory.name if txn.subcategory else None,
            "owner_name": txn.owner.full_name if txn.owner else "Household",
            "created_by_name": txn.created_by_user.full_name if txn.created_by_user else None,
            "is_editable": can_edit_transaction(ctx, txn) if ctx else False,
            "attachments": [AttachmentOut.model_validate(a) for a in txn.attachments],
        }
    )


def transfer_out(transfer) -> TransferOut:
    data = TransferOut.model_validate(transfer)
    return data.model_copy(
        update={
            "from_account_name": transfer.from_account.name if transfer.from_account else None,
            "to_account_name": transfer.to_account.name if transfer.to_account else None,
            "created_by_name": transfer.created_by_user.full_name if transfer.created_by_user else None,
        }
    )


def allocation_out(allocation, actual: Decimal, status: str, utilization: float) -> AllocationOut:
    planned = money(allocation.planned_amount) + money(allocation.carry_forward_amount)
    return AllocationOut(
        id=allocation.id,
        category_id=allocation.category_id,
        category_name=allocation.category.name if allocation.category else "Uncategorised",
        category_color=allocation.category.color if allocation.category else "#607d8b",
        planned_amount=planned,
        carry_forward_amount=money(allocation.carry_forward_amount),
        actual_amount=money(actual),
        remaining_amount=money(planned - actual),
        utilization_percent=round(utilization, 2),
        status=status,
        note=allocation.note,
    )


def budget_out(budget, allocations: list[AllocationOut], owner_name: str | None) -> BudgetOut:
    total_planned = sum((a.planned_amount for a in allocations), start=money(0))
    total_actual = sum((a.actual_amount for a in allocations), start=money(0))
    total_remaining = money(total_planned - total_actual)
    utilization = float(total_actual / total_planned * 100) if total_planned > 0 else 0.0
    return BudgetOut(
        id=budget.id,
        name=budget.name,
        period_type=budget.period_type,
        start_date=budget.start_date,
        end_date=budget.end_date,
        owner_user_id=budget.owner_user_id,
        owner_name=owner_name,
        is_family_budget=budget.owner_user_id is None,
        carry_forward=budget.carry_forward,
        status=budget.status,
        notes=budget.notes,
        total_planned=total_planned,
        total_actual=total_actual,
        total_remaining=total_remaining,
        utilization_percent=round(utilization, 2),
        allocations=allocations,
        created_at=budget.created_at,
    )


def recurring_out(rule, days_until_due: int | None = None) -> RecurringOut:
    return RecurringOut(
        id=rule.id,
        name=rule.name,
        transaction_type=rule.transaction_type,
        scope=rule.scope,
        owner_user_id=rule.owner_user_id,
        owner_name=rule.owner.full_name if rule.owner else None,
        category_id=rule.category_id,
        category_name=rule.category.name if rule.category else None,
        account_id=rule.account_id,
        account_name=rule.account.name if rule.account else None,
        responsible_user_id=rule.responsible_user_id,
        responsible_name=rule.responsible.full_name if rule.responsible else None,
        amount=money(rule.amount),
        frequency=rule.frequency,
        start_date=rule.start_date,
        end_date=rule.end_date,
        next_due_date=rule.next_due_date,
        payment_method=rule.payment_method,
        description=rule.description,
        notes=rule.notes,
        is_active=rule.is_active,
        days_until_due=days_until_due,
        created_at=rule.created_at,
    )


def contribution_out(contribution) -> ContributionOut:
    data = ContributionOut.model_validate(contribution)
    return data.model_copy(
        update={
            "account_name": contribution.account.name if contribution.account else None,
            "created_by_name": contribution.creator.full_name if contribution.creator else None,
        }
    )


def goal_out(goal) -> GoalOut:
    current = sum((money(c.amount) for c in goal.contributions), start=money(0))
    target = money(goal.target_amount)
    progress = float(current / target * 100) if target > 0 else 0.0
    return GoalOut(
        id=goal.id,
        name=goal.name,
        target_amount=target,
        current_amount=current,
        remaining_amount=money(max(target - current, Decimal("0.00"))),
        progress_percent=round(min(progress, 100.0), 2),
        target_date=goal.target_date,
        owner_user_id=goal.owner_user_id,
        owner_name=goal.owner.full_name if goal.owner else None,
        is_shared=goal.owner_user_id is None,
        account_id=goal.account_id,
        account_name=goal.account.name if goal.account else None,
        status=goal.status,
        notes=goal.notes,
        contributions=[contribution_out(c) for c in goal.contributions],
        created_at=goal.created_at,
    )


def repayment_out(repayment) -> RepaymentOut:
    data = RepaymentOut.model_validate(repayment)
    return data.model_copy(
        update={
            "account_name": repayment.account.name if repayment.account else None,
            "created_by_name": repayment.creator.full_name if repayment.creator else None,
        }
    )


def loan_out(loan) -> LoanOut:
    principal = money(loan.principal_amount)
    principal_repaid = money(sum((money(r.principal_component) for r in loan.repayments), start=money(0)))
    interest_paid = money(sum((money(r.interest_component) for r in loan.repayments), start=money(0)))
    total_repaid = money(sum((money(r.amount) for r in loan.repayments), start=money(0)))
    outstanding = money(max(principal - principal_repaid, Decimal("0.00")))
    progress = float(principal_repaid / principal * 100) if principal > 0 else 0.0
    from datetime import date as _date

    overdue = bool(loan.due_date and loan.due_date < _date.today() and outstanding > 0)
    return LoanOut(
        id=loan.id,
        direction=loan.direction,
        counterparty=loan.counterparty,
        principal_amount=principal,
        interest_rate=loan.interest_rate,
        start_date=loan.start_date,
        due_date=loan.due_date,
        account_id=loan.account_id,
        status=loan.status,
        notes=loan.notes,
        total_repaid=total_repaid,
        principal_repaid=principal_repaid,
        interest_paid=interest_paid,
        outstanding_balance=outstanding,
        repayment_progress_percent=round(min(progress, 100.0), 2),
        is_overdue=overdue,
        repayments=[repayment_out(r) for r in loan.repayments],
        created_at=loan.created_at,
    )
