"""Account, category, transaction and transfer schemas."""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import Money, ORMModel, Rate


# --------------------------------------------------------------------------- #
# Accounts
# --------------------------------------------------------------------------- #
class AccountCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    account_type: str
    owner_user_id: UUID | None = None
    institution: str | None = Field(default=None, max_length=120)
    account_number_last4: str | None = Field(default=None, max_length=4)
    opening_balance: Money = 0
    notes: str | None = None


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    account_type: str | None = None
    owner_user_id: UUID | None = None
    institution: str | None = Field(default=None, max_length=120)
    account_number_last4: str | None = Field(default=None, max_length=4)
    opening_balance: Money | None = None
    is_active: bool | None = None
    notes: str | None = None


class AccountOut(ORMModel):
    id: UUID
    name: str
    account_type: str
    owner_user_id: UUID | None = None
    owner_name: str | None = None
    is_shared: bool = False
    institution: str | None = None
    account_number_last4: str | None = None
    opening_balance: Money = 0
    current_balance: Money = 0
    currency: str = "INR"
    is_active: bool = True
    notes: str | None = None
    created_at: datetime


# --------------------------------------------------------------------------- #
# Categories
# --------------------------------------------------------------------------- #
class SubcategoryIn(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=100)


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: str = Field(pattern="^(income|expense)$")
    color: str = Field(default="#607d8b", max_length=20)
    icon: str | None = Field(default=None, max_length=50)
    subcategories: list[str] = Field(default_factory=list)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=20)
    icon: str | None = Field(default=None, max_length=50)
    is_active: bool | None = None


class SubcategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class SubcategoryOut(ORMModel):
    id: UUID
    name: str
    is_active: bool = True


class CategoryOut(ORMModel):
    id: UUID
    name: str
    kind: str
    color: str
    icon: str | None = None
    is_active: bool
    is_system: bool = False
    subcategories: list[SubcategoryOut] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Transactions
# --------------------------------------------------------------------------- #
class TransactionBase(BaseModel):
    transaction_type: str = Field(pattern="^(income|expense)$")
    scope: str = Field(pattern="^(shared|personal)$")
    amount: Money = Field(gt=0)
    transaction_date: date
    description: str = Field(min_length=2, max_length=255)
    account_id: UUID
    category_id: UUID | None = None
    subcategory_id: UUID | None = None
    owner_user_id: UUID | None = None
    payment_method: str = Field(default="cash", max_length=30)
    notes: str | None = None
    status: str = Field(default="posted", pattern="^(draft|posted)$")

    @model_validator(mode="after")
    def check_owner_scope(self):
        if self.scope == "shared" and self.owner_user_id is not None:
            raise ValueError("Shared transactions must not have a personal owner")
        return self


class TransactionCreate(TransactionBase):
    duplicate_of_id: UUID | None = None


class TransactionUpdate(BaseModel):
    transaction_type: str | None = Field(default=None, pattern="^(income|expense)$")
    scope: str | None = Field(default=None, pattern="^(shared|personal)$")
    amount: Money | None = Field(default=None, gt=0)
    transaction_date: date | None = None
    description: str | None = Field(default=None, min_length=2, max_length=255)
    account_id: UUID | None = None
    category_id: UUID | None = None
    subcategory_id: UUID | None = None
    owner_user_id: UUID | None = None
    payment_method: str | None = Field(default=None, max_length=30)
    notes: str | None = None
    status: str | None = Field(default=None, pattern="^(draft|posted)$")


class ReverseRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class AttachmentOut(ORMModel):
    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class TransactionOut(ORMModel):
    id: UUID
    transaction_type: str
    scope: str
    amount: Money
    currency: str
    transaction_date: date
    description: str
    notes: str | None = None
    payment_method: str
    status: str
    account_id: UUID
    account_name: str | None = None
    category_id: UUID | None = None
    category_name: str | None = None
    subcategory_id: UUID | None = None
    subcategory_name: str | None = None
    owner_user_id: UUID | None = None
    owner_name: str | None = None
    created_by: UUID
    created_by_name: str | None = None
    is_editable: bool = False
    reversal_reason: str | None = None
    reversed_at: datetime | None = None
    duplicate_of_id: UUID | None = None
    attachments: list[AttachmentOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DuplicateWarning(BaseModel):
    transaction_id: UUID
    description: str
    amount: Money
    transaction_date: date
    account_id: UUID


class TransactionCreateResult(BaseModel):
    transaction: TransactionOut
    duplicate_warnings: list[DuplicateWarning] = Field(default_factory=list)


class TransactionFilter(BaseModel):
    q: str | None = None
    transaction_type: str | None = None
    scope: str | None = None
    status: str | None = None
    member_id: UUID | None = None
    account_id: UUID | None = None
    category_id: UUID | None = None
    date_from: date | None = None
    date_to: date | None = None
    min_amount: Money | None = None
    max_amount: Money | None = None


# --------------------------------------------------------------------------- #
# Transfers
# --------------------------------------------------------------------------- #
class TransferCreate(BaseModel):
    from_account_id: UUID
    to_account_id: UUID
    amount: Money = Field(gt=0)
    transfer_date: date
    description: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def accounts_differ(self):
        if self.from_account_id == self.to_account_id:
            raise ValueError("Source and destination accounts must be different")
        return self


class TransferOut(ORMModel):
    id: UUID
    from_account_id: UUID
    from_account_name: str | None = None
    to_account_id: UUID
    to_account_name: str | None = None
    amount: Money
    currency: str
    transfer_date: date
    description: str | None = None
    status: str
    created_by: UUID
    created_by_name: str | None = None
    created_at: datetime
