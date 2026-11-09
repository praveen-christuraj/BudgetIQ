"""Shared schema helpers.

Money is handled as ``Decimal`` everywhere in the backend. For JSON transport it
is serialised as a number with two decimals (computed with Decimal arithmetic).
"""
from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer

Money = Annotated[
    Decimal,
    PlainSerializer(lambda v: float(v or 0), return_type=float, when_used="json"),
]

Rate = Annotated[
    Decimal,
    PlainSerializer(lambda v: float(v or 0), return_type=float, when_used="json"),
]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class Message(BaseModel):
    message: str


class BriefRef(ORMModel):
    id: str
    name: str


class SimpleName(ORMModel):
    id: str
    full_name: str
