"""Transaction business rules: authorisation, validation, duplicates, reversal."""
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import (
    SCOPE_PERSONAL,
    SCOPE_SHARED,
    STATUS_DRAFT,
    STATUS_POSTED,
    STATUS_REVERSED,
    TXN_EXPENSE,
    money,
)
from app.core.deps import CurrentContext
from app.core.errors import bad_request, forbidden, not_found
from app.models.account import Account
from app.models.category import Category, Subcategory
from app.models.household import HouseholdMember, User
from app.models.transaction import Transaction
from app.permissions.rbac import can_edit_transaction, is_admin
from app.schemas.finance import TransactionCreate, TransactionUpdate
from app.services.audit import log_event, snapshot

AUDIT_FIELDS = [
    "transaction_type",
    "scope",
    "amount",
    "transaction_date",
    "description",
    "account_id",
    "category_id",
    "subcategory_id",
    "owner_user_id",
    "payment_method",
    "notes",
    "status",
]

TX_LOAD_OPTIONS = (
    selectinload(Transaction.account),
    selectinload(Transaction.category),
    selectinload(Transaction.subcategory),
    selectinload(Transaction.owner),
    selectinload(Transaction.created_by_user),
    selectinload(Transaction.attachments),
)


def active_membership(db: Session, household_id: uuid.UUID, user_id: uuid.UUID):
    return db.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user_id,
            HouseholdMember.is_active.is_(True),
        )
    ).scalar_one_or_none()


def get_visible_account(db: Session, ctx: CurrentContext, account_id: uuid.UUID) -> Account:
    account = db.get(Account, account_id)
    if account is None or account.household_id != ctx.household_id:
        raise not_found("Account")
    if not is_admin(ctx) and account.owner_user_id not in (None, ctx.user.id):
        raise forbidden("You cannot use another member's personal account")
    return account


def get_transaction(db: Session, ctx: CurrentContext, transaction_id: uuid.UUID, *, with_links: bool = True) -> Transaction:
    query = select(Transaction).where(
        Transaction.id == transaction_id, Transaction.household_id == ctx.household_id
    )
    if with_links:
        query = query.options(*TX_LOAD_OPTIONS)
    txn = db.execute(query).scalar_one_or_none()
    if txn is None:
        raise not_found("Transaction")
    return txn


def _validate_category(db: Session, ctx: CurrentContext, category_id, subcategory_id, txn_type: str):
    if category_id:
        category = db.get(Category, category_id)
        if category is None or category.household_id != ctx.household_id:
            raise not_found("Category")
        if category.kind != txn_type:
            raise bad_request(
                f"Category '{category.name}' is an {category.kind} category and cannot be used "
                f"for a {txn_type} transaction"
            )
        if not category.is_active:
            raise bad_request("The selected category is inactive")
    if subcategory_id:
        subcategory = db.get(Subcategory, subcategory_id)
        if subcategory is None:
            raise not_found("Subcategory")
        if category_id and subcategory.category_id != category_id:
            raise bad_request("Subcategory does not belong to the selected category")


def resolve_owner(db: Session, ctx: CurrentContext, scope: str, requested_owner_id) -> uuid.UUID | None:
    """Scope and owner are independent of the account used to pay.

    Members can only create personal records for themselves. Administrators may
    create/assign personal records to any member of the household.
    """
    if scope == SCOPE_SHARED:
        return None
    owner_id = requested_owner_id or ctx.user.id
    if owner_id != ctx.user.id and not is_admin(ctx):
        raise forbidden("Members can only create personal transactions for themselves")
    if active_membership(db, ctx.household_id, owner_id) is None:
        raise bad_request("Owner must be an active member of this household")
    return owner_id


