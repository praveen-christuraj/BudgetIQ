"""Transfers must move money without affecting income or expense totals."""
from datetime import date
from decimal import Decimal

from tests.conftest import account_balance, create_transaction


def test_transfer_updates_both_accounts_and_not_reports(client, admin, shared_account, cash_account):
    response = client.post(
        "/api/v1/transfers",
        json={
            "from_account_id": shared_account["id"],
            "to_account_id": cash_account["id"],
            "amount": 4000,
            "transfer_date": date.today().isoformat(),
            "description": "Cash withdrawal",
        },
        headers=admin["headers"],
    )
    assert response.status_code == 201, response.text

    assert account_balance(client, admin["headers"], shared_account["id"]) == Decimal("96000")
    assert account_balance(client, admin["headers"], cash_account["id"]) == Decimal("9000")

    summary = client.get("/api/v1/reports/monthly-summary", headers=admin["headers"]).json()
    assert Decimal(str(summary["income"])) == Decimal("0")
    assert Decimal(str(summary["expenses"])) == Decimal("0")
    assert Decimal(str(summary["transfers"])) == Decimal("4000")


def test_transfer_reversal_restores_both_balances(client, admin, shared_account, cash_account):
    transfer = client.post(
        "/api/v1/transfers",
        json={
            "from_account_id": shared_account["id"],
            "to_account_id": cash_account["id"],
            "amount": 2500,
            "transfer_date": date.today().isoformat(),
        },
        headers=admin["headers"],
    ).json()

    reversed_response = client.delete(
        f"/api/v1/transfers/{transfer['id']}", headers=admin["headers"]
    )
    assert reversed_response.status_code == 200
    assert account_balance(client, admin["headers"], shared_account["id"]) == Decimal("100000")
    assert account_balance(client, admin["headers"], cash_account["id"]) == Decimal("5000")


def test_transfer_rejects_same_account_and_insufficient_funds(client, admin, shared_account, cash_account):
    same = client.post(
        "/api/v1/transfers",
        json={
            "from_account_id": shared_account["id"],
            "to_account_id": shared_account["id"],
            "amount": 100,
            "transfer_date": date.today().isoformat(),
        },
        headers=admin["headers"],
    )
    assert same.status_code == 422

    too_much = client.post(
        "/api/v1/transfers",
        json={
            "from_account_id": cash_account["id"],
            "to_account_id": shared_account["id"],
            "amount": 999999,
            "transfer_date": date.today().isoformat(),
        },
        headers=admin["headers"],
    )
    assert too_much.status_code == 400


def test_member_cannot_transfer_from_shared_to_own_without_permission(client, admin, member, shared_account, cash_account):
    personal = client.post(
        "/api/v1/accounts",
        json={"name": "Rohan Personal", "account_type": "savings", "owner_user_id": member["user_id"], "opening_balance": 1000},
        headers=admin["headers"],
    ).json()

    allowed = client.post(
        "/api/v1/transfers",
        json={
            "from_account_id": shared_account["id"],
            "to_account_id": personal["id"],
            "amount": 500,
            "transfer_date": date.today().isoformat(),
        },
        headers=member["headers"],
    )
    # Shared money may be used by household members for their own accounts.
    assert allowed.status_code == 201

    other_personal = client.post(
        "/api/v1/accounts",
        json={"name": "Priya Personal", "account_type": "savings", "owner_user_id": admin["user_id"]},
        headers=admin["headers"],
    ).json()
    forbidden = client.post(
        "/api/v1/transfers",
        json={
            "from_account_id": personal["id"],
            "to_account_id": other_personal["id"],
            "amount": 100,
            "transfer_date": date.today().isoformat(),
        },
        headers=member["headers"],
    )
    assert forbidden.status_code == 403
