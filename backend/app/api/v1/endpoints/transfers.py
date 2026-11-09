"""Account-to-account transfers (never income or expenses)."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import STATUS_POSTED, money
from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context
from app.core.errors import bad_request, forbidden, not_found
from app.models.account import Account
from app.models.transaction import Transfer
from app.permissions.rbac import is_admin
from app.schemas.common import Message
from app.schemas.finance import TransferCreate, TransferOut
from app.services.accounts import account_flow
from app.services.audit import log_event
from app.services.serializers import transfer_out

router = APIRouter(prefix="/transfers", tags=["Transfers"])

TRANSFER_LOAD = (
    selectinload(Transfer.from_account),
    selectinload(Transfer.to_account),
    selectinload(Transfer.created_by_user),
)


def _visible_accounts_filter(ctx: CurrentContext, column):
    if is_admin(ctx):
        return column.isnot(None)
    return or_(column.in_(select(Account.id).where(Account.owner_user_id.is_(None))),
               column.in_(select(Account.id).where(Account.owner_user_id == ctx.user.id)))


@router.get("", response_model=list[TransferOut])
def list_transfers(
    date_from: date | None = None,
    date_to: date | None = None,
    account_id: uuid.UUID | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    query = select(Transfer).where(Transfer.household_id == ctx.household_id).options(*TRANSFER_LOAD)
    if not is_admin(ctx):
        query = query.where(
            or_(
                _visible_accounts_filter(ctx, Transfer.from_account_id),
                _visible_accounts_filter(ctx, Transfer.to_account_id),
            )
        )
    if date_from:
        query = query.where(Transfer.transfer_date >= date_from)
    if date_to:
        query = query.where(Transfer.transfer_date <= date_to)
    if account_id:
        query = query.where(
            or_(Transfer.from_account_id == account_id, Transfer.to_account_id == account_id)
        )
    transfers = db.execute(query.order_by(Transfer.transfer_date.desc(), Transfer.created_at.desc())).scalars().all()
    return [transfer_out(t) for t in transfers]


@router.post("", response_model=TransferOut, status_code=201)
def create_transfer(
    payload: TransferCreate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    from_account = db.get(Account, payload.from_account_id)
    to_account = db.get(Account, payload.to_account_id)
    for account in (from_account, to_account):
        if account is None or account.household_id != ctx.household_id:
            raise not_found("Account")
        if not is_admin(ctx) and account.owner_user_id not in (None, ctx.user.id):
            raise forbidden("You cannot transfer money using another member's personal account")
        if not account.is_active:
            raise bad_request(f"Account '{account.name}' is inactive")

    amount = money(payload.amount)
    if amount <= 0:
        raise bad_request("Transfer amount must be greater than zero")

    if from_account.account_type != "credit_card":
        flows = account_flow(db, [from_account.id])
        available = money(from_account.opening_balance) - flows[from_account.id]["expenses"] - flows[from_account.id]["transfers_out"] + flows[from_account.id]["income"] + flows[from_account.id]["transfers_in"]
        if amount > available:
            raise bad_request(
                f"Insufficient balance in '{from_account.name}'. Available: {available}"
            )

    transfer = Transfer(
        household_id=ctx.household_id,
        from_account_id=from_account.id,
        to_account_id=to_account.id,
        amount=amount,
        currency=from_account.currency or "INR",
        transfer_date=payload.transfer_date,
        description=payload.description,
        status=STATUS_POSTED,
        created_by=ctx.user.id,
    )
    db.add(transfer)
    db.flush()
    log_event(
        db,
        ctx,
        action="transfer.create",
        entity_type="transfer",
        entity_id=transfer.id,
        summary=(
            f"Transferred {amount} from '{from_account.name}' to '{to_account.name}'"
        ),
        after={
            "from": from_account.name,
            "to": to_account.name,
            "amount": str(amount),
            "date": str(payload.transfer_date),
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(transfer)
    return transfer_out(transfer)


@router.delete("/{transfer_id}", response_model=Message)
def reverse_transfer(
    transfer_id: uuid.UUID,
    request: Request,
    reason: str = Query(default="Transfer reversed by user", max_length=300),
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    transfer = db.get(Transfer, transfer_id)
    if transfer is None or transfer.household_id != ctx.household_id:
        raise not_found("Transfer")
    if not is_admin(ctx) and transfer.created_by != ctx.user.id:
        raise forbidden("You can only reverse transfers you created")
    if transfer.status != STATUS_POSTED:
        raise bad_request("Transfer is already reversed")

    from app.models.base import utcnow

    transfer.status = "reversed"
    transfer.reversed_at = utcnow()
    transfer.reversal_reason = reason
    log_event(
        db,
        ctx,
        action="transfer.reverse",
        entity_type="transfer",
        entity_id=transfer.id,
        summary=f"Reversed transfer of {money(transfer.amount)} ({reason})",
        before={"status": STATUS_POSTED},
        after={"status": "reversed", "reason": reason},
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message="Transfer reversed. Both account balances have been restored.")