def detect_duplicates(
    db: Session,
    ctx: CurrentContext,
    *,
    amount: Decimal,
    txn_date: date,
    account_id: uuid.UUID,
    transaction_type: str,
    exclude_id: uuid.UUID | None = None,
    description: str | None = None,
) -> list[Transaction]:
    """Flag possible duplicates: same type/amount/account within one day."""
    query = (
        select(Transaction)
        .where(
            Transaction.household_id == ctx.household_id,
            Transaction.status == STATUS_POSTED,
            Transaction.transaction_type == transaction_type,
            Transaction.account_id == account_id,
            Transaction.amount == amount,
            Transaction.transaction_date >= txn_date - timedelta(days=1),
            Transaction.transaction_date <= txn_date + timedelta(days=1),
        )
        .options(*TX_LOAD_OPTIONS)
        .limit(5)
    )
    if exclude_id:
        query = query.where(Transaction.id != exclude_id)
    return list(db.execute(query).scalars())


def create_transaction(db: Session, ctx: CurrentContext, payload: TransactionCreate, ip: str | None = None) -> tuple[Transaction, list[Transaction]]:
    account = get_visible_account(db, ctx, payload.account_id)
    if not account.is_active:
        raise bad_request("The selected account is inactive")

    _validate_category(db, ctx, payload.category_id, payload.subcategory_id, payload.transaction_type)
    owner_id = resolve_owner(db, ctx, payload.scope, payload.owner_user_id)
    amount = money(payload.amount)
    if amount <= 0:
        raise bad_request("Amount must be greater than zero")

    if payload.duplicate_of_id:
        existing = db.get(Transaction, payload.duplicate_of_id)
        if existing is None or existing.household_id != ctx.household_id:
            raise not_found("Transaction")

    warnings = detect_duplicates(
        db,
        ctx,
        amount=amount,
        txn_date=payload.transaction_date,
        account_id=payload.account_id,
        transaction_type=payload.transaction_type,
        description=payload.description,
    ) if not payload.duplicate_of_id else []

    txn = Transaction(
        household_id=ctx.household_id,
        account_id=payload.account_id,
        created_by=ctx.user.id,
        owner_user_id=owner_id,
        transaction_type=payload.transaction_type,
        scope=payload.scope,
        status=payload.status,
        category_id=payload.category_id,
        subcategory_id=payload.subcategory_id,
        amount=amount,
        currency=account.currency or (ctx.settings.currency if ctx.settings else "INR"),
        transaction_date=payload.transaction_date,
        description=payload.description.strip(),
        notes=payload.notes,
        payment_method=payload.payment_method,
        duplicate_of_id=payload.duplicate_of_id,
    )
    db.add(txn)
    db.flush()

    log_event(
        db,
        ctx,
        action="transaction.create",
        entity_type="transaction",
        entity_id=txn.id,
        summary=f"Created {txn.transaction_type} '{txn.description}' of {amount}",
        after=snapshot(txn, AUDIT_FIELDS),
        ip_address=ip,
    )
    return txn, warnings


def update_transaction(db: Session, ctx: CurrentContext, transaction_id: uuid.UUID, payload: TransactionUpdate, ip: str | None = None) -> Transaction:
    txn = get_transaction(db, ctx, transaction_id)
    if txn.status == STATUS_REVERSED:
        raise bad_request("Reversed transactions cannot be edited")
    if not can_edit_transaction(ctx, txn):
        raise forbidden("You are not allowed to modify this transaction")

    before = snapshot(txn, AUDIT_FIELDS)
    data = payload.model_dump(exclude_unset=True)

    new_type = data.get("transaction_type", txn.transaction_type)
    new_scope = data.get("scope", txn.scope)
    new_account_id = data.get("account_id", txn.account_id)
    new_category_id = data.get("category_id", txn.category_id)
    new_subcategory_id = data.get("subcategory_id", txn.subcategory_id)

    if new_account_id != txn.account_id or "account_id" in data:
        account = get_visible_account(db, ctx, new_account_id)
        if not account.is_active:
            raise bad_request("The selected account is inactive")

    if "category_id" in data or "subcategory_id" in data or "transaction_type" in data:
        _validate_category(db, ctx, new_category_id, new_subcategory_id, new_type)

    if new_scope != txn.scope or "owner_user_id" in data:
        owner_id = resolve_owner(db, ctx, new_scope, data.get("owner_user_id", txn.owner_user_id))
        txn.owner_user_id = owner_id
    elif new_scope == SCOPE_SHARED:
        txn.owner_user_id = None

    if "amount" in data:
        amount = money(data["amount"])
        if amount <= 0:
            raise bad_request("Amount must be greater than zero")
        txn.amount = amount

    for field in (
        "transaction_type",
        "scope",
        "transaction_date",
        "description",
        "category_id",
        "subcategory_id",
        "payment_method",
        "notes",
        "status",
    ):
        if field in data:
            setattr(txn, field, data[field])

    txn.account_id = new_account_id
    db.flush()

    log_event(
        db,
        ctx,
        action="transaction.update",
        entity_type="transaction",
        entity_id=txn.id,
        summary=f"Updated {txn.transaction_type} '{txn.description}'",
        before=before,
        after=snapshot(txn, AUDIT_FIELDS),
        ip_address=ip,
    )
    return txn


