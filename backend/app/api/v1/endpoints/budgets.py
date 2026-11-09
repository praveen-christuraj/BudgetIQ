"""Budget planning endpoints (family and individual budgets)."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.constants import BUDGET_ACTIVE, BUDGET_ARCHIVED, SCOPE_PERSONAL, money
from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context
from app.core.errors import bad_request, forbidden, not_found
from app.models.budget import Budget, BudgetAllocation
from app.models.category import Category
from app.permissions.rbac import is_admin
from app.schemas.common import Message
from app.schemas.planning import (
    AllocationIn,
    BudgetCreate,
    BudgetOut,
    BudgetSummary,
    BudgetUpdate,
)
from app.services.audit import log_event, snapshot
from app.services.budgets import BUDGET_LOAD, active_budgets_for_month, apply_carry_forward, build_budget_out
from app.services.transactions import active_membership

router = APIRouter(prefix="/budgets", tags=["Budgets"])

AUDIT_FIELDS = ["name", "period_type", "start_date", "end_date", "owner_user_id", "carry_forward", "status"]


def _get_budget(db: Session, ctx: CurrentContext, budget_id: uuid.UUID) -> Budget:
    budget = db.execute(
        select(Budget).where(Budget.id == budget_id, Budget.household_id == ctx.household_id).options(*BUDGET_LOAD)
    ).scalar_one_or_none()
    if budget is None:
        raise not_found("Budget")
    if not is_admin(ctx) and budget.owner_user_id not in (None, ctx.user.id):
        raise forbidden("This budget belongs to another member")
    return budget


def _assert_can_manage(ctx: CurrentContext, owner_user_id: uuid.UUID | None) -> None:
    if is_admin(ctx):
        return
    if owner_user_id != ctx.user.id:
        raise forbidden("Members can only manage their own personal budgets")


def _validate_allocations(db: Session, ctx: CurrentContext, allocations: list[AllocationIn]) -> None:
    seen = set()
    for allocation in allocations:
        if allocation.category_id in seen:
            raise bad_request("Each category can only appear once in a budget")
        seen.add(allocation.category_id)
        category = db.get(Category, allocation.category_id)
        if category is None or category.household_id != ctx.household_id:
            raise not_found("Category")
        if category.kind != "expense":
            raise bad_request("Only expense categories can be allocated in a budget")
        if allocation.planned_amount < 0:
            raise bad_request("Planned amount cannot be negative")


@router.get("", response_model=list[BudgetOut])
def list_budgets(
    period_type: str | None = None,
    status: str | None = None,
    owner_user_id: uuid.UUID | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    query = select(Budget).where(Budget.household_id == ctx.household_id).options(*BUDGET_LOAD)
    if not is_admin(ctx):
        query = query.where(or_(Budget.owner_user_id.is_(None), Budget.owner_user_id == ctx.user.id))
    if period_type:
        query = query.where(Budget.period_type == period_type)
    if status:
        query = query.where(Budget.status == status)
    if owner_user_id:
        query = query.where(Budget.owner_user_id == owner_user_id)
    budgets = db.execute(query.order_by(Budget.start_date.desc())).scalars().all()
    return [build_budget_out(db, ctx, budget).budget for budget in budgets]


@router.get("/current", response_model=list[BudgetSummary])
def current_budgets(
    on_date: date | None = None,
    owner_user_id: uuid.UUID | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    budgets = active_budgets_for_month(db, ctx.household_id, on_date or date.today())
    if owner_user_id:
        budgets = [b for b in budgets if b.owner_user_id == owner_user_id]
    if not is_admin(ctx):
        budgets = [b for b in budgets if b.owner_user_id in (None, ctx.user.id)]
    return [build_budget_out(db, ctx, budget) for budget in budgets]


@router.get("/{budget_id}", response_model=BudgetSummary)
def get_budget(budget_id: uuid.UUID, ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    budget = _get_budget(db, ctx, budget_id)
    return build_budget_out(db, ctx, budget)


@router.post("", response_model=BudgetSummary, status_code=201)
def create_budget(
    payload: BudgetCreate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    _assert_can_manage(ctx, payload.owner_user_id)
    if payload.end_date < payload.start_date:
        raise bad_request("End date must be on or after the start date")
    if payload.owner_user_id and active_membership(db, ctx.household_id, payload.owner_user_id) is None:
        raise bad_request("Budget owner must be an active household member")
    _validate_allocations(db, ctx, payload.allocations)

    duplicate = db.execute(
        select(Budget).where(
            Budget.household_id == ctx.household_id,
            Budget.start_date == payload.start_date,
            Budget.owner_user_id == payload.owner_user_id if payload.owner_user_id else Budget.owner_user_id.is_(None),
        )
    ).scalars().first()
    if duplicate:
        raise bad_request("A budget already exists for this owner and start date")

    budget = Budget(
        household_id=ctx.household_id,
        owner_user_id=payload.owner_user_id,
        name=payload.name.strip(),
        period_type=payload.period_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        carry_forward=payload.carry_forward,
        notes=payload.notes,
        created_by=ctx.user.id,
        status=BUDGET_ACTIVE,
    )
    db.add(budget)
    db.flush()

    for allocation in payload.allocations:
        db.add(
            BudgetAllocation(
                budget_id=budget.id,
                category_id=allocation.category_id,
                planned_amount=money(allocation.planned_amount),
                note=allocation.note,
            )
        )
    db.flush()

    if payload.carry_forward:
        apply_carry_forward(db, budget)

    log_event(
        db,
        ctx,
        action="budget.create",
        entity_type="budget",
        entity_id=budget.id,
        summary=f"Created budget '{budget.name}' ({budget.period_type})",
        after=snapshot(budget, AUDIT_FIELDS),
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(budget)
    return build_budget_out(db, ctx, budget)


@router.put("/{budget_id}", response_model=BudgetSummary)
def update_budget(
    budget_id: uuid.UUID,
    payload: BudgetUpdate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    budget = _get_budget(db, ctx, budget_id)
    _assert_can_manage(ctx, budget.owner_user_id)
    before = snapshot(budget, AUDIT_FIELDS)
    data = payload.model_dump(exclude_unset=True)

    if "owner_user_id" in data and data["owner_user_id"] != budget.owner_user_id:
        if not is_admin(ctx):
            raise forbidden("Only an administrator can reassign a budget")
        if data["owner_user_id"] and active_membership(db, ctx.household_id, data["owner_user_id"]) is None:
            raise bad_request("Budget owner must be an active household member")

    start = data.get("start_date", budget.start_date)
    end = data.get("end_date", budget.end_date)
    if end < start:
        raise bad_request("End date must be on or after the start date")

    for field, value in data.items():
        setattr(budget, field, value)

    log_event(
        db,
        ctx,
        action="budget.update",
        entity_type="budget",
        entity_id=budget.id,
        summary=f"Updated budget '{budget.name}'",
        before=before,
        after=snapshot(budget, AUDIT_FIELDS),
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(budget)
    return build_budget_out(db, ctx, budget)


@router.put("/{budget_id}/allocations", response_model=BudgetSummary)
def replace_allocations(
    budget_id: uuid.UUID,
    allocations: list[AllocationIn],
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    budget = _get_budget(db, ctx, budget_id)
    _assert_can_manage(ctx, budget.owner_user_id)
    _validate_allocations(db, ctx, allocations)

    before = [
        {"category_id": str(a.category_id), "planned": str(a.planned_amount)}
        for a in budget.allocations
    ]
    for allocation in list(budget.allocations):
        db.delete(allocation)
    db.flush()
    for allocation in allocations:
        db.add(
            BudgetAllocation(
                budget_id=budget.id,
                category_id=allocation.category_id,
                planned_amount=money(allocation.planned_amount),
                note=allocation.note,
            )
        )
    db.flush()
    log_event(
        db,
        ctx,
        action="budget.allocations_update",
        entity_type="budget",
        entity_id=budget.id,
        summary=f"Replaced category allocations for '{budget.name}'",
        before={"allocations": before},
        after={"allocations": [
            {"category_id": str(a.category_id), "planned": str(a.planned_amount)} for a in allocations
        ]},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(budget)
    return build_budget_out(db, ctx, budget)


@router.post("/{budget_id}/carry-forward", response_model=BudgetSummary)
def carry_forward_budget(
    budget_id: uuid.UUID,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    budget = _get_budget(db, ctx, budget_id)
    _assert_can_manage(ctx, budget.owner_user_id)
    apply_carry_forward(db, budget)
    budget.carry_forward = True
    log_event(
        db,
        ctx,
        action="budget.carry_forward",
        entity_type="budget",
        entity_id=budget.id,
        summary=f"Applied carry-forward from the previous period to '{budget.name}'",
    )
    db.commit()
    db.refresh(budget)
    return build_budget_out(db, ctx, budget)


@router.delete("/{budget_id}", response_model=Message)
def archive_budget(
    budget_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    budget = _get_budget(db, ctx, budget_id)
    _assert_can_manage(ctx, budget.owner_user_id)
    budget.status = BUDGET_ARCHIVED
    log_event(
        db,
        ctx,
        action="budget.archive",
        entity_type="budget",
        entity_id=budget.id,
        summary=f"Archived budget '{budget.name}' (historical data preserved)",
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message="Budget archived. Historical records remain available in reports.")
