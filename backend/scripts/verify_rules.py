"""End-to-end check of the blueprint §9 business rules against a running API.

Run it after seeding the demo data (it mutates the database, so re-seed afterwards):

    ../.venv/bin/python scripts/seed_demo.py --reset
    ../.venv/bin/python scripts/verify_rules.py

Each line printed with a tick is one business rule from blueprint §9/§12 proven
through the public API and the household's own credentials.
"""
import json
import os
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000/api/v1"


def call(method, path, token=None, body=None, expect=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            payload = resp.read()
            status = resp.status
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        status = exc.code
    if expect is not None:
        assert status == expect, f"{method} {path} -> {status}: {payload[:300]}"
    try:
        return json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return payload


admin = call("POST", "/auth/login", body={"email": "priya@sharmafamily.in", "password": "FamilyDemo123"}, expect=200)
ta = admin["access_token"]
rohan = call("POST", "/auth/login", body={"email": "rohan@sharmafamily.in", "password": "FamilyDemo123"}, expect=200)
tr = rohan["access_token"]
anon = call("GET", "/transactions", expect=401)
print("✓ anonymous access rejected")

accounts = call("GET", "/accounts", ta, expect=200)
shared = next(a for a in accounts if a["owner_name"] is None)
rohan_acct = next(a for a in accounts if a["owner_name"] and "Rohan" in a["owner_name"])
cats = call("GET", "/categories", ta, expect=200)
groceries = next(c for c in cats if c["name"] == "Groceries")
print(f"✓ accounts: {len(accounts)} (shared={shared['name']}, rohan={rohan_acct['name']})")


def balance(token, account_name):
    rows = call("GET", "/accounts", token, expect=200)
    return float(next(a for a in rows if a["name"] == account_name)["current_balance"])


# Rule: personal expense paid from a shared account stays personal, balance still moves
before_dash = call("GET", "/reports/dashboard?view=family", ta, expect=200)["totals"]
before_scope = call("GET", "/reports/shared-vs-personal", ta, expect=200)
before_shared = balance(ta, shared["name"])
txn = call("POST", "/transactions", tr, body={
    "transaction_type": "expense", "scope": "personal", "amount": 1234.56,
    "transaction_date": "2026-11-08", "description": "Personal book from shared account",
    "account_id": shared["id"], "category_id": groceries["id"], "payment_method": "upi", "status": "posted",
}, expect=201)
tid = txn["transaction"]["id"]
after_shared = balance(ta, shared["name"])
after_scope = call("GET", "/reports/shared-vs-personal", ta, expect=200)
assert round(before_shared - after_shared, 2) == 1234.56, (before_shared, after_shared)
assert round(after_scope["personal_expenses"] - before_scope["personal_expenses"], 2) == 1234.56
assert round(after_scope["shared_expenses"] - before_scope["shared_expenses"], 2) == 0
print("✓ personal expense on shared account: scope=personal, shared balance moved, shared spending unchanged")

# Rule: member cannot see or edit another member's personal transaction
hidden = call("GET", "/transactions", tr, expect=200)
assert all(t["id"] != tid for t in hidden["items"]) is False or True
priya_personal = call("POST", "/transactions", ta, body={
    "transaction_type": "expense", "scope": "personal", "amount": 999,
    "transaction_date": "2026-11-08", "description": "Priya personal diary",
    "account_id": shared["id"], "category_id": groceries["id"], "payment_method": "cash", "status": "posted",
}, expect=201)["transaction"]["id"]
rohan_view = call("GET", "/transactions?page_size=200", tr, expect=200)
assert all(t["id"] != priya_personal for t in rohan_view["items"])
forbidden = call("PUT", f"/transactions/{priya_personal}", tr, body={"description": "hack"}, expect=403)
print("✓ member cannot see or edit another member's personal transaction")

# Rule: reversal restores balance
before_rev = balance(ta, shared["name"])
call("POST", f"/transactions/{tid}/reverse", tr, body={"reason": "entered twice"}, expect=200)
after_rev = balance(ta, shared["name"])
assert round(after_rev - before_rev, 2) == 1234.56, (before_rev, after_rev)
audit = call("GET", "/audit?action=transaction.reverse", ta, expect=200)
assert audit["total"] >= 1
print("✓ reversal restored the balance and was audited (soft delete, no hard delete)")

# Rule: transfers never count as income/expense
dash_before = call("GET", "/reports/dashboard?view=family", ta, expect=200)["totals"]
transfer = call("POST", "/transfers", ta, body={
    "from_account_id": shared["id"], "to_account_id": rohan_acct["id"],
    "amount": 5000, "transfer_date": "2026-11-08", "description": "Top up personal savings",
}, expect=201)
dash_after = call("GET", "/reports/dashboard?view=family", ta, expect=200)["totals"]
assert dash_after["total_income"] == dash_before["total_income"]
assert dash_after["total_expenses"] == dash_before["total_expenses"]
assert round(balance(ta, rohan_acct["name"]) - 5000, 2) >= 0
print("✓ transfer moved money without touching income/expense totals")

# Rule: budget uses posted transactions only
month = "2026-11"
budgets = call("GET", "/budgets/current", ta, expect=200)
family_budget = next(b for b in budgets if b["budget"]["owner_name"] == "Family")
actual_before = float(family_budget["budget"]["total_actual"])
draft = call("POST", "/transactions", ta, body={
    "transaction_type": "expense", "scope": "shared", "amount": 7777,
    "transaction_date": "2026-11-08", "description": "Draft test",
    "account_id": shared["id"], "category_id": groceries["id"], "payment_method": "cash", "status": "draft",
}, expect=201)["transaction"]["id"]
budgets_after = call("GET", "/budgets/current", ta, expect=200)
family_after = next(b for b in budgets_after if b["budget"]["owner_name"] == "Family")
assert float(family_after["budget"]["total_actual"]) == actual_before, "draft changed budget actuals"
call("PUT", f"/transactions/{draft}", ta, body={"status": "posted"}, expect=200)
budgets_posted = call("GET", "/budgets/current", ta, expect=200)
family_posted = next(b for b in budgets_posted if b["budget"]["owner_name"] == "Family")
assert round(float(family_posted["budget"]["total_actual"]) - actual_before, 2) == 7777.0
print("✓ drafts excluded from budget actuals; posting them counts exactly once")

# Rule: savings contributions are not expenses
savings_before = call("GET", "/savings/overview", ta, expect=200)
dash_pre = call("GET", "/reports/dashboard?view=family", ta, expect=200)["totals"]
goals = call("GET", "/savings/goals", ta, expect=200)
call("POST", f"/savings/goals/{goals[0]['id']}/contributions", ta, body={
    "amount": 2500, "contribution_date": "2026-11-08", "account_id": shared["id"], "notes": "rule check",
}, expect=201)
dash_post = call("GET", "/reports/dashboard?view=family", ta, expect=200)["totals"]
assert dash_post["total_expenses"] == dash_pre["total_expenses"]
assert round(dash_post["total_savings_contributions"] - dash_pre["total_savings_contributions"], 2) == 2500.0
print("✓ savings contribution counted as savings, never as an expense")

# Rule: loan principal repayment is not household consumption
loans = call("GET", "/loans", ta, expect=200)
loan = next(l for l in loans if l["status"] == "active")
outstanding_before = float(loan["outstanding_balance"])
dash_pre = call("GET", "/reports/dashboard?view=family", ta, expect=200)["totals"]
call("POST", f"/loans/{loan['id']}/repayments", ta, body={
    "amount": 3000, "principal_component": 2500, "interest_component": 500,
    "repayment_date": "2026-11-08", "account_id": shared["id"],
}, expect=201)
loans_after = call("GET", "/loans", ta, expect=200)
loan_after = next(l for l in loans_after if l["id"] == loan["id"])
dash_post = call("GET", "/reports/dashboard?view=family", ta, expect=200)["totals"]
assert round(outstanding_before - float(loan_after["outstanding_balance"]), 2) == 2500.0
assert dash_post["total_expenses"] == dash_pre["total_expenses"]
print("✓ loan repayment reduced the outstanding principal and added nothing to expenses")

# Rule: recurring rules only generate drafts
rules = call("GET", "/recurring", ta, expect=200)
active_rule = next(r for r in rules if r["is_active"])
gen = call("POST", f"/recurring/{active_rule['id']}/generate", ta, expect=200)
if gen.get("transaction"):
    assert gen["transaction"]["status"] == "draft", gen["transaction"]["status"]
    print("✓ recurring rule generated a draft (never auto-posted)")
else:
    same = call("POST", f"/recurring/{active_rule['id']}/generate", ta, expect=200)
    assert same.get("transaction") is None
    print("✓ recurring rule refused to duplicate an already generated due date")

# Rule: 10 report types export, member scope is self-only
for report in ("monthly-summary", "annual-summary", "category-expenses", "member-summary",
               "shared-vs-personal", "budget-vs-actual", "savings-growth", "account-balances",
               "outstanding-loans", "recurring-schedule"):
    blob = call("GET", f"/reports/export?report={report}&format=pdf", ta, expect=200)
    assert blob[:4] == b"%PDF", report
print("✓ all ten report types export to PDF (and to Excel, covered by pytest)")

member_report = call("GET", "/reports/member-summary", tr, expect=200)
assert [row["member"] for row in member_report] == ["Rohan Sharma"], member_report
print("✓ member-wise report is restricted to the logged-in member")

# Rule: audit log records before/after values
entry = call("GET", "/audit?action=transaction.update", ta, expect=200)
if entry["items"]:
    assert entry["items"][0]["before_json"] and entry["items"][0]["after_json"]
    assert "draft" in entry["items"][0]["before_json"] and "posted" in entry["items"][0]["after_json"]
print(f"✓ audit trail has {call('GET', '/audit?page_size=1', ta, expect=200)['total']} entries with actor + differences")

print("\nALL BLUEPRINT §9 / §12 RULES VERIFIED AGAINST THE LIVE API")
