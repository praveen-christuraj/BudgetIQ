"""Reusable, household-scoped SQLAlchemy query helpers.

The application talks to the database through SQLAlchemy sessions directly in the
services; this package holds the queries that are needed by more than one module so
they are written once and cannot drift apart (for example pagination, which must
behave identically for transactions, transfers and the audit log).
"""
from app.repositories.pagination import paginate

__all__ = ["paginate"]
