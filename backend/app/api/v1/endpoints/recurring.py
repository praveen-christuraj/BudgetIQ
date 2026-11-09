"""Recurring bills, subscriptions, salary and commitments."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import money
from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context
from app.core.errors import bad_request, forbidden, not_found
from app.models.recurring import RecurringRule
from app.permissions.rbac import is_admin
from app.schemas.common import Message
from app.schemas.planning import GenerateResult, RecurringCreate, RecurringOut, RecurringUpdate
from app.services.audit import log_event, snapshot
from app.services.recurring import due_rules, generate_draft
from app.services.serializers import recurring_out, transaction_out
from app.services.transactions import active_membership, get_visible_account

router = APIRouter(prefix="/recurring", tags=["Recurring Payments"])

RULE_LOAD = (
    selectinload(RecurringRule.account),
    selectinload(RecurringRule.category),
    selectinload(RecurringRule.owner),
    selectinload(RecurringRule.responsible),
)
AUDIT_FIELDS = [
    "name",
    "amount",
    "frequency",
    "next_due_date",
    "account_id",
    "category_id",
    "is_active",
    "scope",
    "owner_user_id",
]


def _rule_query(ctx: CurrentContext):
    query = select(RecurringRule).where(RecurringRule.household_id == ctx.household_id).options(*RULE_LOAD)
    if not is_admin(ctx):
        query = query.where(
            or_(
                RecurringRule.owner_user_id.is_(None),
                RecurringRule.owner_user_id == ctx.user.id,
                RecurringRule.responsible_user_id == ctx.user.id,
                RecurringRule.created_by == ctx.user.id,
            )
        )
    return query


def _get_rule(db: Session, ctx: CurrentContext, rule_id: uuid.UUID) -> RecurringRule:
    rule = db.execute(_rule_query(ctx).where(RecurringRule.id == rule_id)).scalar_one_or_none()
    if rule is None:
        raise not_found("Recurring rule")
    return rule


@router.get("", response_model=list[RecurringOut])
def list_rules(
    active_only: bool = False,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    query = _rule_query(ctx)
    if active_only:
        query = query.where(RecurringRule.is_active.is_(True))
    rules = db.execute(query.order_by(RecurringRule.next_due_date)).scalars().all()
    today = date.today()
    return [recurring_out(rule, (rule.next_due_date - today).days) for rule in rules]


@router.post("", response_model=RecurringOut, status_code=201)
def create_rule(
    payload: RecurringCreate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    get_visible_account(db, ctx, payload.account_id)
    if payload.scope == "personal":
        owner = payload.owner_user_id or ctx.user.id
        if owner != ctx.user.id and not is_admin(ctx):
            raise forbidden("Members can only create personal recurring rules for themselves")
        if active_membership(db, ctx.household_id, owner) is None:
            raise bad_request("Owner must be an active household member")
        owner_id = owner
    else:
        owner_id = None
    if payload.responsible_user_id and active_membership(db, ctx.household_id, payload.responsible_user_id) is None:
        raise bad_request("Responsible member must be active")
    if payload.end_date and payload.end_date < payload.start_date:
        raise bad_request("End date must be on or after the start date")

    rule = RecurringRule(
        household_id=ctx.household_id,
        name=payload.name.strip(),
        transaction_type=payload.transaction_type,
        scope=payload.scope,
        owner_user_id=owner_id,
        category_id=payload.category_id,
        account_id=payload.account_id,
        responsible_user_id=payload.responsible_user_id,
        amount=money(payload.amount),
        frequency=payload.frequency,
        start_date=payload.start_date,
        end_date=payload.end_date,
        next_due_date=payload.next_due_date or payload.start_date,
        payment_method=payload.payment_method,
        description=payload.description,
        notes=payload.notes,
        is_active=payload.is_active,
        created_by=ctx.user.id,
    )
    db.add(rule)
    db.flush()
    log_event(
        db,
        ctx,
        action="recurring.create",
        entity_type="recurring_rule",
        entity_id=rule.id,
        summary=f"Created recurring {rule.transaction_type} '{rule.name}' ({rule.frequency})",
        after=snapshot(rule, AUDIT_FIELDS),
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(rule)
    return recurring_out(rule, (rule.next_due_date - date.today()).days)


@router.patch("/{rule_id}", response_model=RecurringOut)
def update_rule(
    rule_id: uuid.UUID,
    payload: RecurringUpdate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    rule = _get_rule(db, ctx, rule_id)
    if not is_admin(ctx) and rule.created_by != ctx.user.id and rule.responsible_user_id != ctx.user.id:
        raise forbidden("You cannot modify this recurring rule")
    before = snapshot(rule, AUDIT_FIELDS)
    data = payload.model_dump(exclude_unset=True)
    if "account_id" in data:
        get_visible_account(db, ctx, data["account_id"])
    for field, value in data.items():
        if field == "amount" and value is not None:
            value = money(value)
        setattr(rule, field, value)
    if rule.end_date and rule.end_date < rule.start_date:
        raise bad_request("End date must be on or after the start date")

    log_event(
        db,
        ctx,
        action="recurring.update",
        entity_type="recurring_rule",
        entity_id=rule.id,
        summary=f"Updated recurring rule '{rule.name}'",
        before=before,
        after=snapshot(rule, AUDIT_FIELDS),
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(rule)
    return recurring_out(rule, (rule.next_due_date - date.today()).days)


@router.delete("/{rule_id}", response_model=Message)
def delete_rule(
    rule_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    rule = _get_rule(db, ctx, rule_id)
    if not is_admin(ctx) and rule.created_by != ctx.user.id:
        raise forbidden("You cannot delete this recurring rule")
    rule.is_active = False
    log_event(
        db,
        ctx,
        action="recurring.deactivate",
        entity_type="recurring_rule",
        entity_id=rule.id,
        summary=f"Deactivated recurring rule '{rule.name}'",
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message="Recurring rule deactivated. Previously generated drafts were kept.")


@router.post("/{rule_id}/generate", response_model=GenerateResult)
def generate_for_rule(
    rule_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    rule = _get_rule(db, ctx, rule_id)
    txn = generate_draft(db, ctx, rule)
    db.commit()
    if txn is None:
        return GenerateResult(created=0, transactions=[], message="Nothing to generate for this rule yet.")
    db.refresh(txn)
    return GenerateResult(
        created=1,
        transactions=[transaction_out(txn, ctx)],
        message="Draft transaction created. Review it and post it once the payment is made.",
    )


@router.post("/generate-due", response_model=GenerateResult)
def generate_all_due(
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    """Create draft entries for every rule that is due. Never marks anything paid."""
    rules = [r for r in due_rules(db, ctx.household_id, date.today())]
    if not is_admin(ctx):
        rules = [
            r for r in rules
            if r.owner_user_id in (None, ctx.user.id) or r.responsible_user_id == ctx.user.id
        ]
    created = []
    for rule in rules:
        txn = generate_draft(db, ctx, rule)
        if txn is not None:
            created.append(txn)
    log_event(
        db,
        ctx,
        action="recurring.generate_due",
        entity_type="recurring_rule",
        entity_id=None,
        summary=f"Generated {len(created)} draft transaction(s) for due recurring payments",
        ip_address=client_ip(request),
    )
    db.commit()
    for txn in created:
        db.refresh(txn)
    return GenerateResult(
        created=len(created),
        transactions=[transaction_out(txn, ctx) for txn in created],
        message=(
            f"{len(created)} draft transaction(s) created. Confirm each one after paying."
            if created
            else "No recurring payments are due today."
        ),
    )
