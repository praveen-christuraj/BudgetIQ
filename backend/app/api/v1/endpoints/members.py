"""Family member management (administrator controlled)."""
import calendar
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.constants import ROLE_ADMIN, STATUS_POSTED, TXN_EXPENSE, TXN_INCOME, money
from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context, require_admin
from app.core.errors import bad_request, forbidden, not_found
from app.core.security import hash_password
from app.models.account import Account
from app.models.household import HouseholdMember, User
from app.models.transaction import Transaction
from app.schemas.common import Message
from app.schemas.household import (
    MemberCreate,
    MemberOut,
    MemberPasswordReset,
    MemberSummary,
    MemberUpdate,
)
from app.services.audit import log_event

router = APIRouter(prefix="/members", tags=["Family Members"])


def _member_row(db: Session, membership: HouseholdMember) -> MemberOut:
    user = db.get(User, membership.user_id)
    return MemberOut(
        id=membership.id,
        user_id=membership.user_id,
        household_id=membership.household_id,
        full_name=user.full_name if user else "",
        email=user.email if user else "",
        role=membership.role,
        relationship_label=membership.relationship_label,
        display_color=membership.display_color,
        is_active=membership.is_active and bool(user and user.is_active),
        joined_at=membership.joined_at,
        last_login_at=user.last_login_at if user else None,
    )


def _month_bounds() -> tuple[date, date]:
    today = date.today()
    return date(today.year, today.month, 1), date(
        today.year, today.month, calendar.monthrange(today.year, today.month)[1]
    )


def _active_admin_count(db: Session, household_id: uuid.UUID, exclude_user_id: uuid.UUID | None = None) -> int:
    query = select(func.count()).select_from(HouseholdMember).where(
        HouseholdMember.household_id == household_id,
        HouseholdMember.role == ROLE_ADMIN,
        HouseholdMember.is_active.is_(True),
    )
    if exclude_user_id:
        query = query.where(HouseholdMember.user_id != exclude_user_id)
    return db.execute(query).scalar_one()


@router.get("", response_model=list[MemberSummary])
def list_members(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    memberships = db.execute(
        select(HouseholdMember)
        .where(HouseholdMember.household_id == ctx.household_id)
        .order_by(HouseholdMember.role, HouseholdMember.joined_at)
    ).scalars().all()

    start, end = _month_bounds()
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
        )
    ).all()

    totals: dict[uuid.UUID, dict] = {}
    for owner_id, creator_id, txn_type, amount in rows:
        member_id = owner_id or creator_id
        bucket = totals.setdefault(member_id, {"income": money(0), "expenses": money(0), "count": 0})
        bucket["count"] += 1
        if txn_type == TXN_INCOME:
            bucket["income"] += money(amount)
        elif txn_type == TXN_EXPENSE:
            bucket["expenses"] += money(amount)

    account_counts = {
        owner_id: count
        for owner_id, count in db.execute(
            select(Account.owner_user_id, func.count())
            .where(Account.household_id == ctx.household_id, Account.owner_user_id.isnot(None))
            .group_by(Account.owner_user_id)
        ).all()
    }

    output = []
    for membership in memberships:
        base = _member_row(db, membership)
        bucket = totals.get(membership.user_id, {"income": money(0), "expenses": money(0), "count": 0})
        output.append(
            MemberSummary(
                **base.model_dump(),
                account_count=account_counts.get(membership.user_id, 0),
                transaction_count=bucket["count"],
                total_income=float(bucket["income"]),
                total_expenses=float(bucket["expenses"]),
            )
        )
    return output


