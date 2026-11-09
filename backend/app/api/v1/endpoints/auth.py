"""Authentication endpoints: first-run setup, login, refresh, password change."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.constants import DEFAULT_CATEGORIES, ROLE_ADMIN
from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context
from app.core.security import (
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.category import Category, Subcategory
from app.models.household import Household, HouseholdMember, HouseholdSettings, User
from app.schemas.auth import (
    AdminSetupRequest,
    ChangePasswordRequest,
    CurrentUserOut,
    LoginRequest,
    RefreshRequest,
    SetupStatus,
    TokenResponse,
    UserOut,
)
from app.schemas.common import Message
from app.services.audit import log_event

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _membership_for(db: Session, user: User) -> HouseholdMember:
    membership = db.execute(
        select(HouseholdMember)
        .where(HouseholdMember.user_id == user.id, HouseholdMember.is_active.is_(True))
        .limit(1)
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not linked to an active household member profile",
        )
    return membership


def _context_out(db: Session, user: User, membership: HouseholdMember) -> CurrentUserOut:
    household = db.get(Household, membership.household_id)
    return CurrentUserOut(
        user=UserOut.model_validate(user),
        household_id=membership.household_id,
        household_name=household.name if household else "",
        role=membership.role,
        display_color=membership.display_color,
        relationship_label=membership.relationship_label,
    )


def _issue_tokens(db: Session, user: User, membership: HouseholdMember) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(str(user.id), str(membership.household_id)),
        refresh_token=create_refresh_token(str(user.id), str(membership.household_id)),
        expires_in=app_settings.access_token_expire_minutes * 60,
        context=_context_out(db, user, membership),
    )


@router.get("/status", response_model=SetupStatus, summary="Whether initial setup has been completed")
def setup_status(db: Session = Depends(get_db)):
    user_count = db.execute(select(func.count()).select_from(User)).scalar_one()
    household = db.execute(select(Household).limit(1)).scalar_one_or_none()
    return SetupStatus(initialized=user_count > 0, household_name=household.name if household else None)


@router.post("/setup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def initial_setup(payload: AdminSetupRequest, request: Request, db: Session = Depends(get_db)):
    """Create the household and the first administrator.

    Allowed only once. After that, public registration stays disabled and the
    administrator creates the remaining members.
    """
    user_count = db.execute(select(func.count()).select_from(User)).scalar_one()
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Initial setup has already been completed. Ask your administrator for an account.",
        )

    existing_email = db.execute(select(User).where(User.email == payload.email.lower())).scalar_one_or_none()
    if existing_email:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    household = Household(name=payload.household_name.strip())
    db.add(household)
    db.flush()

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        is_active=True,
        last_login_at=datetime.now(timezone.utc),
        password_changed_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()

    membership = HouseholdMember(
        household_id=household.id,
        user_id=user.id,
        role=ROLE_ADMIN,
        relationship_label="Self",
        display_color="#1B5E20",
    )
    db.add(membership)

    db.add(
        HouseholdSettings(
            household_id=household.id,
            currency="INR",
            currency_symbol="\u20b9",
            timezone="Asia/Kolkata",
            budget_warning_threshold=80,
            budget_critical_threshold=100,
        )
    )

    for name, kind, color, subcategories in DEFAULT_CATEGORIES:
        category = Category(
            household_id=household.id, name=name, kind=kind, color=color, is_system=True
        )
        db.add(category)
        db.flush()
        for sub_name in subcategories:
            db.add(Subcategory(category_id=category.id, name=sub_name))

    db.flush()
    log_event(
        db,
        None,
        action="auth.setup",
        entity_type="household",
        entity_id=household.id,
        summary=f"Household '{household.name}' initialised with administrator {user.email}",
        ip_address=client_ip(request),
        household_id=household.id,
        actor_name=user.full_name,
    )
    db.commit()
    db.refresh(user)
    db.refresh(membership)
    return _issue_tokens(db, user, membership)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == payload.email.lower())).scalar_one_or_none()
    ip = client_ip(request)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    now = datetime.now(timezone.utc)
    if user.locked_until:
        locked_until = user.locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > now:
            remaining = int((locked_until - now).total_seconds() // 60) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Try again in {remaining} minute(s).",
            )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated")

    if not verify_password(payload.password, user.password_hash):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= app_settings.max_login_attempts:
            user.locked_until = now + timedelta(minutes=app_settings.login_lockout_minutes)
            user.failed_login_attempts = 0
        membership = db.execute(
            select(HouseholdMember).where(HouseholdMember.user_id == user.id).limit(1)
        ).scalar_one_or_none()
        if membership:
            log_event(
                db,
                None,
                action="auth.login_failed",
                entity_type="user",
                entity_id=user.id,
                summary=f"Failed login attempt for {user.email}",
                ip_address=ip,
                household_id=membership.household_id,
                actor_name=user.email,
            )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    membership = _membership_for(db, user)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    log_event(
        db,
        None,
        action="auth.login",
        entity_type="user",
        entity_id=user.id,
        summary=f"{user.full_name} signed in",
        ip_address=ip,
        household_id=membership.household_id,
        actor_name=user.full_name,
    )
    db.commit()
    db.refresh(user)
    return _issue_tokens(db, user, membership)


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    decoded = decode_token(payload.refresh_token, expected_type=REFRESH_TOKEN_TYPE)
    if not decoded or not decoded.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.get(User, decoded["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is no longer active")

    membership = _membership_for(db, user)
    return _issue_tokens(db, user, membership)


@router.post("/logout", response_model=Message)
def logout(
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    log_event(
        db,
        ctx,
        action="auth.logout",
        entity_type="user",
        entity_id=ctx.user.id,
        summary=f"{ctx.user.full_name} signed out",
    )
    db.commit()
    return Message(message="Signed out")


@router.get("/me", response_model=CurrentUserOut)
def me(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    return _context_out(db, ctx.user, ctx.membership)


@router.post("/change-password", response_model=Message)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, ctx.user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different")

    ctx.user.password_hash = hash_password(payload.new_password)
    ctx.user.password_changed_at = datetime.now(timezone.utc)
    log_event(
        db,
        ctx,
        action="auth.password_changed",
        entity_type="user",
        entity_id=ctx.user.id,
        summary=f"{ctx.user.full_name} changed their password",
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message="Password updated successfully")
