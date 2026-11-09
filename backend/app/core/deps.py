"""Authentication / authorization dependencies.

Every protected endpoint receives a ``CurrentContext`` built from the JWT and
re-verified against the database. Household scope always comes from the
membership row - never from a value supplied by the browser.
"""
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import ROLE_ADMIN
from app.core.database import get_db
from app.core.errors import forbidden
from app.core.security import ACCESS_TOKEN_TYPE, decode_token
from app.models.household import Household, HouseholdMember, HouseholdSettings, User

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentContext:
    user: User
    membership: HouseholdMember
    household: Household
    settings: HouseholdSettings | None

    @property
    def household_id(self) -> UUID:
        return self.household.id

    @property
    def role(self) -> str:
        return self.membership.role

    @property
    def is_admin(self) -> bool:
        return self.membership.role == ROLE_ADMIN

    @property
    def member_id(self) -> UUID:
        return self.user.id


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentContext:
    if credentials is None or not credentials.credentials:
        raise _unauthorized()

    payload = decode_token(credentials.credentials, expected_type=ACCESS_TOKEN_TYPE)
    if not payload or not payload.get("sub"):
        raise _unauthorized("Session expired or token is invalid")

    try:
        user_id = UUID(str(payload["sub"]))
    except (ValueError, TypeError):
        raise _unauthorized("Malformed token subject")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized("User account is inactive")

    query = select(HouseholdMember).where(
        HouseholdMember.user_id == user.id, HouseholdMember.is_active.is_(True)
    )
    household_id = payload.get("hid")
    if household_id:
        try:
            query = query.where(HouseholdMember.household_id == UUID(str(household_id)))
        except (ValueError, TypeError):
            pass

    membership = db.execute(query.limit(1)).scalar_one_or_none()
    if membership is None:
        raise forbidden("You are not an active member of any household")

    household = db.get(Household, membership.household_id)
    if household is None:
        raise _unauthorized("Household no longer exists")

    settings_row = db.execute(
        select(HouseholdSettings).where(HouseholdSettings.household_id == household.id)
    ).scalar_one_or_none()

    return CurrentContext(user=user, membership=membership, household=household, settings=settings_row)


def get_current_user(ctx: CurrentContext = Depends(get_current_context)) -> User:
    return ctx.user


def require_admin(ctx: CurrentContext = Depends(get_current_context)) -> CurrentContext:
    if not ctx.is_admin:
        raise forbidden("Administrator access is required for this action")
    return ctx


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None