@router.get("/{member_id}", response_model=MemberOut)
def get_member(
    member_id: uuid.UUID,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    membership = db.get(HouseholdMember, member_id)
    if membership is None or membership.household_id != ctx.household_id:
        raise not_found("Member")
    return _member_row(db, membership)


@router.post("", response_model=MemberOut, status_code=201)
def create_member(
    payload: MemberCreate,
    request: Request,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    email = payload.email.lower()
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing:
        raise bad_request("A user with this email already exists")

    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.flush()

    membership = HouseholdMember(
        household_id=ctx.household_id,
        user_id=user.id,
        role=payload.role,
        relationship_label=payload.relationship_label,
        display_color=payload.display_color,
    )
    db.add(membership)
    db.flush()

    log_event(
        db,
        ctx,
        action="member.create",
        entity_type="member",
        entity_id=membership.id,
        summary=f"Added family member {user.full_name} ({email}) as {payload.role}",
        after={"email": email, "role": payload.role, "full_name": user.full_name},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(membership)
    return _member_row(db, membership)


@router.patch("/{member_id}", response_model=MemberOut)
def update_member(
    member_id: uuid.UUID,
    payload: MemberUpdate,
    request: Request,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    membership = db.get(HouseholdMember, member_id)
    if membership is None or membership.household_id != ctx.household_id:
        raise not_found("Member")
    user = db.get(User, membership.user_id)
    if user is None:
        raise not_found("User")

    data = payload.model_dump(exclude_unset=True)
    before = {
        "full_name": user.full_name,
        "role": membership.role,
        "relationship_label": membership.relationship_label,
        "display_color": membership.display_color,
        "is_active": membership.is_active,
    }

    if data.get("role") and data["role"] != ROLE_ADMIN and membership.role == ROLE_ADMIN:
        if _active_admin_count(db, ctx.household_id, exclude_user_id=user.id) == 0:
            raise bad_request("The household must keep at least one active administrator")
    if data.get("is_active") is False:
        if user.id == ctx.user.id:
            raise bad_request("You cannot deactivate your own membership")
        if membership.role == ROLE_ADMIN and _active_admin_count(db, ctx.household_id, exclude_user_id=user.id) == 0:
            raise bad_request("The household must keep at least one active administrator")

    if "full_name" in data and data["full_name"]:
        user.full_name = data["full_name"].strip()
    for field in ("role", "relationship_label", "display_color", "is_active"):
        if field in data and data[field] is not None:
            setattr(membership, field, data[field])
    if "is_active" in data and data["is_active"] is not None:
        user.is_active = data["is_active"]

    log_event(
        db,
        ctx,
        action="member.update",
        entity_type="member",
        entity_id=membership.id,
        summary=f"Updated family member {user.full_name}",
        before=before,
        after={
            "full_name": user.full_name,
            "role": membership.role,
            "relationship_label": membership.relationship_label,
            "display_color": membership.display_color,
            "is_active": membership.is_active,
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(membership)
    return _member_row(db, membership)


@router.delete("/{member_id}", response_model=Message)
def deactivate_member(
    member_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Members are deactivated (soft) so their financial history is preserved."""
    membership = db.get(HouseholdMember, member_id)
    if membership is None or membership.household_id != ctx.household_id:
        raise not_found("Member")
    user = db.get(User, membership.user_id)
    if user is None:
        raise not_found("User")
    if user.id == ctx.user.id:
        raise bad_request("You cannot deactivate your own membership")
    if membership.role == ROLE_ADMIN and _active_admin_count(db, ctx.household_id, exclude_user_id=user.id) == 0:
        raise bad_request("The household must keep at least one active administrator")

    membership.is_active = False
    user.is_active = False
    log_event(
        db,
        ctx,
        action="member.deactivate",
        entity_type="member",
        entity_id=membership.id,
        summary=f"Deactivated family member {user.full_name}. Financial history preserved.",
        before={"is_active": True},
        after={"is_active": False},
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message="Member deactivated. Their financial history remains available.")


@router.post("/{member_id}/reset-password", response_model=Message)
def reset_member_password(
    member_id: uuid.UUID,
    payload: MemberPasswordReset,
    request: Request,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    membership = db.get(HouseholdMember, member_id)
    if membership is None or membership.household_id != ctx.household_id:
        raise not_found("Member")
    user = db.get(User, membership.user_id)
    if user is None:
        raise not_found("User")
    if user.id == ctx.user.id:
        raise forbidden("Use the change-password endpoint for your own account")

    user.password_hash = hash_password(payload.new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    log_event(
        db,
        ctx,
        action="member.password_reset",
        entity_type="member",
        entity_id=membership.id,
        summary=f"Administrator reset the password for {user.full_name}",
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message="Password reset successfully")
