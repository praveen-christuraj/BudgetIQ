"""Account balance derivation.

Balances are never stored as a mutable column: they are derived from the
opening balance plus posted financial entries (transactions and transfers).
Reversed records are excluded, which restores the balance automatically.
"""
import uuid
from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.constants import (
    CENTS,
    SCOPE_SHARED,
    STATUS_POSTED,
    TXN_EXPENSE,
    TXN_INCOME,
    money,
)
from app.models.account import Account
from app.models.transaction import Transaction, Transfer


def account_flow(
    db: Session,
    account_ids: list[uuid.UUID],
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[uuid.UUID, dict]:
    """Return income/expense/transfer totals per account for posted records."""
    result = {
        account_id: {
            "income": money(0),
            "expenses": money(0),
            "transfers_in": money(0),
            "transfers_out": money(0),
        }
        for account_id in account_ids
    }
    if not account_ids:
        return result

    income_case = case((Transaction.transaction_type == TXN_INCOME, Transaction.amount), else_=0)
    expense_case = case((Transaction.transaction_type == TXN_EXPENSE, Transaction.amount), else_=0)

    query = (
        select(
            Transaction.account_id,
            func.coalesce(func.sum(income_case), 0),
            func.coalesce(func.sum(expense_case), 0),
        )
        .where(Transaction.account_id.in_(account_ids), Transaction.status == STATUS_POSTED)
        .group_by(Transaction.account_id)
    )
    if date_from:
        query = query.where(Transaction.transaction_date >= date_from)
    if date_to:
        query = query.where(Transaction.transaction_date <= date_to)

    for account_id, income, expenses in db.execute(query).all():
        bucket = result.get(account_id)
        if bucket:
            bucket["income"] = money(income)
            bucket["expenses"] = money(expenses)

    transfer_query = select(Transfer).where(
        Transfer.status == STATUS_POSTED,
        (Transfer.from_account_id.in_(account_ids) | Transfer.to_account_id.in_(account_ids)),
    )
    if date_from:
        transfer_query = transfer_query.where(Transfer.transfer_date >= date_from)
    if date_to:
        transfer_query = transfer_query.where(Transfer.transfer_date <= date_to)

    for transfer in db.execute(transfer_query).scalars():
        if transfer.from_account_id in result:
            result[transfer.from_account_id]["transfers_out"] += money(transfer.amount)
        if transfer.to_account_id in result:
            result[transfer.to_account_id]["transfers_in"] += money(transfer.amount)

    return result


def account_balance(account: Account, flow: dict) -> "object":
    return money(
        money(account.opening_balance)
        + flow["income"]
        + flow["transfers_in"]
        - flow["expenses"]
        - flow["transfers_out"]
    )


def balance_map(db: Session, accounts: list[Account]) -> dict[uuid.UUID, dict]:
    """Flow + derived balance for each account."""
    ids = [a.id for a in accounts]
    flows = account_flow(db, ids)
    output = {}
    for account in accounts:
        flow = flows.get(account.id, {"income": money(0), "expenses": money(0), "transfers_in": money(0), "transfers_out": money(0)})
        output[account.id] = {**flow, "current_balance": account_balance(account, flow)}
    return output


def total_household_balance(db: Session, household_id: uuid.UUID) -> "object":
    accounts = db.execute(
        select(Account).where(Account.household_id == household_id, Account.is_active.is_(True))
    ).scalars().all()
    balances = balance_map(db, list(accounts))
    return money(sum((b["current_balance"] for b in balances.values()), start=money(0)))


def visible_account_ids(db: Session, household_id: uuid.UUID, user_id: uuid.UUID, is_admin: bool) -> list[uuid.UUID]:
    query = select(Account.id).where(Account.household_id == household_id)
    if not is_admin:
        query = query.where((Account.owner_user_id.is_(None)) | (Account.owner_user_id == user_id))
    return [row[0] for row in db.execute(query).all()]


def is_shared_account(account: Account) -> bool:
    return account.owner_user_id is None


__all__ = [
    "account_flow",
    "account_balance",
    "balance_map",
    "total_household_balance",
    "visible_account_ids",
    "is_shared_account",
    "SCOPE_SHARED",
    "CENTS",
]
