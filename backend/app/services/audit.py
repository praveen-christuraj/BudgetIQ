"""Append-only audit trail helpers."""
import json
from typing import Any

from sqlalchemy.orm import Session

from app.core.deps import CurrentContext
from app.models.audit import AuditLog


def _serialise(value: Any) -> str | None:
    if value is None:
        return None
    try:
        return json.dumps(value, default=str, ensure_ascii=False)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return json.dumps({"unserialisable": str(value)})


def log_event(
    db: Session,
    ctx: CurrentContext | None,
    *,
    action: str,
    entity_type: str,
    entity_id: Any = None,
    summary: str,
    before: dict | None = None,
    after: dict | None = None,
    ip_address: str | None = None,
    household_id=None,
    actor_name: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        household_id=ctx.household_id if ctx else household_id,
        actor_user_id=ctx.user.id if ctx else None,
        actor_name=ctx.user.full_name if ctx else (actor_name or "system"),
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        summary=summary[:300],
        before_json=_serialise(before),
        after_json=_serialise(after),
        ip_address=ip_address,
    )
    db.add(entry)
    return entry


def snapshot(model, fields: list[str]) -> dict:
    """Plain dict snapshot used for before/after audit payloads."""
    result = {}
    for field in fields:
        value = getattr(model, field, None)
        if hasattr(value, "isoformat"):
            value = value.isoformat()
        elif hasattr(value, "hex") and not isinstance(value, str):
            value = str(value)
        elif value is not None and hasattr(value, "as_tuple"):
            value = str(value)
        result[field] = value
    return result