def reverse_transaction(db: Session, ctx: CurrentContext, transaction_id: uuid.UUID, reason: str, ip: str | None = None) -> Transaction:
    """Soft delete: the record stays, status becomes reversed and the derived
    account balance / report totals are restored automatically."""
    txn = get_transaction(db, ctx, transaction_id)
    if txn.status == STATUS_REVERSED:
        raise bad_request("Transaction is already reversed")
    if not can_edit_transaction(ctx, txn):
        raise forbidden("You are not allowed to reverse this transaction")

    before = snapshot(txn, AUDIT_FIELDS)
    from app.models.base import utcnow

    txn.status = STATUS_REVERSED
    txn.reversed_at = utcnow()
    txn.reversed_by = ctx.user.id
    txn.reversal_reason = reason
    db.flush()

    log_event(
        db,
        ctx,
        action="transaction.reverse",
        entity_type="transaction",
        entity_id=txn.id,
        summary=f"Reversed {txn.transaction_type} '{txn.description}' ({reason})",
        before=before,
        after=snapshot(txn, AUDIT_FIELDS) | {"reversal_reason": reason},
        ip_address=ip,
    )
    return txn


def list_transactions(
    db: Session,
    ctx: CurrentContext,
    *,
    visibility,
    q: str | None = None,
    transaction_type: str | None = None,
    scope: str | None = None,
    status: str | None = None,
    member_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    min_amount: Decimal | None = None,
    max_amount: Decimal | None = None,
    page: int = 1,
    page_size: int = 25,
    sort: str = "date_desc",
):
    from sqlalchemy import func

    filters = [visibility]
    if q:
        like = f"%{q.strip()}%"
        filters.append(
            or_(
                Transaction.description.ilike(like),
                Transaction.notes.ilike(like),
            )
        )
    if transaction_type:
        filters.append(Transaction.transaction_type == transaction_type)
    if scope:
        filters.append(Transaction.scope == scope)
    if status:
        filters.append(Transaction.status == status)
    else:
        filters.append(Transaction.status != STATUS_REVERSED)
    if member_id:
        filters.append(
            or_(
                Transaction.owner_user_id == member_id,
                and_(Transaction.scope == SCOPE_SHARED, Transaction.created_by == member_id),
            )
        )
    if account_id:
        filters.append(Transaction.account_id == account_id)
    if category_id:
        filters.append(Transaction.category_id == category_id)
    if date_from:
        filters.append(Transaction.transaction_date >= date_from)
    if date_to:
        filters.append(Transaction.transaction_date <= date_to)
    if min_amount is not None:
        filters.append(Transaction.amount >= money(min_amount))
    if max_amount is not None:
        filters.append(Transaction.amount <= money(max_amount))

    count_query = select(func.count()).select_from(Transaction).where(*filters)
    total = db.execute(count_query).scalar_one()

    order = {
        "date_desc": (Transaction.transaction_date.desc(), Transaction.created_at.desc()),
        "date_asc": (Transaction.transaction_date.asc(), Transaction.created_at.asc()),
        "amount_desc": (Transaction.amount.desc(),),
        "amount_asc": (Transaction.amount.asc(),),
    }.get(sort, (Transaction.transaction_date.desc(), Transaction.created_at.desc()))

    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    items = db.execute(
        select(Transaction)
        .where(*filters)
        .options(*TX_LOAD_OPTIONS)
        .order_by(*order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()

    return list(items), total, page, page_size
