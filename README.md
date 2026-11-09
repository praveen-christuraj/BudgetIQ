# Family Finance Manager

A private, self-hosted **family budget and expense management system** for a single
household with multiple members. It keeps shared household money and each member's
personal money clearly separated, without ever mixing the two in reports.

Built exactly to the *Family Budget & Expense Management System* blueprint:

| Layer | Technology |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite + Material UI + Recharts + TanStack Query |
| Backend | FastAPI + SQLAlchemy 2.x + Alembic |
| Database | PostgreSQL 16 (`NUMERIC(18,2)`, UUID keys) |
| Auth | JWT access + refresh tokens, Argon2 password hashing |
| Reports | OpenPyXL (Excel), ReportLab (PDF) |
| Tests | Pytest (backend), Vitest + Testing Library (frontend) |
| Deployment | Docker Compose on a home computer / private LAN |

![modules](https://img.shields.io/badge/modules-11-1B5E20) ![tests](https://img.shields.io/badge/backend_tests-45_passed%20%C2%B7%20frontend_tests-31_passed-2E7D32) ![money](https://img.shields.io/badge/money-Decimal_only-00695C)

---

## What is included

All 11 modules from the requirements baseline are implemented:

1. **Dashboard** – family overview / *My Finances* toggle, six-month trend, category
   distribution, budget progress, upcoming payments, recent transactions, member comparison.
2. **Family Management** – admin-created members, Administrator/Member roles, member colours,
   activation, password resets, monthly member summaries.
3. **Account Management** – cash, savings, current, credit card, fixed deposit, investment and
   other accounts; shared or member-owned; balances always derived from posted entries.
4. **Income & Expenses** – full transaction register with scope, owner, category/subcategory,
   payment method, receipts, drafts, duplicate warnings, filters, Excel export and soft-delete reversal.
5. **Budget Planning** – monthly/annual budgets, family or personal, category allocations,
   planned vs actual, 80%/100% thresholds, carry-forward, archiving.
6. **Recurring Transactions** – bills, subscriptions, salary, EMI-style commitments; due-date
   generation of **draft** entries (never automatic payments) plus notifications.
7. **Savings & Goals** – multiple goals with contributions and progress; separate from expenses
   and from account transfers so savings are never double-counted.
8. **Loans & Debts** – borrowed and lent money, interest rate, due dates, repayments with
   principal/interest split and outstanding balances that do not pollute consumption reports.
9. **Reports & Analytics** – the ten report types of the blueprint (monthly, annual, category,
   member, shared vs personal, budget vs actual, savings growth, account balances, outstanding
   loans, recurring schedule) plus a row-level transaction register; every report exports to
   Excel and PDF.
10. **Notifications** – budget warning/exceeded, recurring due, loan due, goal achieved.
11. **Settings & Audit** – household profile, thresholds, security, system information,
    backup guidance, and an immutable audit trail (before/after values, actor, timestamp).

## Repository layout

```
├── backend/               FastAPI application
│   ├── app/
│   │   ├── api/v1/        versioned routers (14 modules, 91 endpoints)
│   │   ├── core/          config, database, security, dependencies
│   │   ├── models/        19 SQLAlchemy tables
│   │   ├── schemas/       Pydantic request/response models
│   │   ├── services/      balances, transactions, budgets, recurring, notifications, dashboard
│   │   ├── permissions/   RBAC + household-scoped filters
│   │   ├── reports/       report calculations + Excel/PDF writers
│   │   └── main.py
│   ├── alembic/           initial migration (PostgreSQL UUIDs)
│   ├── scripts/           demo seed script
│   └── tests/             45 pytest tests
├── frontend/              React + TypeScript + MUI application
│   └── src/
│       ├── app/           providers, routing, auth context
│       ├── components/    layout, common components, charts
│       ├── features/      one folder per module
│       ├── services/      typed API client
│       └── theme/
├── database/init/         first-run PostgreSQL settings
├── backups/               backup loop, manual backup script, restore guide
├── docs/                  requirements, DB design, RBAC, API, roadmap, deployment
├── docker-compose.yml     db + api + web + backup
└── .env.example
```

## Quick start (Docker Compose – the intended deployment)

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, SECRET_KEY (32+ chars) and optionally a backup passphrase
docker compose up -d --build
```

* App: **http://<home-host-ip>:8080**
* API docs: **http://<home-host-ip>:8000/api/docs**
* PostgreSQL is **not** published to the host network.

Open the app, complete the first-time setup, and that first account becomes the
administrator. Public registration is then permanently disabled — the administrator
creates every other member from **Family Members**.

> Updating the app: `git pull && docker compose up -d --build`. Never
> `docker compose down -v` — the `-v` flag deletes your financial database.

## Local development (no Docker)

The backend supports a SQLite fallback for evaluation only. Production always uses
PostgreSQL (migrations are PostgreSQL-native, generating real `UUID` columns).

```bash
# Backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
alembic upgrade head                     # optional for SQLite dev; tables auto-create
uvicorn app.main:app --reload            # http://localhost:8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                              # http://localhost:5173, proxies /api → :8000
```

### Demo household (optional)

```bash
cd backend
../.venv/bin/python scripts/seed_demo.py --reset
```

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `priya@sharmafamily.in` | `FamilyDemo123` |
| Member | `rohan@sharmafamily.in` | `FamilyDemo123` |
| Member | `ananya@sharmafamily.in` | `FamilyDemo123` |

The seed script drives the real API, so audit logs, budgets, balances and notifications
are consistent with what a family would see. **Never run it against production.**

## Tests

```bash
cd backend && ../.venv/bin/python -m pytest     # 45 tests
cd frontend && npm test                          # 31 tests
cd frontend && npm run build                     # typecheck + production build
```

Covered behaviour includes: balance derivation, drafts vs posted, shared/personal
independence, member privacy, audit snapshots, reversal restoring balances, transfer
accounting, budget thresholds and carry-forward, savings/loan separation from expenses,
dashboard aggregation, notifications and Excel/PDF export bytes. Every frontend screen also
has a render smoke test, so a page that throws cannot ship.

To prove the business rules on a running instance (re-seed afterwards, it writes data):

```bash
cd backend && ../.venv/bin/python scripts/seed_demo.py --reset
cd backend && ../.venv/bin/python scripts/verify_rules.py
```

## Security & financial integrity

* Argon2 password hashing; short-lived JWT access tokens with refresh rotation.
* Account lockout after repeated failed logins; no secrets or passwords are logged.
* Every query is household-scoped in the backend — browser-supplied IDs are never trusted.
* Authorisation is enforced in FastAPI (not just hidden in the UI), with RBAC tests.
* Money is `NUMERIC(18,2)` + Python `Decimal` end to end; no float arithmetic.
* Transactions are committed atomically; posted records are reversed, never destroyed.
* Receipts are validated by MIME type and size (PDF/PNG/JPEG/WEBP, 10 MB default).
* PostgreSQL is internal-only; access is restricted to the home network (VPN for remote).

Full details: [`docs/RBAC_PERMISSION_MATRIX.md`](docs/RBAC_PERMISSION_MATRIX.md) and
[`docs/DOCKER_DEPLOYMENT_GUIDE.md`](docs/DOCKER_DEPLOYMENT_GUIDE.md).

## Documentation

| Document | Contents |
| --- | --- |
| [FUNCTIONAL_REQUIREMENTS.md](docs/FUNCTIONAL_REQUIREMENTS.md) | Modules, business rules, MVP scope |
| [DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | Tables, columns, indexes, integrity rules |
| [DATABASE_RELATIONSHIPS.md](docs/DATABASE_RELATIONSHIPS.md) | ER diagram and relationship notes |
| [RBAC_PERMISSION_MATRIX.md](docs/RBAC_PERMISSION_MATRIX.md) | Administrator vs Member permissions |
| [API_DESIGN.md](docs/API_DESIGN.md) | All endpoints, payloads, errors, exports |
| [DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) | Nine phases and current status |
| [DOCKER_DEPLOYMENT_GUIDE.md](docs/DOCKER_DEPLOYMENT_GUIDE.md) | Home deployment, backups, restore, upgrades |
| [backups/README.md](backups/README.md) | Operational backup/restore runbook |

## Design decisions worth knowing

* **Scope is independent of account ownership.** A personal expense paid from the shared
  bank account stays personal in reports while the shared balance still drops. This is
  enforced in the data model (`transactions.scope` + `transactions.owner_user_id`).
* **Transfers are not income or expenses.** They live in their own table and only move
  balances; reports exclude them by design.
* **Savings contributions are allocations, not expenses.** Moving money to a savings
  account is a transfer; contributing to a goal is tracked separately.
* **Loan principal repayments are not consumption.** They are recorded on the loan, so
  category spending stays accurate.
* **Balances are derived, never stored.** Opening balance + posted entries − reversals
  means balance correction is impossible to get wrong.
