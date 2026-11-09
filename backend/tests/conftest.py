"""Pytest fixtures: isolated SQLite database and authenticated clients."""
import os
import tempfile
from datetime import date
from decimal import Decimal

import pytest

# Configure the app for testing BEFORE importing application modules.
_test_dir = tempfile.mkdtemp(prefix="family_finance_tests_")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_dir}/test.db"
os.environ["SECRET_KEY"] = "unit-test-secret-key-that-is-long-enough-123456"
os.environ["ENVIRONMENT"] = "test"
os.environ["UPLOAD_DIR"] = f"{_test_dir}/uploads"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Account,
    AuditLog,
    Budget,
    BudgetAllocation,
    Category,
    Household,
    HouseholdMember,
    HouseholdSettings,
    Loan,
    LoanRepayment,
    Notification,
    RecurringRule,
    SavingsContribution,
    SavingsGoal,
    Subcategory,
    Transaction,
    TransactionAttachment,
    Transfer,
    User,
)

TABLES_IN_DELETE_ORDER = [
    TransactionAttachment,
    Transaction,
    Transfer,
    BudgetAllocation,
    Budget,
    RecurringRule,
    SavingsContribution,
    SavingsGoal,
    LoanRepayment,
    Loan,
    Notification,
    AuditLog,
    Account,
    Subcategory,
    Category,
    HouseholdMember,
    HouseholdSettings,
    Household,
    User,
]

ADMIN = {
    "household_name": "Sharma Family",
    "full_name": "Priya Sharma",
    "email": "priya@example.com",
    "password": "FamilyPass123",
}

MEMBER = {
    "full_name": "Rohan Sharma",
    "email": "rohan@example.com",
    "password": "MemberPass123",
    "role": "member",
    "relationship_label": "Spouse",
    "display_color": "#1565C0",
}


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def client(db_session):
    with TestClient(app) as test_client:
        yield test_client


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def admin(client):
    response = client.post("/api/v1/auth/setup", json=ADMIN)
    assert response.status_code == 201, response.text
    data = response.json()
    return {
        "token": data["access_token"],
        "refresh": data["refresh_token"],
        "headers": _auth_headers(data["access_token"]),
        "user_id": data["context"]["user"]["id"],
        "household_id": data["context"]["household_id"],
    }


@pytest.fixture(scope="function")
def member(client, admin):
    response = client.post("/api/v1/members", json=MEMBER, headers=admin["headers"])
    assert response.status_code == 201, response.text
    data = response.json()
    login = client.post(
        "/api/v1/auth/login", json={"email": MEMBER["email"], "password": MEMBER["password"]}
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    return {
        "id": data["id"],
        "user_id": data["user_id"],
        "token": token,
        "headers": _auth_headers(token),
        "email": MEMBER["email"],
    }


@pytest.fixture(scope="function")
def shared_account(client, admin):
    response = client.post(
        "/api/v1/accounts",
        json={
            "name": "Main Savings Account",
            "account_type": "savings",
            "opening_balance": 100000,
            "institution": "State Bank",
        },
        headers=admin["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture(scope="function")
def cash_account(client, admin):
    response = client.post(
        "/api/v1/accounts",
        json={"name": "Household Cash", "account_type": "cash", "opening_balance": 5000},
        headers=admin["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture(scope="function")
def categories(client, admin):
    response = client.get("/api/v1/categories", headers=admin["headers"])
    assert response.status_code == 200
    data = response.json()
    return {
        "income": next(c for c in data if c["name"] == "Salary"),
        "groceries": next(c for c in data if c["name"] == "Groceries"),
        "transport": next(c for c in data if c["name"] == "Transport"),
        "rent": next(c for c in data if c["name"] == "Rent"),
        "all": data,
    }


def create_transaction(client, headers, **overrides):
    payload = {
        "transaction_type": "expense",
        "scope": "shared",
        "amount": 1000,
        "transaction_date": date.today().isoformat(),
        "description": "Test transaction",
        "account_id": overrides.pop("account_id"),
        "payment_method": "upi",
        "status": "posted",
    }
    payload.update(overrides)
    return client.post("/api/v1/transactions", json=payload, headers=headers)


def account_balance(client, headers, account_id):
    response = client.get("/api/v1/accounts", headers=headers)
    accounts = {a["id"]: a for a in response.json()}
    return Decimal(str(accounts[account_id]["current_balance"]))
