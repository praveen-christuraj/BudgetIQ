"""Seed a demonstration household for local evaluation.

Usage (from the backend directory):

    ../.venv/bin/python scripts/seed_demo.py --reset

It talks to the API through FastAPI's TestClient, so all business rules
(validation, permissions, audit logging) are exercised exactly as a real user
would. NEVER run this against a production database.
"""
import argparse
import calendar
import os
import sys
from datetime import date, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

PASSWORD = "FamilyDemo123"
ADMIN_EMAIL = "priya@sharmafamily.in"
MEMBER_EMAILS = [("Rohan Sharma", "rohan@sharmafamily.in", "Spouse", "#1565C0"),
                 ("Ananya Sharma", "ananya@sharmafamily.in", "Daughter", "#8E24AA")]


def month_start(months_back: int) -> date:
    today = date.today()
    year, month = today.year, today.month
    month -= months_back
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def month_end(months_back: int) -> date:
    start = month_start(months_back)
    return date(start.year, start.month, calendar.monthrange(start.year, start.month)[1])


def day_in(months_back: int, day: int) -> str:
    start = month_start(months_back)
    last = calendar.monthrange(start.year, start.month)[1]
    day = min(day, last)
    if months_back == 0 and day > date.today().day:
        # Keep demo transactions in the past, spread across the current month.
        day = ((day - 1) % max(date.today().day, 1)) + 1
    return date(start.year, start.month, day).isoformat()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Delete the development SQLite database first")
    parser.add_argument("--force", action="store_true", help="Seed even if the household already exists")
    args = parser.parse_args()

    if not os.environ.get("DATABASE_URL"):
        os.environ["DATABASE_URL"] = f"sqlite:///{BASE_DIR / 'family_finance_dev.db'}"

    if os.environ["DATABASE_URL"].startswith("postgresql"):
        print("Refusing to seed a PostgreSQL database. This script is for local SQLite evaluation only.")
        return

    db_path = os.environ["DATABASE_URL"].replace("sqlite:///", "")
    if args.reset and Path(db_path).exists():
        Path(db_path).unlink()
        print(f"Removed {db_path}")

    from fastapi.testclient import TestClient

    from app.core.database import Base, engine
    import app.models  # noqa: F401  (register every table)
    from app.main import app as fastapi_app

    Base.metadata.create_all(bind=engine)

    with TestClient(fastapi_app) as client:
        status = client.get("/api/v1/auth/status").json()
        if status["initialized"] and not args.force:
            print("A household already exists. Re-run with --reset to rebuild the demo database.")
            return

        setup = client.post(
            "/api/v1/auth/setup",
            json={
                "household_name": "Sharma Family",
                "full_name": "Priya Sharma",
                "email": ADMIN_EMAIL,
                "password": PASSWORD,
            },
        )
        setup.raise_for_status()
        admin = setup.json()
        admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}
        print("Created household and administrator")

        members = {}
        for full_name, email, relationship, color in MEMBER_EMAILS:
            created = client.post(
                "/api/v1/members",
                json={
                    "full_name": full_name,
                    "email": email,
                    "password": PASSWORD,
                    "role": "member",
                    "relationship_label": relationship,
                    "display_color": color,
                },
                headers=admin_headers,
            )
            created.raise_for_status()
            login = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
            login.raise_for_status()
            members[email] = {
                "user_id": created.json()["user_id"],
                "headers": {"Authorization": f"Bearer {login.json()['access_token']}"},
                "name": full_name,
            }
            print(f"Created member {full_name}")

        rohan = members["rohan@sharmafamily.in"]
        ananya = members["ananya@sharmafamily.in"]

        # ------------------------------------------------------------------
        # Accounts
        # ------------------------------------------------------------------
        def make_account(name, account_type, owner_id=None, opening=0, institution=None, last4=None):
            response = client.post(
                "/api/v1/accounts",
                json={
                    "name": name,
                    "account_type": account_type,
                    "owner_user_id": owner_id,
                    "opening_balance": opening,
                    "institution": institution,
                    "account_number_last4": last4,
                },
                headers=admin_headers,
            )
            response.raise_for_status()
            return response.json()["id"]

        savings = make_account("Main Savings Account", "savings", opening=250000, institution="State Bank of India", last4="4821")
        cash = make_account("Household Cash", "cash", opening=15000)
        priya_personal = make_account("Priya Personal Savings", "savings", admin["context"]["user"]["id"], 40000, "HDFC Bank")
        rohan_personal = make_account("Rohan Personal Account", "savings", rohan["user_id"], 25000, "ICICI Bank")
        credit_card = make_account("Family Credit Card", "credit_card", None, 0, "Axis Bank", last4="9034")
        print("Created accounts")

        categories = {item["name"]: item for item in client.get("/api/v1/categories", headers=admin_headers).json()}

        # ------------------------------------------------------------------
        # Transactions (current month + previous two months)
        # ------------------------------------------------------------------
        def add_transaction(headers, *, txn_type, amount, day, description, category, account, scope="shared", owner=None, payment="upi", status="posted"):
            response = client.post(
                "/api/v1/transactions",
                json={
                    "transaction_type": txn_type,
                    "scope": scope,
                    "amount": amount,
                    "transaction_date": day,
                    "description": description,
                    "account_id": account,
                    "category_id": categories[category]["id"] if category else None,
                    "owner_user_id": owner,
                    "payment_method": payment,
                    "status": status,
                },
                headers=headers,
            )
            if response.status_code != 201:
                raise SystemExit(f"Transaction failed: {response.status_code} {response.text}")
            return response.json()["transaction"]

        for months_back in (2, 1, 0):
            add_transaction(admin_headers, txn_type="income", amount=95000, day=day_in(months_back, 1), description="Priya salary credited", category="Salary", account=savings, payment="bank_transfer")
            add_transaction(rohan["headers"], txn_type="income", amount=68000, day=day_in(months_back, 1), description="Rohan salary credited", category="Salary", account=savings, payment="bank_transfer")
            add_transaction(admin_headers, txn_type="income", amount=4200, day=day_in(months_back, 18), description="Savings account interest", category="Interest & Dividends", account=savings, payment="bank_transfer")

            add_transaction(admin_headers, txn_type="expense", amount=25000, day=day_in(months_back, 3), description="House rent", category="Rent", account=savings, payment="bank_transfer")
            add_transaction(admin_headers, txn_type="expense", amount=15800, day=day_in(months_back, 6), description="Monthly groceries - Big Bazaar", category="Groceries", account=cash, payment="cash")
            add_transaction(rohan["headers"], txn_type="expense", amount=7200, day=day_in(months_back, 9), description="Groceries and household supplies", category="Groceries", account=credit_card, payment="card")
            add_transaction(admin_headers, txn_type="expense", amount=2850, day=day_in(months_back, 11), description="Electricity bill", category="Electricity", account=savings, payment="upi")
            add_transaction(admin_headers, txn_type="expense", amount=1099, day=day_in(months_back, 5), description="Broadband subscription", category="Internet & Phone", account=savings, payment="card")
            add_transaction(rohan["headers"], txn_type="expense", amount=3600, day=day_in(months_back, 13), description="Fuel", category="Transport", account=cash, payment="cash")
            add_transaction(admin_headers, txn_type="expense", amount=12000, day=day_in(months_back, 7), description="School fees - Ananya", category="Education", account=savings, payment="bank_transfer")
            add_transaction(admin_headers, txn_type="expense", amount=2450, day=day_in(months_back, 16), description="Pharmacy and doctor visit", category="Medical", account=cash, payment="upi")
            add_transaction(rohan["headers"], txn_type="expense", amount=1499, day=day_in(months_back, 20), description="OTT subscription", category="Entertainment", account=credit_card, payment="card")
            add_transaction(admin_headers, txn_type="expense", amount=3000, day=day_in(months_back, 22), description="Household help salary", category="Household Help", account=cash, payment="cash")
            add_transaction(admin_headers, txn_type="expense", amount=1800, day=day_in(months_back, 24), description="Dining out - family dinner", category="Entertainment", account=credit_card, payment="card")

            # Personal expenses (scope independent from account ownership)
            add_transaction(admin_headers, txn_type="expense", amount=2200, day=day_in(months_back, 15), description="Priya - yoga classes", category="Entertainment", account=priya_personal, scope="personal", owner=admin["context"]["user"]["id"], payment="upi")
            add_transaction(rohan["headers"], txn_type="expense", amount=1800, day=day_in(months_back, 17), description="Rohan - cricket club", category="Entertainment", account=rohan_personal, scope="personal", owner=rohan["user_id"], payment="upi")

        # Draft transaction awaiting confirmation
        add_transaction(admin_headers, txn_type="expense", amount=2850, day=date.today().isoformat(), description="Electricity bill (draft)", category="Electricity", account=savings, status="draft")
        print("Created transactions")

        # ------------------------------------------------------------------
        # Transfers (never income/expense)
        # ------------------------------------------------------------------
        for months_back in (1, 0):
            response = client.post(
                "/api/v1/transfers",
                json={
                    "from_account_id": savings,
                    "to_account_id": cash,
                    "amount": 8000,
                    "transfer_date": day_in(months_back, 4),
                    "description": "Monthly cash withdrawal",
                },
                headers=admin_headers,
            )
            response.raise_for_status()
        print("Created transfers")

        # ------------------------------------------------------------------
        # Budgets
        # ------------------------------------------------------------------
        def create_budget(name, start, end, allocations, owner=None, carry=False):
            response = client.post(
                "/api/v1/budgets",
                json={
                    "name": name,
                    "period_type": "monthly",
                    "start_date": start,
                    "end_date": end,
                    "owner_user_id": owner,
                    "carry_forward": carry,
                    "allocations": [
                        {"category_id": categories[category]["id"], "planned_amount": amount}
                        for category, amount in allocations
                    ],
                },
                headers=admin_headers,
            )
            if response.status_code != 201:
                raise SystemExit(f"Budget failed: {response.status_code} {response.text}")
            return response.json()

        allocations = [
            ("Groceries", 25000),
            ("Rent", 25000),
            ("Electricity", 4000),
            ("Internet & Phone", 2500),
            ("Transport", 6000),
            ("Education", 15000),
            ("Medical", 5000),
            ("Entertainment", 6000),
            ("Household Help", 3500),
        ]
        create_budget("Family budget " + month_start(2).strftime("%B %Y"), month_start(2).isoformat(), month_end(2).isoformat(), allocations)
        create_budget("Family budget " + month_start(1).strftime("%B %Y"), month_start(1).isoformat(), month_end(1).isoformat(), allocations)
        create_budget("Family budget " + month_start(0).strftime("%B %Y"), month_start(0).isoformat(), month_end(0).isoformat(), allocations, carry=True)
        create_budget(
            "Rohan personal budget",
            month_start(0).isoformat(),
            month_end(0).isoformat(),
            [("Entertainment", 3000), ("Transport", 4000)],
            owner=rohan["user_id"],
        )
        print("Created budgets")

        # ------------------------------------------------------------------
        # Recurring rules
        # ------------------------------------------------------------------
        def create_rule(name, amount, frequency, next_due, category, account, txn_type="expense", scope="shared", owner=None, responsible=None):
            response = client.post(
                "/api/v1/recurring",
                json={
                    "name": name,
                    "transaction_type": txn_type,
                    "scope": scope,
                    "owner_user_id": owner,
                    "category_id": categories[category]["id"] if category else None,
                    "account_id": account,
                    "responsible_user_id": responsible,
                    "amount": amount,
                    "frequency": frequency,
                    "start_date": month_start(2).isoformat(),
                    "next_due_date": next_due,
                    "payment_method": "bank_transfer",
                    "description": name,
                },
                headers=admin_headers,
            )
            if response.status_code != 201:
                raise SystemExit(f"Recurring rule failed: {response.status_code} {response.text}")
            return response.json()

        create_rule("House rent", 25000, "monthly", (date.today() + timedelta(days=3)).isoformat(), "Rent", savings, responsible=admin["context"]["user"]["id"])
        create_rule("Electricity bill", 2850, "monthly", (date.today() + timedelta(days=5)).isoformat(), "Electricity", savings)
        create_rule("Internet broadband", 1099, "monthly", (date.today() + timedelta(days=8)).isoformat(), "Internet & Phone", savings)
        create_rule("School fees", 12000, "quarterly", (date.today() + timedelta(days=12)).isoformat(), "Education", savings, responsible=admin["context"]["user"]["id"])
        create_rule("Priya salary", 95000, "monthly", month_start(-1).isoformat(), "Salary", savings, txn_type="income")
        print("Created recurring rules")

        # ------------------------------------------------------------------
        # Savings goals
        # ------------------------------------------------------------------
        def create_goal(name, target, target_date, owner=None, contributions=()):
            response = client.post(
                "/api/v1/savings/goals",
                json={
                    "name": name,
                    "target_amount": target,
                    "target_date": target_date,
                    "owner_user_id": owner,
                },
                headers=admin_headers,
            )
            response.raise_for_status()
            goal = response.json()
            for amount, contribution_date in contributions:
                contribution = client.post(
                    f"/api/v1/savings/goals/{goal['id']}/contributions",
                    json={"amount": amount, "contribution_date": contribution_date, "account_id": savings},
                    headers=admin_headers,
                )
                contribution.raise_for_status()
            return goal

        create_goal("Emergency fund", 200000, "2027-03-31", contributions=[(40000, day_in(2, 10)), (20000, day_in(1, 10)), (15000, day_in(0, 5))])
        create_goal("Family holiday", 100000, "2027-06-30", contributions=[(15000, day_in(2, 12)), (10000, day_in(1, 12)), (5000, day_in(0, 8))])
        create_goal("Ananya education fund", 150000, "2028-03-31", owner=ananya["user_id"], contributions=[(25000, day_in(1, 15)), (20000, day_in(0, 6))])
        print("Created savings goals")

        # ------------------------------------------------------------------
        # Loans
        # ------------------------------------------------------------------
        loan = client.post(
            "/api/v1/loans",
            json={
                "direction": "borrowed",
                "counterparty": "Uncle Verma",
                "principal_amount": 100000,
                "interest_rate": 8.5,
                "start_date": day_in(4, 1),
                "due_date": "2027-01-31",
                "account_id": savings,
                "notes": "Family loan for home renovation",
            },
            headers=admin_headers,
        )
        loan.raise_for_status()
        loan_id = loan.json()["id"]
        repayment = client.post(
            f"/api/v1/loans/{loan_id}/repayments",
            json={
                "amount": 25000,
                "principal_component": 20000,
                "interest_component": 5000,
                "repayment_date": day_in(1, 20),
                "account_id": savings,
            },
            headers=admin_headers,
        )
        repayment.raise_for_status()

        lent = client.post(
            "/api/v1/loans",
            json={
                "direction": "lent",
                "counterparty": "Vikram (colleague)",
                "principal_amount": 30000,
                "interest_rate": 0,
                "start_date": day_in(3, 5),
                "due_date": (date.today() + timedelta(days=25)).isoformat(),
                "notes": "Short-term personal loan",
            },
            headers=admin_headers,
        )
        lent.raise_for_status()
        client.post(
            f"/api/v1/loans/{lent.json()['id']}/repayments",
            json={
                "amount": 10000,
                "principal_component": 10000,
                "interest_component": 0,
                "repayment_date": day_in(1, 8),
                "account_id": cash,
            },
            headers=admin_headers,
        ).raise_for_status()
        print("Created loans")

        # Exercise notification generation so the bell badge has content.
        client.get("/api/v1/notifications", headers=admin_headers)

    print()
    print("Demo household ready")
    print("=" * 46)
    print(f"Administrator : {ADMIN_EMAIL} / {PASSWORD}")
    for _name, email, _relationship, _color in MEMBER_EMAILS:
        print(f"Member        : {email} / {PASSWORD}")
    print("Household     : Sharma Family")
    print("=" * 46)


if __name__ == "__main__":
    main()
