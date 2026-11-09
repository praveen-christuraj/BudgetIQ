# Development Roadmap

Reference roadmap for **Family Finance Manager** (blueprint §8). It records how each
phase was delivered, what proves it works, and what remains for future work.

Legend: **Done** = implemented and covered by tests · **Done (manual)** = implemented,
verified by hand against the running app instead of an automated test · **Pending** =
not implemented yet.

| # | Phase | Status |
| --- | --- | --- |
| 1 | Foundation | Done |
| 2 | Family and accounts | Done |
| 3 | Transactions | Done |
| 4 | Budgeting | Done |
| 5 | Recurring payments | Done |
| 6 | Savings and loans | Done |
| 7 | Dashboard and reports | Done |
| 8 | Testing and hardening | Done (see §9 for the open items) |
| 9 | Home deployment | Done, Docker images verified by review only |

---

## Phase 1 — Foundation · Done

| Item | Where | Verified by |
| --- | --- | --- |
| React + MUI layout, left navigation | `frontend/src/components/layout`, `frontend/src/app/routes` | `npx tsc --noEmit`, `npm run build` |
| FastAPI application structure | `backend/app/{api,core,models,schemas,services,permissions,reports}` | import check, `/api/docs` |
| SQLAlchemy 2.x models (19 tables) | `backend/app/models` | `tests/conftest.py` creates every table |
| Alembic migration | `backend/alembic/versions/efa524286bc2_initial_schema.py` | offline Postgres DDL render + SQLite upgrade |
| PostgreSQL configuration | `backend/app/core/config.py`, `.env.example` | config parity check |
| Docker Compose | `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` | static review (Docker unavailable in the build sandbox) |
| JWT + Argon2 authentication | `backend/app/core/security.py`, `app/api/v1/endpoints/auth.py` | `tests/test_auth.py` |
| First registered user becomes administrator | `POST /api/v1/auth/setup` | `tests/test_auth.py` |
| Public registration disabled after setup | `POST /api/v1/auth/setup` returns `409` | `tests/test_auth.py` |

**Exit criteria met:** the app boots, an administrator can be created once, login returns an
access + refresh token pair, and every protected route rejects anonymous calls.

## Phase 2 — Family and accounts · Done

- Household profile and settings (`GET/PATCH /households/current`, `GET/PATCH /settings`).
- Member management: admin creates, updates role, deactivates and resets passwords
  (`/members`). Deactivated members lose access but keep their history.
- Role enforcement lives in `backend/app/permissions/rbac.py`; the matrix in
  [RBAC_PERMISSION_MATRIX.md](RBAC_PERMISSION_MATRIX.md) matches the code.
- Bank, cash and wallet accounts with an opening balance; balances are always derived
  (`opening_balance + posted income + transfers in − posted expenses − transfers out`) and
  never stored (see [DATABASE_DESIGN.md](DATABASE_DESIGN.md)).
- Account ownership (`user_id` NULL = shared) is independent of transaction scope.

Tests: `tests/test_accounts_transactions.py`, `tests/test_transfers.py`.

## Phase 3 — Transactions · Done

- Income, expense and transfer entry; transfers live in their own module and are **never**
  counted as income or expense.
- Categories with parent/child hierarchy and colours; default set seeded at registration
  (`backend/app/core/constants.py::DEFAULT_CATEGORIES`).
- Receipt attachments: type (`pdf/png/jpg/webp`) and size (`MAX_UPLOAD_MB`, default 10 MB)
  validated on upload, files stored under `UPLOAD_DIR`, download authorised per household.
- Transaction history with filters, pagination and CSV export.
- Reversal instead of deletion: `POST /transactions/{id}/reverse` sets `status = reversed`
  and recalculates balances; drafts can be posted or discarded.

Tests: `tests/test_accounts_transactions.py` (balance maths, visibility, reversal),
`tests/test_transfers.py` (moves money, no income/expense impact).

## Phase 4 — Budgeting · Done

- Monthly, quarterly and annual periods; family or personal owner.
- Category allocations with optional carry-forward from the previous period
  (`app/services/budgets.py::apply_carry_forward`).
- Planned vs actual computed from posted, non-reversed transactions in the same scope.
- 80 % warning and 100 % exceeded notifications with de-duplication keys
  `budget-warning:{budget_id}:{start_date}` and `budget-exceeded:{budget_id}:{start_date}`.

Tests: `tests/test_budgets.py`.

## Phase 5 — Recurring payments · Done

- Rules for bills, subscriptions and salary with daily/weekly/monthly/quarterly/yearly and
  custom day-of-month cadence.
- `POST /recurring/{id}/generate` creates exactly one **draft** transaction per due date.
  Nothing is ever auto-posted or auto-paid; the family reviews and posts.
- Due-date reminders through notifications (`recurring-due:{rule_id}:{due_date}`).

Tests: `tests/test_budgets.py`, `tests/test_reports.py` (schedule report).

## Phase 6 — Savings and loans · Done

- Goals with target amount/date, contributions tracked separately from expenses and from
  transfers, progress percentage, `goal-achieved:{goal_id}` notification once reached.
- Borrowed and lent loans with principal, interest rate, counterparty and due date.
- Repayments split into principal and interest; principal is **not** counted as household
  consumption; outstanding balances are derived.

Tests: `tests/test_savings_loans.py`.

## Phase 7 — Dashboard and reports · Done

