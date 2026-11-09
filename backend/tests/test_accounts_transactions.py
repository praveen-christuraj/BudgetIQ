"""Account balance derivation and transaction business rules."""
from datetime import date, timedelta
from decimal import Decimal

from tests.conftest import account_balance, create_transaction


def test_balance_derived_from_posted_transactions(client, admin, shared_account, categories):
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=5000,
        transaction_type="income", category_id=categories["income"]["id"], description="Salary credit",
    )
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=1500.50,
        category_id=categories["groceries"]["id"], description="Weekly groceries",
    )
    balance = account_balance(client, admin["headers"], shared_account["id"])
    assert balance == Decimal("100000") + Decimal("5000") - Decimal("1500.50")
    assert balance == Decimal("103499.50")


def test_draft_transactions_do_not_affect_balance(client, admin, shared_account, categories):
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=2000, status="draft",
        category_id=categories["rent"]["id"], description="Draft rent",
    )
    assert account_balance(client, admin["headers"], shared_account["id"]) == Decimal("100000")


def test_personal_expense_from_shared_account_is_personal_scope(client, admin, member, shared_account, categories):
    response = create_transaction(
        client, member["headers"], account_id=shared_account["id"], amount=900,
        scope="personal", category_id=categories["groceries"]["id"], description="My coffee beans",
    )
    assert response.status_code == 201, response.text
    txn = response.json()["transaction"]
    assert txn["scope"] == "personal"
    assert txn["owner_user_id"] == member["user_id"]

    # The shared account balance reflects the payment...
    assert account_balance(client, admin["headers"], shared_account["id"]) == Decimal("99100")
    # ...while the scope stays personal for reporting.
    dashboard = client.get(
        "/api/v1/reports/category-expenses", headers=admin["headers"]
    ).json()
    assert dashboard[0]["amount"] == 900

    scope_report = client.get(
        "/api/v1/reports/shared-vs-personal", headers=admin["headers"]
    ).json()
    assert Decimal(str(scope_report["shared_expenses"])) == Decimal("0")
    assert Decimal(str(scope_report["personal_expenses"])) == Decimal("900")


def test_member_cannot_see_other_members_personal_transactions(client, admin, member, shared_account, categories):
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=700, scope="personal",
        owner_user_id=admin["user_id"], category_id=categories["groceries"]["id"],
        description="Admin private expense",
    )
    listing = client.get("/api/v1/transactions", headers=member["headers"]).json()
    descriptions = [t["description"] for t in listing["items"]]
    assert "Admin private expense" not in descriptions

    admin_listing = client.get("/api/v1/transactions", headers=admin["headers"]).json()
    assert "Admin private expense" in [t["description"] for t in admin_listing["items"]]


def test_member_cannot_edit_another_members_personal_transaction(client, admin, member, shared_account, categories):
    created = create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=700, scope="personal",
        owner_user_id=admin["user_id"], category_id=categories["groceries"]["id"],
        description="Admin private expense",
    ).json()["transaction"]

    forbidden_update = client.put(
        f"/api/v1/transactions/{created['id']}",
        json={"amount": 1},
        headers=member["headers"],
    )
    assert forbidden_update.status_code == 403
    forbidden_delete = client.delete(
        f"/api/v1/transactions/{created['id']}", headers=member["headers"]
    )
    assert forbidden_delete.status_code == 403




def test_own_transaction_update_is_audited_and_balance_moves(client, admin, member, shared_account, categories):
    created = create_transaction(
        client, member["headers"], account_id=shared_account["id"], amount=500,
        category_id=categories["groceries"]["id"], description="Groceries run",
    ).json()["transaction"]

    updated = client.put(
        f"/api/v1/transactions/{created['id']}",
        json={"amount": 750},
        headers=member["headers"],
    )
    assert updated.status_code == 200
    assert Decimal(str(updated.json()["amount"])) == Decimal("750")
    assert account_balance(client, admin["headers"], shared_account["id"]) == Decimal("99250")

    audit = client.get("/api/v1/audit", params={"action": "transaction.update"}, headers=admin["headers"]).json()
    assert audit["total"] == 1
    entry = audit["items"][0]
    assert '"amount": "500.00"' in entry["before_json"]
    assert '"amount": "750.00"' in entry["after_json"]


def test_reversal_restores_balance_and_preserves_history(client, admin, shared_account, categories):
    created = create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=2500,
        category_id=categories["rent"]["id"], description="Rent paid",
    ).json()["transaction"]
    assert account_balance(client, admin["headers"], shared_account["id"]) == Decimal("97500")

    deleted = client.delete(f"/api/v1/transactions/{created['id']}", headers=admin["headers"])
    assert deleted.status_code == 200
    assert account_balance(client, admin["headers"], shared_account["id"]) == Decimal("100000")

    # The record is preserved, only flagged as reversed.
    reversed_txn = client.get(f"/api/v1/transactions/{created['id']}", headers=admin["headers"]).json()
    assert reversed_txn["status"] == "reversed"
    assert reversed_txn["reversal_reason"]

    reporting = client.get("/api/v1/reports/category-expenses", headers=admin["headers"]).json()
    assert reporting == []


def test_duplicate_transaction_warning(client, admin, shared_account, categories):
    payload = dict(
        account_id=shared_account["id"],
        amount=1200,
        category_id=categories["groceries"]["id"],
        description="Big Bazaar",
    )
    first = create_transaction(client, admin["headers"], **payload)
    assert first.status_code == 201
    assert first.json()["duplicate_warnings"] == []

    second = create_transaction(client, admin["headers"], **payload)
    assert second.status_code == 201
    warnings = second.json()["duplicate_warnings"]
    assert len(warnings) == 1
    assert warnings[0]["transaction_id"] == first.json()["transaction"]["id"]


def test_category_kind_must_match_transaction_type(client, admin, shared_account, categories):
    response = create_transaction(
        client, admin["headers"], account_id=shared_account["id"],
        transaction_type="income", category_id=categories["groceries"]["id"],
        description="Wrong category",
    )
    assert response.status_code == 400


def test_member_cannot_create_personal_transaction_for_someone_else(client, member, admin, shared_account, categories):
    response = create_transaction(
        client, member["headers"], account_id=shared_account["id"], scope="personal",
        owner_user_id=admin["user_id"], category_id=categories["groceries"]["id"],
        description="Not mine",
    )
    assert response.status_code == 403
