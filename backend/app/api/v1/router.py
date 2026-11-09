"""Aggregate API router for version 1 of the Family Finance Manager API."""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    accounts,
    audit,
    auth,
    budgets,
    categories,
    loans,
    members,
    notifications,
    recurring,
    reports,
    savings,
    settings,
    transactions,
    transfers,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(members.router)
api_router.include_router(accounts.router)
api_router.include_router(categories.router)
api_router.include_router(transactions.router)
api_router.include_router(transfers.router)
api_router.include_router(budgets.router)
api_router.include_router(recurring.router)
api_router.include_router(savings.router)
api_router.include_router(loans.router)
api_router.include_router(reports.router)
api_router.include_router(notifications.router)
api_router.include_router(audit.router)
api_router.include_router(settings.router)
