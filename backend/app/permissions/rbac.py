"""Role based access rules and household-scoped query filters.

The rules mirror RBAC_PERMISSION_MATRIX.md:

* Administrator: full household access, including members' personal records.
* Member: shared records, own personal records and records they created.
* Nobody can read or write another household's data (enforced by the
  household_id filter applied in every query).
"""
import uuid

from sqlalchemy import and_, or_

from app.core.constants import ROLE_ADMIN, SCOPE_SHARED, STATUS_REVERSED
from app.core.errors import forbidden
from app.core.deps import CurrentContext
from app.models.transaction import Transaction


def is_admin(ctx: CurrentContext) -> bool:
    return ctx.role == ROLE_ADMIN


def transaction_visibility_filter(ctx: CurrentContext):
    """SQLAlchemy filter limiting transactions to what the caller may see."""
    if is_admin(ctx):
        return Transaction.household_id == ctx.household_id
    return and_(
        Transaction.household_id == ctx.household_id,
        or_(
            Transaction.scope == SCOPE_SHARED,
            Transaction.owner_user_id == ctx.user.id,
            Transaction.created_by == ctx.user.id,
        ),
    )


def can_view_transaction(ctx: CurrentContext, txn: Transaction) -> bool:
    if txn.household_id != ctx.household_id:
        return False
    if is_admin(ctx):
        return True
    return (
        txn.scope == SCOPE_SHARED
        or txn.owner_user_id == ctx.user.id
        or txn.created_by == ctx.user.id
    )


def can_edit_transaction(ctx: CurrentContext, txn: Transaction) -> bool:
    if txn.household_id != ctx.household_id:
        return False
    if txn.status == STATUS_REVERSED:
        return False
    if is_admin(ctx):
        return True
    # A member may modify records they created, but never another member's
    # personal record.
    return txn.created_by == ctx.user.id


def assert_can_view_transaction(ctx: CurrentContext, txn: Transaction) -> None:
    if not can_view_transaction(ctx, txn):
        raise forbidden("You are not allowed to view this transaction")


def assert_can_edit_transaction(ctx: CurrentContext, txn: Transaction) -> None:
    if not can_edit_transaction(ctx, txn):
        raise forbidden("You are not allowed to modify this transaction")


def can_view_account(ctx: CurrentContext, account) -> bool:
    if account.household_id != ctx.household_id:
        return False
    return is_admin(ctx) or account.owner_user_id in (None, ctx.user.id)


def can_manage_account(ctx: CurrentContext, account=None) -> bool:
    if account is None:
        return is_admin(ctx)
    return is_admin(ctx) or account.owner_user_id == ctx.user.id


def member_scope_filter(ctx: CurrentContext, owner_column, creator_column):
    """Filter rows that belong to the caller's visible financial scope."""
    if is_admin(ctx):
        return owner_column.isnot(None) | owner_column.is_(None)
    return or_(
        owner_column.is_(None),
        owner_column == ctx.user.id,
        creator_column == ctx.user.id,
    )


def parse_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None
