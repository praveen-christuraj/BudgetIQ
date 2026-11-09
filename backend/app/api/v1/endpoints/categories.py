"""Categories and subcategories (administrator managed)."""
import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context, require_admin
from app.core.errors import bad_request, not_found
from app.models.category import Category, Subcategory
from app.models.transaction import Transaction
from app.schemas.common import Message
from app.schemas.finance import CategoryCreate, CategoryOut, CategoryUpdate, SubcategoryCreate
from app.services.audit import log_event

router = APIRouter(prefix="/categories", tags=["Categories"])


def _category_out(category: Category) -> CategoryOut:
    return CategoryOut.model_validate(category)


@router.get("", response_model=list[CategoryOut])
def list_categories(
    kind: str | None = None,
    include_inactive: bool = False,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    query = select(Category).where(Category.household_id == ctx.household_id).options(
        selectinload(Category.subcategories)
    )
    if kind:
        query = query.where(Category.kind == kind)
    if not include_inactive:
        query = query.where(Category.is_active.is_(True))
    categories = db.execute(query.order_by(Category.kind.desc(), Category.name)).scalars().all()
    return [_category_out(category) for category in categories]


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    request: Request,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    duplicate = db.execute(
        select(Category).where(
            Category.household_id == ctx.household_id,
            func.lower(Category.name) == payload.name.strip().lower(),
            Category.kind == payload.kind,
        )
    ).scalar_one_or_none()
    if duplicate:
        raise bad_request("A category with this name already exists")

    category = Category(
        household_id=ctx.household_id,
        name=payload.name.strip(),
        kind=payload.kind,
        color=payload.color,
        icon=payload.icon,
    )
    db.add(category)
    db.flush()
    for sub_name in payload.subcategories:
        if sub_name.strip():
            db.add(Subcategory(category_id=category.id, name=sub_name.strip()))

    log_event(
        db,
        ctx,
        action="category.create",
        entity_type="category",
        entity_id=category.id,
        summary=f"Created {category.kind} category '{category.name}'",
        after={"name": category.name, "kind": category.kind},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(category)
    return _category_out(category)


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    request: Request,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    category = db.get(Category, category_id)
    if category is None or category.household_id != ctx.household_id:
        raise not_found("Category")
    before = {"name": category.name, "color": category.color, "is_active": category.is_active}
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        data["name"] = data["name"].strip()
    for field, value in data.items():
        setattr(category, field, value)
    log_event(
        db,
        ctx,
        action="category.update",
        entity_type="category",
        entity_id=category.id,
        summary=f"Updated category '{category.name}'",
        before=before,
        after={"name": category.name, "color": category.color, "is_active": category.is_active},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(category)
    return _category_out(category)


@router.post("/{category_id}/subcategories", response_model=CategoryOut, status_code=201)
def add_subcategory(
    category_id: uuid.UUID,
    payload: SubcategoryCreate,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    category = db.get(Category, category_id)
    if category is None or category.household_id != ctx.household_id:
        raise not_found("Category")
    clean = payload.name.strip()
    if not clean:
        raise bad_request("Subcategory name is required")
    existing = db.execute(
        select(Subcategory).where(Subcategory.category_id == category.id, Subcategory.name == clean)
    ).scalar_one_or_none()
    if existing:
        raise bad_request("This subcategory already exists")
    db.add(Subcategory(category_id=category.id, name=clean))
    db.commit()
    db.refresh(category)
    return _category_out(category)


@router.delete("/{category_id}/subcategories/{subcategory_id}", response_model=Message)
def delete_subcategory(
    category_id: uuid.UUID,
    subcategory_id: uuid.UUID,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    subcategory = db.get(Subcategory, subcategory_id)
    if subcategory is None or subcategory.category_id != category_id:
        raise not_found("Subcategory")
    category = db.get(Category, category_id)
    if category is None or category.household_id != ctx.household_id:
        raise not_found("Category")
    db.delete(subcategory)
    db.commit()
    return Message(message="Subcategory removed")


@router.delete("/{category_id}", response_model=Message)
def delete_category(
    category_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    category = db.get(Category, category_id)
    if category is None or category.household_id != ctx.household_id:
        raise not_found("Category")

    used = db.execute(
        select(func.count()).select_from(Transaction).where(Transaction.category_id == category.id)
    ).scalar_one()
    if used:
        category.is_active = False
        message = "Category is used by transactions and was deactivated instead of deleted."
    else:
        db.delete(category)
        message = "Category deleted."

    log_event(
        db,
        ctx,
        action="category.delete",
        entity_type="category",
        entity_id=category_id,
        summary=f"{message} ({category.name})",
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message=message)