- Dashboard with a `Family Overview | My Finances` toggle, six-month trend, category donut,
  recent activity, upcoming recurring payments, budget health and goal progress.
- Eleven report exports covering the ten report types of blueprint §1.10 plus the
  row-level register; each one renders as Excel (OpenPyXL) and PDF (ReportLab).
- Report screens: monthly, annual, category, member, shared vs personal, budget vs actual,
  savings, accounts, loans, recurring.

Tests: `tests/test_reports.py` (`test_every_report_type_is_exportable` asserts all eleven
keys produce a valid xlsx; monthly/shared-vs-personal also assert PDF).

## Phase 8 — Testing and hardening · Done

| Area | Coverage |
| --- | --- |
| Financial calculation | `tests/test_accounts_transactions.py`, `tests/test_budgets.py`, `tests/test_savings_loans.py` |
| Permissions / isolation | `tests/test_auth.py`, `tests/test_accounts_transactions.py`, `tests/test_reports.py` |
| API contract | all backend test modules use the FastAPI `TestClient` against the real routers |
| Reports | `tests/test_reports.py` (values, exports, unknown-report rejection) |
| Frontend units | `format.test.ts` (money/date formatting), `StatCard.test.tsx` |
| Frontend behaviour | `reports.test.tsx` pins the ten report tabs and their export keys; `transactions.page.test.tsx` asserts scope badges, signed amounts, draft status and reversal-instead-of-delete; `pages.smoke.test.tsx` renders all 15 screens with a stubbed API so a broken page cannot ship |
| Backup / restore | `backups/backup.sh`, `backups/backup-loop.sh`, runbook in [DOCKER_DEPLOYMENT_GUIDE.md](DOCKER_DEPLOYMENT_GUIDE.md#restore-procedure) |

Run everything with:

```bash
cd backend && ../.venv/bin/python -m pytest     # 45 tests
cd frontend && npx vitest run                   # 31 tests
cd frontend && npx tsc --noEmit && npm run build
```

## Phase 9 — Home deployment · Done (review only)

- Multi-stage frontend image served by nginx on port 8080 with `/api` proxied to the API.
- API image runs `alembic upgrade head` on start and then uvicorn with 2 workers.
- PostgreSQL is not published to the host; only the API can reach it.
- Named volumes `family_finance_pgdata` and `family_finance_uploads` survive
  `docker compose down` and image rebuilds.
- Dedicated `backup` service: daily dump, weekly receipts archive, retention pruning.
- Step-by-step guide: [DOCKER_DEPLOYMENT_GUIDE.md](DOCKER_DEPLOYMENT_GUIDE.md).

> Docker was not available in the environment where this application was built, so the
> compose stack has been validated by review (image definitions, health checks, volume and
> network wiring, environment variables) rather than by an actual `docker compose up`.
> Run the guide once on the target home server before relying on it.

---

## Suggested MVP ordering (blueprint §8.1)

The blueprint recommends shipping a useful core first. Because every phase here is
already implemented, this table is now a **release checklist** rather than a build order:

| Feature | MVP | Status |
| --- | --- | --- |
| Login and family members | Yes | Done |
| Shared and personal accounts | Yes | Done |
| Income and expenses | Yes | Done |
| Transfers | Yes | Done |
| Categories | Yes | Done |
| Monthly budgets | Yes | Done |
| Dashboard | Yes | Done |
| Basic reports | Yes | Done |
| Recurring transactions | Later | Done |
| Savings goals | Later | Done |
| Loans and debts | Later | Done |
| Advanced notifications | Later | Done |

## Recommended next steps

1. **Run the compose stack once on the real host** and confirm ports 8080/8000, the
   `/api/docs` page and a Postgres-backed login.
2. **Exercise the restore procedure** on a scratch database (weekly ideally) — the restore
   path is documented but has not been executed against a live volume here.
3. **Add integration tests for MySQL-free Postgres semantics** if the home server differs
   from the CI SQLite fallback (e.g. `NUMERIC` rounding, `ILIKE` behaviour).
4. **Receipt retention policy** — decide how long attachment archives are kept alongside
   the database dumps.
5. **Optional**: passkey/2FA for the administrator account, and a nightly read-only report
   email. Both are outside the frozen stack and need explicit approval first.

## How to extend the application

Follow the same layering for every new feature; it keeps the code beginner-friendly.

1. **Model** in `backend/app/models/` (UUID PK, `household_id`, `created_at`, `updated_at`).
2. **Migration**: `cd backend && ../.venv/bin/alembic revision --autogenerate -m "..."`;
   add `import app.models.base` manually if autogenerate misses tables.
3. **Schema** in `backend/app/schemas/` using `Money` (2-decimal `Decimal`).
4. **Service** in `backend/app/services/` containing the business rules and all money maths.
5. **Endpoint** in `backend/app/api/v1/endpoints/`, always `Depends(get_current_context)` and
   household-scoped filters; write an `audit_log` entry for every write.
6. **Tests** in `backend/tests/` for both the happy path and the permission boundary.
7. **Frontend**: type in `src/types`, call in `src/services/endpoints.ts`, page under
   `src/features/<area>/`, route and navigation entry in `src/app/routes`.
8. **Docs**: update this file, `API_DESIGN.md` and, if the schema changed,
   `DATABASE_DESIGN.md` / `DATABASE_RELATIONSHIPS.md`.

Never: hard-delete financial rows, store balances, introduce float math, add a service to
the compose file without approval, or bypass backend authorisation in the UI.
