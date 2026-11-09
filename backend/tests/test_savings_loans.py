"""Savings goals and loans stay separate from income/expense reporting."""
from datetime import date
from decimal import Decimal

from tests.conftest import account_balance, create_transaction


def test_savings_contributions_do_not_count_as_expenses(client, admin, shared_account):
    goal = client.post(
        "/api/v1/savings/goals",
        json={
            "name": "Emergency fund",
            "target_amount": 200000,
            "target_date": "2027-03-31",
        },
        headers=admin["headers"],
    )
    assert goal.status_code == 201, goal.text
    goal_id = goal.json()["id"]

    first = client.post(
        f"/api/v1/savings/goals/{goal_id}/contributions",
        json={
            "amount": 50000,
            "contribution_date": date.today().isoformat(),
            "account_id": shared_account["id"],
        },
        headers=admin["headers"],
    )
    assert first.status_code == 201, first.text
    assert Decimal(str(first.json()["current_amount"])) == Decimal("50000")
    assert first.json()["progress_percent"] == 25.0

    summary = client.get("/api/v1/reports/monthly-summary", headers=admin["headers"]).json()
    assert Decimal(str(summary["expenses"])) == Decimal("0")
    assert Decimal(str(summary["savings_contributions"])) == Decimal("50000")

    # The contribution is an allocation, not a cash movement from the account.
    assert account_balance(client, admin["headers"], shared_account["id"]) == Decimal("100000")


def test_savings_goal_marked_achieved_when_target_reached(client, admin):
    goal = client.post(
        "/api/v1/savings/goals",
        json={"name": "Holiday", "target_amount": 100000},
        headers=admin["headers"],
    ).json()
    response = client.post(
        f"/api/v1/savings/goals/{goal['id']}/contributions",
        json={"amount": 100000, "contribution_date": date.today().isoformat()},
        headers=admin["headers"],
    )
    assert response.status_code == 201
    assert response.json()["status"] == "achieved"
    assert response.json()["progress_percent"] == 100.0

    notifications = client.get("/api/v1/notifications", headers=admin["headers"]).json()
    assert any(n["type"] == "goal_achieved" for n in notifications)


def test_loan_repayment_tracks_outstanding_without_household_expense(client, admin, shared_account):
    loan = client.post(
        "/api/v1/loans",
        json={
            "direction": "borrowed",
            "counterparty": "Uncle Verma",
            "principal_amount": 100000,
            "interest_rate": 8.5,
            "start_date": date.today().isoformat(),
            "due_date": "2027-01-31",
        },
        headers=admin["headers"],
    )
    assert loan.status_code == 201, loan.text
    loan_id = loan.json()["id"]
    assert Decimal(str(loan.json()["outstanding_balance"])) == Decimal("100000")

    repayment = client.post(
        f"/api/v1/loans/{loan_id}/repayments",
        json={
            "amount": 25000,
            "principal_component": 20000,
            "interest_component": 5000,
            "repayment_date": date.today().isoformat(),
            "account_id": shared_account["id"],
        },
        headers=admin["headers"],
    )
    assert repayment.status_code == 201, repayment.text
    body = repayment.json()
    assert Decimal(str(body["outstanding_balance"])) == Decimal("80000")
    assert Decimal(str(body["interest_paid"])) == Decimal("5000")
    assert body["repayment_progress_percent"] == 20.0

    summary = client.get("/api/v1/reports/monthly-summary", headers=admin["headers"]).json()
    assert Decimal(str(summary["expenses"])) == Decimal("0")


def test_repayment_components_must_add_up(client, admin):
    loan = client.post(
        "/api/v1/loans",
        json={
            "direction": "lent",
            "counterparty": "Colleague",
            "principal_amount": 50000,
            "start_date": date.today().isoformat(),
        },
        headers=admin["headers"],
    ).json()
    bad = client.post(
        f"/api/v1/loans/{loan['id']}/repayments",
        json={
            "amount": 10000,
            "principal_component": 9000,
            "interest_component": 2000,
            "repayment_date": date.today().isoformat(),
        },
        headers=admin["headers"],
    )
    assert bad.status_code == 400
