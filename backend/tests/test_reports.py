"""Dashboard, report calculations and Excel/PDF export."""
from datetime import date
from decimal import Decimal

from tests.conftest import create_transaction


def _seed(client, admin, member, shared_account, categories):
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=90000,
        transaction_type="income", category_id=categories["income"]["id"], description="Priya salary",
    )
    create_transaction(
        client, member["headers"], account_id=shared_account["id"], amount=40000,
        transaction_type="income", category_id=categories["income"]["id"], description="Rohan salary",
    )
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=15000,
        category_id=categories["groceries"]["id"], description="Groceries",
    )
    create_transaction(
        client, member["headers"], account_id=shared_account["id"], amount=5000,
        category_id=categories["transport"]["id"], description="Fuel",
    )


def test_dashboard_family_and_personal_views(client, admin, member, shared_account, categories):
    _seed(client, admin, member, shared_account, categories)

    family = client.get("/api/v1/reports/dashboard", params={"view": "family"}, headers=admin["headers"]).json()
    assert Decimal(str(family["totals"]["total_income"])) == Decimal("130000")
    assert Decimal(str(family["totals"]["total_expenses"])) == Decimal("20000")
    assert Decimal(str(family["totals"]["remaining_cash_flow"])) == Decimal("110000")
    assert len(family["trend"]) == 6
    assert family["category_breakdown"][0]["name"] == "Groceries"

    personal = client.get("/api/v1/reports/dashboard", params={"view": "personal"}, headers=member["headers"]).json()
    assert Decimal(str(personal["totals"]["total_income"])) == Decimal("40000")
    assert Decimal(str(personal["totals"]["total_expenses"])) == Decimal("5000")


def test_annual_summary_totals_match_months(client, admin, shared_account, categories):
    _seed(client, admin, admin, shared_account, categories)
    summary = client.get("/api/v1/reports/annual-summary", headers=admin["headers"]).json()
    assert len(summary["months"]) == 12
    assert Decimal(str(summary["total_income"])) == Decimal("130000")
    assert Decimal(str(summary["total_expenses"])) == Decimal("20000")
    assert Decimal(str(summary["net"])) == Decimal("110000")


def test_member_report_is_limited_to_self(client, admin, member, shared_account, categories):
    _seed(client, admin, member, shared_account, categories)
    rows = client.get("/api/v1/reports/member-summary", headers=member["headers"]).json()
    assert len(rows) == 1
    assert rows[0]["member"] == "Rohan Sharma"

    admin_rows = client.get("/api/v1/reports/member-summary", headers=admin["headers"]).json()
    assert len(admin_rows) == 2


def test_account_balance_report_derives_balance(client, admin, shared_account, categories):
    _seed(client, admin, admin, shared_account, categories)
    rows = client.get("/api/v1/reports/account-balances", headers=admin["headers"]).json()
    row = next(r for r in rows if r["account_id"] == shared_account["id"])
    assert Decimal(str(row["income"])) == Decimal("130000")
    assert Decimal(str(row["expenses"])) == Decimal("20000")
    assert Decimal(str(row["current_balance"])) == Decimal("210000")


def test_excel_export(client, admin, shared_account, categories):
    _seed(client, admin, admin, shared_account, categories)
    response = client.get(
        "/api/v1/reports/export",
        params={"report": "annual-summary", "format": "xlsx"},
        headers=admin["headers"],
    )
    assert response.status_code == 200
    assert "spreadsheetml" in response.headers["content-type"]
    assert response.content[:2] == b"PK"  # zip container of an xlsx file


