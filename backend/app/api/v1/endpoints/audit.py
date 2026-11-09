"""Immutable audit history (administrator only)."""
import uuid
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentContext, require_admin
from app.models.audit import AuditLog
from app.schemas.common import Page
from app.schemas.reporting import AuditOut

router = APIRouter(prefix="/audit", tags=["Audit History"])


@router.get("", response_model=Page[AuditOut])
def audit_history(
    action: str | None = None,
    entity_type: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from sqlalchemy import func, or_

    filters = [AuditLog.household_id == ctx.household_id]
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if actor_user_id:
        filters.append(AuditLog.actor_user_id == actor_user_id)
    if date_from:
        filters.append(AuditLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(AuditLog.created_at <= datetime.combine(date_to, time.max))
    if q:
        like = f"%{q.strip()}%"
        filters.append(or_(AuditLog.summary.ilike(like), AuditLog.actor_name.ilike(like), AuditLog.action.ilike(like)))

    total = db.execute(select(func.count()).select_from(AuditLog).where(*filters)).scalar_one()
    entries = db.execute(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()
    pages = (total + page_size - 1) // page_size if total else 0
    return Page[AuditOut](
        items=[AuditOut.model_validate(entry) for entry in entries],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/actions", response_model=list[str])
def audit_actions(ctx: CurrentContext = Depends(require_admin), db: Session = Depends(get_db)):
    from sqlalchemy import distinct

    actions = db.execute(
        select(distinct(AuditLog.action)).where(AuditLog.household_id == ctx.household_id).order_by(AuditLog.action)
    ).scalars().all()
    return list(actions)
