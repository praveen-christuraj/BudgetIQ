"""Budget planning: allocations, actuals, thresholds and carry-forward."""
from datetime import date
from decimal import Decimal

from tests.conftest import create_transaction


def _month_bounds(today=None):
    today = today or date.today()
    return date(today.year, today.month, 1), date(today.year, today.month, 28)


def _create_budget(client, headers, categories, planned_groceries=15000, planned_transport=5000, **overrides):
    start, end = _month_bounds()
    payload = {
        "name": f"Family budget {start:%B %Y}",
        "period_type": "monthly",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "allocations": [
            {"category_id": categories["groceries"]["id"], "planned_amount": planned_groceries},
            {"category_id": categories["transport"]["id"], "planned_amount": planned_transport},
        ],
    }
    payload.update(overrides)
    return client.post("/api/v1/budgets", json=payload, headers=headers)


def test_budget_planned_vs_actual(client, admin, shared_account, categories):
    budget = _create_budget(client, admin["headers"], categories)
    assert budget.status_code == 201, budget.text
    budget_data = budget.json()["budget"]
    assert Decimal(str(budget_data["total_planned"])) == Decimal("20000")

    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=12000,
        category_id=categories["groceries"]["id"], description="Groceries",
    )
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=6000,
        category_id=categories["transport"]["id"], description="Fuel",
    )

    summary = client.get(f"/api/v1/budgets/{budget_data['id']}", headers=admin["headers"]).json()
    allocations = {a["category_name"]: a for a in summary["budget"]["allocations"]}

    groceries = allocations["Groceries"]
    assert Decimal(str(groceries["actual_amount"])) == Decimal("12000")
    assert Decimal(str(groceries["remaining_amount"])) == Decimal("3000")
    assert groceries["utilization_percent"] == 80.0
    assert groceries["status"] == "warning"

    transport = allocations["Transport"]
    assert Decimal(str(transport["remaining_amount"])) == Decimal("-1000")
    assert transport["status"] == "critical"

    assert summary["budget"]["utilization_percent"] == 90.0


def test_budget_uses_only_posted_transactions(client, admin, shared_account, categories):
    budget = _create_budget(client, admin["headers"], categories).json()["budget"]
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=5000,
        category_id=categories["groceries"]["id"], description="Draft groceries", status="draft",
    )
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=3000,
        category_id=categories["groceries"]["id"], description="Posted groceries",
    )
    summary = client.get(f"/api/v1/budgets/{budget['id']}", headers=admin["headers"]).json()
    groceries = next(a for a in summary["budget"]["allocations"] if a["category_name"] == "Groceries")
    assert Decimal(str(groceries["actual_amount"])) == Decimal("3000")


def test_reversed_transaction_stops_counting_towards_budget(client, admin, shared_account, categories):
    budget = _create_budget(client, admin["headers"], categories).json()["budget"]
    txn = create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=4000,
        category_id=categories["groceries"]["id"], description="Groceries",
    ).json()["transaction"]
    client.delete(f"/api/v1/transactions/{txn['id']}", headers=admin["headers"])
    summary = client.get(f"/api/v1/budgets/{budget['id']}", headers=admin["headers"]).json()
    groceries = next(a for a in summary["budget"]["allocations"] if a["category_name"] == "Groceries")
    assert Decimal(str(groceries["actual_amount"])) == Decimal("0")


def test_carry_forward_from_previous_month(client, admin, categories):
    previous_start = date(2026, 1, 1)
    previous_end = date(2026, 1, 31)
    previous = client.post(
        "/api/v1/budgets",
        json={
            "name": "January budget",
            "period_type": "monthly",
            "start_date": previous_start.isoformat(),
            "end_date": previous_end.isoformat(),
            "allocations": [
                {"category_id": categories["groceries"]["id"], "planned_amount": 15000},
            ],
        },
        headers=admin["headers"],
    )
    assert previous.status_code == 201, previous.text

    account = client.post(
        "/api/v1/accounts",
        json={"name": "Carry Cash", "account_type": "cash", "opening_balance": 50000},
        headers=admin["headers"],
    ).json()
    create_transaction(
        client, admin["headers"], account_id=account["id"], amount=12000,
        category_id=categories["groceries"]["id"], description="January groceries",
        transaction_date="2026-01-15",
    )

    carry = client.post(
        "/api/v1/budgets",
        json={
            "name": "February budget",
            "period_type": "monthly",
            "start_date": "2026-02-01",
            "end_date": "2026-02-28",
            "carry_forward": True,
            "allocations": [
                {"category_id": categories["groceries"]["id"], "planned_amount": 15000},
            ],
        },
        headers=admin["headers"],
    )
    assert carry.status_code == 201, carry.text
    allocation = carry.json()["budget"]["allocations"][0]
    assert Decimal(str(allocation["carry_forward_amount"])) == Decimal("3000")
    assert Decimal(str(allocation["planned_amount"])) == Decimal("18000")


def test_member_cannot_create_family_budget(client, member, categories):
    response = _create_budget(client, member["headers"], categories)
    assert response.status_code == 403

    personal = _create_budget(
        client, member["headers"], categories, owner_user_id=member["user_id"], name="Rohan personal budget"
    )
    assert personal.status_code == 201


def test_member_budget_only_counts_own_and_shared_own_expenses(client, admin, member, shared_account, categories):
    budget = _create_budget(
        client, member["headers"], categories, owner_user_id=member["user_id"], name="My budget"
    ).json()["budget"]

    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=4000,
        scope="personal", owner_user_id=admin["user_id"], category_id=categories["groceries"]["id"],
        description="Admin groceries",
    )
    create_transaction(
        client, member["headers"], account_id=shared_account["id"], amount=1000,
        scope="personal", category_id=categories["groceries"]["id"], description="Member groceries",
    )
    create_transaction(
        client, member["headers"], account_id=shared_account["id"], amount=500,
        scope="shared", category_id=categories["transport"]["id"], description="Shared cab",
    )

    summary = client.get(f"/api/v1/budgets/{budget['id']}", headers=member["headers"]).json()
    allocations = {a["category_name"]: a for a in summary["budget"]["allocations"]}
    assert Decimal(str(allocations["Groceries"]["actual_amount"])) == Decimal("1000")
    assert Decimal(str(allocations["Transport"]["actual_amount"])) == Decimal("500")
