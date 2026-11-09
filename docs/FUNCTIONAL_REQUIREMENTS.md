# Functional Requirements — Family Finance Manager v1.0

Status: **implemented** (see [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)).
Baseline: *Family Budget & Expense Management System* blueprint.

## 1. Confirmed decisions

| Setting | Decision |
| --- | --- |
| Financial model | Hybrid — shared household **and** personal member finances |
| Default currency | INR (₹), two decimal places |
| Member access | Everyone records transactions; administrator manages settings |
| Deployment | Home computer / private network via Docker Compose |
| Frontend | React + TypeScript + MUI |
| Backend | FastAPI + SQLAlchemy 2.x + Alembic |
| Database | PostgreSQL |
| Authentication | JWT access/refresh + Argon2 |

One household is the default operating model, while `households.household_id` exists on
every financial table so multi-household support can be added without redesign.

## 2. Modules

### 2.1 Dashboard
The first screen after sign-in.

* Toggle **Family Overview | My Finances**.
* Family overview: income, expenses, remaining cash flow, savings contributions, budget
  utilisation, upcoming payments, recent transactions, six-month income/expense chart and
  category distribution.
* Individual overview: own income, personal expenses, personal budget, savings contributions
  and the balances of accounts the member can see.
* Month selector; figures use only **posted** transactions.

### 2.2 Family management
* Roles: **Administrator** and **Member** (one active administrator minimum).
* First registered user becomes administrator; public registration then disabled.
* Administrator creates members (name, email, temporary password, role, relationship, colour),
  edits them, resets passwords and deactivates them (history preserved).
* Members can see the household member list and shared activity; personal transactions of
  another member are visible to the administrator only.

### 2.3 Account management
* Account types: cash, savings, current account, credit card, fixed deposit, investment, other.
* Owner is either the household (`owner_user_id = NULL`, shared) or a member.
* Opening balance, institution and last four digits supported.
* Balance = opening balance + posted income − posted expenses + transfers in − transfers out.
* Credit-card accounts may hold a negative balance (amount owed).

### 2.4 Income & expenses
Every transaction records: ID (UUID), date, type (income/expense), description, amount,
category, optional subcategory, account, scope (shared/personal), owner, payment method,
notes, attachments and creator. Status is `draft`, `posted` or `reversed`.

* Search (description/notes) and filtering by type, scope, status, member, date range,
  account, category, amount; sorting and pagination.
* Edit with before/after audit snapshots; delete performs a **reversal** so history survives.
* Receipt upload (PDF/PNG/JPEG/WEBP, 10 MB) with download and removal.
* Excel export of the filtered register.
* Possible duplicates (same type, amount, account, within ±1 day) are surfaced as warnings
  with a one-click reversal of the new entry.

### 2.5 Budget planning
* Monthly or annual budgets; family budget (all household expenses) or member budget
  (member-owned expenses plus shared expenses they recorded).
* Category allocations, planned vs actual, remaining, utilisation and status
  (`ok` / `warning` / `critical`) using configurable thresholds (default 80%/100%).
* Carry-forward of unspent amounts from the previous matching period.
* Archive instead of delete; reversed/draft transactions never count.

### 2.6 Recurring payments
Frequency (daily/weekly/monthly/quarterly/yearly), start date, optional end date, next due
date, expected amount, category, account, responsible member and active flag.

* Due rules generate **draft** transactions only — a bill is never silently marked paid.
* Banner/notification for payments approaching, using the household lead-time setting.
* Next due date advances automatically after generation.

### 2.7 Savings & goals
* Goals with target amount/date, family or member ownership, optional linked account.
* Multiple contributions with date, account and notes; progress percentage.
* Goal auto-marks as achieved at 100%; achievement notification.
* Contributions are tracked separately from expenses; account-to-savings-account moves are
  recorded as transfers so savings are not double-counted.

### 2.8 Loans & debts
* Direction: borrowed or lent; counterparty, principal, optional interest rate, dates, notes.
* Repayments with principal/interest split; outstanding = principal − principal repaid.
* Overdue detection; loan auto-closes when the outstanding balance reaches zero.
* Principal repayments are **not** household consumption expenses.

### 2.9 Reports
1. Monthly / annual income and expenditure (12-month table + trend chart)
2. Category-wise expenses (or income) with share percentages
3. Member-wise summary (income, expenses, net, shared vs personal)
4. Shared vs personal spending split
5. Planned vs actual budgets
6. Savings growth by goal
7. Account balances (opening, income, expenses, transfers in/out, derived balance)
8. Outstanding loans and debts
9. Recurring payment schedule
10. Complete transaction register

Export formats: **Excel (.xlsx)** and **PDF**, generated server-side with household metadata.

### 2.10 Notifications
* Budget nearing its limit / exceeded
* Recurring payment approaching
* Loan repayment due or overdue
* Savings target achieved

Notifications are derived from current data, de-duplicated per entity and period, and can be
marked read individually or in bulk.

### 2.11 Settings & audit
* Household name, currency, timezone, fiscal-year start, budget thresholds, notification
  lead time, backup retention.
* Change-password flow for every user; Argon2 hashing; account lockout.
* System information (version, database, upload limits, token lifetimes).
* Audit history: actor, action, entity, summary, before/after JSON, IP, timestamp. Admin only.
  Entries are append-only — no update or delete endpoint exists.

## 3. Navigation

```
Overview            Dashboard · Family Members · Accounts
Transactions        Income · Expenses · Transfers · Categories
Planning            Monthly Budgets · Recurring Payments · Savings Goals · Loans & Debts
Analytics & Admin   Reports · Notifications · Audit History · Settings
```

## 4. Business rules

| Scenario | Behaviour |
| --- | --- |
| Member records a personal expense | Deducted from the selected account, counted as personal |
| Member records a shared expense | Deducted from the selected account, counted as shared |
| Personal expense paid from a shared account | Shared account balance drops, report scope stays personal |
| Member transfers money between accounts | Both balances update; never income/expense |
| Member edits own transaction | Allowed, audit entry with before/after |
| Member edits another member's personal record | Rejected (403) |
| Administrator edits any transaction | Allowed and audited |
| Expense exceeds budget | Warning/critical status and notification |
| Recurring payment becomes due | Draft entry generated for review |
| Transaction is reversed | Balance and every report total restored automatically |
| Month ends | Historical transactions and budgets preserved unchanged |
| Last administrator demoted/deactivated | Rejected |
| Account with history deleted | Deactivated instead of destroyed |

## 5. Non-functional requirements

* Financial accuracy: Decimal/NUMERIC only, atomic commits, derived balances.
* Privacy: household-scoped queries, backend RBAC, no public registration.
* Reliability: migrations on startup, persistent volumes, automated backups.
* Usability: responsive enterprise dashboard; works on phones/tablets on the LAN.
* Offline-first: no cloud dependency; everything runs on the home network.
