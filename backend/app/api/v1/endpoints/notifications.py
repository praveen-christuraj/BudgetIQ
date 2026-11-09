"""In-app notifications: budget warnings, due payments, loans and goals."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentContext, get_current_context
from app.core.errors import not_found
from app.models.notification import Notification
from app.schemas.common import Message
from app.schemas.reporting import NotificationCounts, NotificationOut
from app.services.notifications import sync_notifications

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _visible(ctx: CurrentContext):
    return or_(Notification.user_id.is_(None), Notification.user_id == ctx.user.id)


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    sync_notifications(db, ctx)
    db.commit()
    query = select(Notification).where(
        Notification.household_id == ctx.household_id, _visible(ctx)
    ).order_by(Notification.created_at.desc()).limit(min(max(limit, 1), 200))
    if unread_only:
        query = query.where(Notification.is_read.is_(False))
    return [NotificationOut.model_validate(n) for n in db.execute(query).scalars()]


@router.get("/count", response_model=NotificationCounts)
def notification_counts(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    sync_notifications(db, ctx)
    db.commit()
    base = select(Notification).where(Notification.household_id == ctx.household_id, _visible(ctx))
    notifications = list(db.execute(base).scalars())
    unread = [n for n in notifications if not n.is_read]
    return NotificationCounts(
        total=len(notifications),
        unread=len(unread),
        warning=len([n for n in unread if n.severity == "warning"]),
        critical=len([n for n in unread if n.severity == "critical"]),
    )


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: uuid.UUID,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    notification = db.get(Notification, notification_id)
    if (
        notification is None
        or notification.household_id != ctx.household_id
        or (notification.user_id is not None and notification.user_id != ctx.user.id)
    ):
        raise not_found("Notification")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return NotificationOut.model_validate(notification)


@router.post("/read-all", response_model=Message)
def mark_all_read(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    notifications = db.execute(
        select(Notification).where(
            Notification.household_id == ctx.household_id,
            Notification.is_read.is_(False),
            _visible(ctx),
        )
    ).scalars().all()
    for notification in notifications:
        notification.is_read = True
    db.commit()
    return Message(message=f"{len(notifications)} notification(s) marked as read")
