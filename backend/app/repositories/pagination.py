"""One pagination implementation for every list endpoint.

`Page` responses are part of the API contract (`items`, `total`, `page`,
`page_size`, `pages`), so the maths lives in a single place instead of being
repeated in each endpoint module.
"""
from typing import Any, Sequence, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.schemas.common import ORMModel, Page

SchemaT = TypeVar("SchemaT", bound=ORMModel)


def paginate(
    db: Session,
    model: Any,
    schema: type[SchemaT],
    *,
    filters: Sequence[Any] = (),
    order_by: Any = None,
    page: int = 1,
    page_size: int = 25,
) -> Page[SchemaT]:
    """Count and fetch one page of `model` rows, returning validated schema objects."""
    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)

    count_query = select(func.count()).select_from(model).where(*filters)
    total = int(db.execute(count_query).scalar_one())

    query: Select = select(model).where(*filters)
    if order_by is not None:
        query = query.order_by(order_by)
    rows = db.execute(query.offset((page - 1) * page_size).limit(page_size)).scalars().all()

    pages = (total + page_size - 1) // page_size if total else 0
    return Page[SchemaT](
        items=[schema.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )
