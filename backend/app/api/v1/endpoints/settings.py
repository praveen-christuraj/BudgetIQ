"""Household configuration and system information."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context, require_admin
from app.core.errors import not_found
from app.models.household import Household, HouseholdSettings
from app.schemas.common import Message
from app.schemas.household import HouseholdOut, SettingsOut, SettingsUpdate
from app.services.audit import log_event

router = APIRouter(tags=["Settings"])

APP_VERSION = "1.0.0"


def _settings_row(db: Session, ctx: CurrentContext) -> HouseholdSettings:
    row = ctx.settings
    if row is None:
        row = db.execute(
            select(HouseholdSettings).where(HouseholdSettings.household_id == ctx.household_id)
        ).scalar_one_or_none()
    if row is None:
        row = HouseholdSettings(household_id=ctx.household_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/households/current", response_model=HouseholdOut)
def current_household(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    household = db.get(Household, ctx.household_id)
    if household is None:
        raise not_found("Household")
    return HouseholdOut.model_validate(household)


@router.patch("/households/current", response_model=HouseholdOut)
def rename_household(
    payload: dict,
    request: Request,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    name = str(payload.get("name", "")).strip()
    if len(name) < 2:
        from app.core.errors import bad_request

        raise bad_request("Household name must be at least 2 characters")
    household = db.get(Household, ctx.household_id)
    before = household.name
    household.name = name
    log_event(
        db,
        ctx,
        action="household.rename",
        entity_type="household",
        entity_id=household.id,
        summary=f"Renamed household from '{before}' to '{name}'",
        before={"name": before},
        after={"name": name},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(household)
    return HouseholdOut.model_validate(household)


@router.get("/settings", response_model=SettingsOut)
def get_settings(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    return SettingsOut.model_validate(_settings_row(db, ctx))


@router.patch("/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    request: Request,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _settings_row(db, ctx)
    before = {
        "currency": row.currency,
        "timezone": row.timezone,
        "budget_warning_threshold": float(row.budget_warning_threshold),
        "budget_critical_threshold": float(row.budget_critical_threshold),
    }
    data = payload.model_dump(exclude_unset=True)
    if (
        data.get("budget_warning_threshold") is not None
        and data.get("budget_critical_threshold") is not None
        and data["budget_warning_threshold"] >= data["budget_critical_threshold"]
    ):
        from app.core.errors import bad_request

        raise bad_request("Warning threshold must be lower than the critical threshold")
    for field, value in data.items():
        setattr(row, field, value)
    log_event(
        db,
        ctx,
        action="settings.update",
        entity_type="household_settings",
        entity_id=row.id,
        summary="Updated household settings",
        before=before,
        after={
            "currency": row.currency,
            "timezone": row.timezone,
            "budget_warning_threshold": float(row.budget_warning_threshold),
            "budget_critical_threshold": float(row.budget_critical_threshold),
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(row)
    return SettingsOut.model_validate(row)


@router.get("/settings/system")
def system_info(ctx: CurrentContext = Depends(get_current_context)):
    return {
        "app_name": app_settings.app_name,
        "version": APP_VERSION,
        "environment": app_settings.environment,
        "database": "PostgreSQL" if app_settings.is_postgres else "SQLite (development fallback)",
        "max_upload_mb": app_settings.max_upload_mb,
        "allowed_upload_types": list(app_settings.allowed_upload_types),
        "session_minutes": app_settings.access_token_expire_minutes,
        "refresh_days": app_settings.refresh_token_expire_days,
        "timezone": ctx.settings.timezone if ctx.settings else "Asia/Kolkata",
    }
