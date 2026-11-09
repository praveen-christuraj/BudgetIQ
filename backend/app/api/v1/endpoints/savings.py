"""Savings goals and contributions.

A contribution is an allocation towards a goal - it is *not* an expense, and a
bank-to-savings-account transfer stays an account transfer. This avoids
double-counting savings.
"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import money
from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context
from app.core.errors import bad_request, forbidden, not_found
from app.models.savings import SavingsContribution, SavingsGoal
from app.permissions.rbac import is_admin
from app.schemas.common import Message
from app.schemas.planning import ContributionCreate, ContributionOut, GoalCreate, GoalOut, GoalUpdate
from app.services.audit import log_event
from app.services.serializers import contribution_out, goal_out
from app.services.transactions import active_membership, get_visible_account

router = APIRouter(prefix="/savings", tags=["Savings & Goals"])

GOAL_LOAD = (
    selectinload(SavingsGoal.contributions).selectinload(SavingsContribution.account),
    selectinload(SavingsGoal.contributions).selectinload(SavingsContribution.creator),
    selectinload(SavingsGoal.owner),
    selectinload(SavingsGoal.account),
)


def _goal_query(ctx: CurrentContext):
    query = select(SavingsGoal).where(SavingsGoal.household_id == ctx.household_id).options(*GOAL_LOAD)
    if not is_admin(ctx):
        query = query.where(
            or_(SavingsGoal.owner_user_id.is_(None), SavingsGoal.owner_user_id == ctx.user.id)
        )
    return query


def _get_goal(db: Session, ctx: CurrentContext, goal_id: uuid.UUID) -> SavingsGoal:
    goal = db.execute(_goal_query(ctx).where(SavingsGoal.id == goal_id)).scalar_one_or_none()
    if goal is None:
        raise not_found("Savings goal")
    return goal


def _assert_can_manage(ctx: CurrentContext, goal: SavingsGoal) -> None:
    if is_admin(ctx) or goal.owner_user_id == ctx.user.id:
        return
    raise forbidden("You can only manage your own savings goals")


@router.get("/goals", response_model=list[GoalOut])
def list_goals(
    status: str | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    query = _goal_query(ctx)
    if status:
        query = query.where(SavingsGoal.status == status)
    goals = db.execute(query.order_by(SavingsGoal.created_at.desc())).scalars().all()
    return [goal_out(goal) for goal in goals]


@router.get("/overview")
def savings_overview(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    goals = db.execute(_goal_query(ctx)).scalars().all()
    total_saved = money(sum((money(sum((c.amount for c in g.contributions), start=money(0))) for g in goals), start=money(0)))
    total_target = money(sum((money(g.target_amount) for g in goals), start=money(0)))
    return {
        "goal_count": len(goals),
        "active_goals": len([g for g in goals if g.status == "active"]),
        "total_saved": float(total_saved),
        "total_target": float(total_target),
        "progress_percent": round(float(total_saved / total_target * 100) if total_target > 0 else 0.0, 1),
        "achieved_goals": len([g for g in goals if g.status == "achieved"]),
    }


@router.post("/goals", response_model=GoalOut, status_code=201)
def create_goal(
    payload: GoalCreate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    owner_id = payload.owner_user_id
    if owner_id is not None and not is_admin(ctx) and owner_id != ctx.user.id:
        raise forbidden("Members can only create goals for themselves")
    if owner_id is not None and active_membership(db, ctx.household_id, owner_id) is None:
        raise bad_request("Goal owner must be an active household member")
    if payload.account_id:
        get_visible_account(db, ctx, payload.account_id)

    goal = SavingsGoal(
        household_id=ctx.household_id,
        owner_user_id=owner_id,
        name=payload.name.strip(),
        target_amount=money(payload.target_amount),
        target_date=payload.target_date,
        account_id=payload.account_id,
        notes=payload.notes,
        created_by=ctx.user.id,
        status="active",
    )
    db.add(goal)
    db.flush()
    log_event(
        db,
        ctx,
        action="savings.goal_create",
        entity_type="savings_goal",
        entity_id=goal.id,
        summary=f"Created savings goal '{goal.name}' with target {money(goal.target_amount)}",
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(goal)
    return goal_out(goal)


@router.patch("/goals/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: uuid.UUID,
    payload: GoalUpdate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    goal = _get_goal(db, ctx, goal_id)
    _assert_can_manage(ctx, goal)
    data = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in data and not is_admin(ctx) and data["owner_user_id"] != ctx.user.id:
        raise forbidden("Members can only assign goals to themselves")
    for field, value in data.items():
        if field == "target_amount" and value is not None:
            value = money(value)
        setattr(goal, field, value)
    log_event(
        db,
        ctx,
        action="savings.goal_update",
        entity_type="savings_goal",
        entity_id=goal.id,
        summary=f"Updated savings goal '{goal.name}'",
        after={k: str(v) for k, v in data.items()},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(goal)
    return goal_out(goal)


@router.delete("/goals/{goal_id}", response_model=Message)
def archive_goal(
    goal_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    goal = _get_goal(db, ctx, goal_id)
    _assert_can_manage(ctx, goal)
    goal.status = "archived"
    log_event(
        db,
        ctx,
        action="savings.goal_archive",
        entity_type="savings_goal",
        entity_id=goal.id,
        summary=f"Archived savings goal '{goal.name}'",
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message="Savings goal archived. Contribution history is preserved.")


@router.post("/goals/{goal_id}/contributions", response_model=GoalOut, status_code=201)
def add_contribution(
    goal_id: uuid.UUID,
    payload: ContributionCreate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    goal = _get_goal(db, ctx, goal_id)
    if payload.account_id:
        get_visible_account(db, ctx, payload.account_id)
    if payload.contribution_date > date.today():
        raise bad_request("Contribution date cannot be in the future")

    contribution = SavingsContribution(
        goal_id=goal.id,
        amount=money(payload.amount),
        contribution_date=payload.contribution_date,
        account_id=payload.account_id,
        notes=payload.notes,
        created_by=ctx.user.id,
    )
    db.add(contribution)
    db.flush()

    total = money(
        db.execute(
            select(func.coalesce(func.sum(SavingsContribution.amount), 0)).where(
                SavingsContribution.goal_id == goal.id
            )
        ).scalar_one()
    )
    if total >= money(goal.target_amount):
        goal.status = "achieved"

    log_event(
        db,
        ctx,
        action="savings.contribution",
        entity_type="savings_goal",
        entity_id=goal.id,
        summary=f"Contributed {money(payload.amount)} towards '{goal.name}'",
        after={"amount": str(money(payload.amount)), "date": str(payload.contribution_date)},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(goal)
    return goal_out(goal)


@router.delete("/goals/{goal_id}/contributions/{contribution_id}", response_model=GoalOut)
def delete_contribution(
    goal_id: uuid.UUID,
    contribution_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    goal = _get_goal(db, ctx, goal_id)
    contribution = db.get(SavingsContribution, contribution_id)
    if contribution is None or contribution.goal_id != goal.id:
        raise not_found("Contribution")
    if not is_admin(ctx) and contribution.created_by != ctx.user.id:
        raise forbidden("You can only remove contributions you recorded")

    amount = contribution.amount
    db.delete(contribution)
    db.flush()
    if goal.status == "achieved":
        remaining_total = money(
            db.execute(
                select(func.coalesce(func.sum(SavingsContribution.amount), 0)).where(
                    SavingsContribution.goal_id == goal.id
                )
            ).scalar_one()
        )
        if remaining_total < money(goal.target_amount):
            goal.status = "active"

    log_event(
        db,
        ctx,
        action="savings.contribution_delete",
        entity_type="savings_goal",
        entity_id=goal.id,
        summary=f"Removed contribution of {money(amount)} from '{goal.name}'",
        after={"removed_amount": str(money(amount))},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(goal)
    return goal_out(goal)
