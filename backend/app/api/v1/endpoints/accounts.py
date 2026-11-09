"""Financial account management with derived balances."""
import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.constants import ACCOUNT_TYPES, money
from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context
from app.core.errors import bad_request, forbidden, not_found
from app.models.account import Account
from app.models.transaction import Transaction, Transfer
from app.permissions.rbac import can_manage_account, is_admin
from app.schemas.common import Message
from app.schemas.finance import AccountCreate, AccountOut, AccountUpdate
from app.services.accounts import balance_map
from app.services.audit import log_event

router = APIRouter(prefix="/accounts", tags=["Accounts"])

AUDIT_FIELDS = ["name", "account_type", "owner_user_id", "opening_balance", "is_active", "institution"]


@router.get("", response_model=list[AccountOut])
def list_accounts(
    include_inactive: bool = False,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    query = select(Account).where(Account.household_id == ctx.household_id)
    if not is_admin(ctx):
        query = query.where(or_(Account.owner_user_id.is_(None), Account.owner_user_id == ctx.user.id))
    if not include_inactive:
        query = query.where(Account.is_active.is_(True))
    accounts = list(db.execute(query.order_by(Account.created_at)).scalars())
    balances = balance_map(db, accounts)
    from app.services.serializers import account_out

    return [account_out(account, balances[account.id]) for account in accounts]


@router.get("/{account_id}", response_model=AccountOut)
def get_account(account_id: uuid.UUID, ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if account is None or account.household_id != ctx.household_id:
        raise not_found("Account")
    if not is_admin(ctx) and account.owner_user_id not in (None, ctx.user.id):
        raise forbidden("This account belongs to another member")
    balances = balance_map(db, [account])
    from app.services.serializers import account_out

    return account_out(account, balances[account.id])


@router.post("", response_model=AccountOut, status_code=201)
def create_account(
    payload: AccountCreate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    if payload.account_type not in ACCOUNT_TYPES:
        raise bad_request(f"Account type must be one of: {', '.join(ACCOUNT_TYPES)}")
    if payload.owner_user_id and not is_admin(ctx) and payload.owner_user_id != ctx.user.id:
        raise forbidden("Members can only create personal accounts for themselves")
    if payload.owner_user_id is None and not is_admin(ctx):
        raise forbidden("Only an administrator can create shared household accounts")

    from app.services.transactions import active_membership

    if payload.owner_user_id and active_membership(db, ctx.household_id, payload.owner_user_id) is None:
        raise bad_request("Account owner must be an active household member")

    account = Account(
        household_id=ctx.household_id,
        owner_user_id=payload.owner_user_id,
        name=payload.name.strip(),
        account_type=payload.account_type,
        institution=payload.institution,
        account_number_last4=payload.account_number_last4,
        opening_balance=money(payload.opening_balance),
        notes=payload.notes,
    )
    db.add(account)
    db.flush()
    log_event(
        db,
        ctx,
        action="account.create",
        entity_type="account",
        entity_id=account.id,
        summary=f"Created account '{account.name}' ({account.account_type})",
        after={"name": account.name, "type": account.account_type, "opening_balance": str(account.opening_balance)},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(account)
    balances = balance_map(db, [account])
    from app.services.serializers import account_out

    return account_out(account, balances[account.id])


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: uuid.UUID,
    payload: AccountUpdate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    account = db.get(Account, account_id)
    if account is None or account.household_id != ctx.household_id:
        raise not_found("Account")
    if not can_manage_account(ctx, account):
        raise forbidden("You do not have permission to modify this account")

    data = payload.model_dump(exclude_unset=True)
    before = {field: str(getattr(account, field)) for field in AUDIT_FIELDS}

    if "account_type" in data and data["account_type"] not in ACCOUNT_TYPES:
        raise bad_request(f"Account type must be one of: {', '.join(ACCOUNT_TYPES)}")
    if "owner_user_id" in data and data["owner_user_id"] != account.owner_user_id:
        if not is_admin(ctx):
            raise forbidden("Only an administrator can change account ownership")
        if data["owner_user_id"] is not None:
            from app.services.transactions import active_membership

            if active_membership(db, ctx.household_id, data["owner_user_id"]) is None:
                raise bad_request("Account owner must be an active household member")

    for field, value in data.items():
        if field == "opening_balance":
            setattr(account, field, money(value))
        else:
            setattr(account, field, value)

    log_event(
        db,
        ctx,
        action="account.update",
        entity_type="account",
        entity_id=account.id,
        summary=f"Updated account '{account.name}'",
        before=before,
        after={field: str(getattr(account, field)) for field in AUDIT_FIELDS},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(account)
    balances = balance_map(db, [account])
    from app.services.serializers import account_out

    return account_out(account, balances[account.id])


@router.delete("/{account_id}", response_model=Message)
def delete_account(
    account_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    account = db.get(Account, account_id)
    if account is None or account.household_id != ctx.household_id:
        raise not_found("Account")
    if not can_manage_account(ctx, account):
        raise forbidden("You do not have permission to delete this account")

    used = db.execute(
        select(func.count()).select_from(Transaction).where(Transaction.account_id == account.id)
    ).scalar_one()
    transfers = db.execute(
        select(func.count()).select_from(Transfer).where(
            or_(Transfer.from_account_id == account.id, Transfer.to_account_id == account.id)
        )
    ).scalar_one()

    if used or transfers:
        account.is_active = False
        action = "account.deactivate"
        message = "Account deactivated. Existing transactions were preserved."
    else:
        db.delete(account)
        action = "account.delete"
        message = "Account deleted."

    log_event(
        db,
        ctx,
        action=action,
        entity_type="account",
        entity_id=account_id,
        summary=f"{message} ({account.name})",
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message=message)
