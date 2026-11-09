"""Family member and settings schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class MemberCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="member", pattern="^(admin|member)$")
    relationship_label: str | None = Field(default=None, max_length=50)
    display_color: str = Field(default="#1976d2", max_length=20)


class MemberUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    role: str | None = Field(default=None, pattern="^(admin|member)$")
    relationship_label: str | None = Field(default=None, max_length=50)
    display_color: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None


class MemberPasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class MemberOut(BaseModel):
    id: UUID
    user_id: UUID
    household_id: UUID
    full_name: str
    email: EmailStr
    role: str
    relationship_label: str | None = None
    display_color: str
    is_active: bool
    joined_at: datetime
    last_login_at: datetime | None = None


class MemberSummary(MemberOut):
    account_count: int = 0
    transaction_count: int = 0
    total_income: float = 0
    total_expenses: float = 0


class HouseholdOut(BaseModel):
    id: UUID
    name: str
    created_at: datetime


class SettingsOut(ORMModel):
    household_id: UUID
    currency: str
    currency_symbol: str
    timezone: str
    date_format: str
    fiscal_year_start_month: int
    budget_warning_threshold: float
    budget_critical_threshold: float
    notification_lead_days: int
    backup_retention_days: int


class SettingsUpdate(BaseModel):
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    currency_symbol: str | None = Field(default=None, max_length=4)
    timezone: str | None = Field(default=None, max_length=64)
    date_format: str | None = Field(default=None, max_length=20)
    fiscal_year_start_month: int | None = Field(default=None, ge=1, le=12)
    budget_warning_threshold: float | None = Field(default=None, ge=1, le=100)
    budget_critical_threshold: float | None = Field(default=None, ge=50, le=200)
    notification_lead_days: int | None = Field(default=None, ge=1, le=60)
    backup_retention_days: int | None = Field(default=None, ge=1, le=365)