def test_pdf_export(client, admin, shared_account, categories):
    _seed(client, admin, admin, shared_account, categories)
    response = client.get(
        "/api/v1/reports/export",
        params={"report": "category-expenses", "format": "pdf"},
        headers=admin["headers"],
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


_REPORT_TYPES = [
    "monthly-summary",
    "annual-summary",
    "category-expenses",
    "member-summary",
    "shared-vs-personal",
    "budget-vs-actual",
    "savings-growth",
    "account-balances",
    "outstanding-loans",
    "recurring-schedule",
    "transactions",
]


def test_monthly_income_expenditure_report(client, admin, member, shared_account, categories):
    _seed(client, admin, member, shared_account, categories)
    month = date.today().strftime("%Y-%m")
    response = client.get(
        "/api/v1/reports/export",
        params={"report": "monthly-summary", "format": "pdf", "date_from": date.today().replace(day=1).isoformat()},
        headers=admin["headers"],
    )
    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"
    summary = client.get(
        "/api/v1/reports/monthly-summary",
        params={"year": date.today().year, "month": date.today().month},
        headers=admin["headers"],
    ).json()
    assert summary["month"] == month
    assert Decimal(str(summary["income"])) == Decimal("130000")


def test_shared_vs_personal_report_and_exports(client, admin, member, shared_account, categories):
    _seed(client, admin, member, shared_account, categories)

    scope = client.get(
        "/api/v1/reports/shared-vs-personal",
        params={"date_from": date.today().replace(day=1).isoformat()},
        headers=admin["headers"],
    )
    assert scope.status_code == 200
    body = scope.json()
    assert Decimal(str(body["shared_expenses"])) == Decimal("20000")

    for fmt, prefix in (("xlsx", b"PK"), ("pdf", b"%PDF")):
        export = client.get(
            "/api/v1/reports/export",
            params={"report": "shared-vs-personal", "format": fmt},
            headers=admin["headers"],
        )
        assert export.status_code == 200, export.text
        assert export.content[: len(prefix)] == prefix


def test_transaction_register_report(client, admin, member, shared_account, categories):
    _seed(client, admin, member, shared_account, categories)
    response = client.get("/api/v1/reports/transactions", headers=admin["headers"])
    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 4
    assert Decimal(str(body["total_income"])) == Decimal("130000")
    assert Decimal(str(body["total_expenses"])) == Decimal("20000")
    assert all(row["scope"] in {"shared", "personal"} for row in body["rows"])


def test_every_report_type_is_exportable(client, admin, shared_account, categories):
    _seed(client, admin, admin, shared_account, categories)
    # Blueprint 1.10 lists ten report types; monthly income/expenditure is the
    # first of them, the transaction register is the searchable export backup.
    assert len(_REPORT_TYPES) == 11
    for report in _REPORT_TYPES:
        response = client.get(
            "/api/v1/reports/export",
            params={"report": report, "format": "xlsx"},
            headers=admin["headers"],
        )
        assert response.status_code == 200, f"{report} failed: {response.text}"
        assert response.content[:2] == b"PK", f"{report} did not produce an xlsx file"


_REPORT_TYPES = [
    "monthly-summary",
    "annual-summary",
    "category-expenses",
    "member-summary",
    "shared-vs-personal",
    "budget-vs-actual",
    "savings-growth",
    "account-balances",
    "outstanding-loans",
    "recurring-schedule",
    "transactions",
]


def test_unknown_report_is_rejected(client, admin):
    response = client.get(
        "/api/v1/reports/export", params={"report": "nope"}, headers=admin["headers"]
    )
    assert response.status_code == 400


def test_notifications_include_budget_warning(client, admin, shared_account, categories):
    start = date.today().replace(day=1)
    client.post(
        "/api/v1/budgets",
        json={
            "name": "This month",
            "period_type": "monthly",
            "start_date": start.isoformat(),
            "end_date": date.today().replace(day=28).isoformat(),
            "allocations": [{"category_id": categories["groceries"]["id"], "planned_amount": 10000}],
        },
        headers=admin["headers"],
    )
    create_transaction(
        client, admin["headers"], account_id=shared_account["id"], amount=9500,
        category_id=categories["groceries"]["id"], description="Groceries",
    )
    notifications = client.get("/api/v1/notifications", headers=admin["headers"]).json()
    assert any(n["type"] in {"budget_warning", "budget_exceeded"} for n in notifications)

    counts = client.get("/api/v1/notifications/count", headers=admin["headers"]).json()
    assert counts["unread"] >= 1
