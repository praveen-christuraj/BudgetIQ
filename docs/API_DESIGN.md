# API Design

Base URL: `/api/v1` · Interactive docs: `/api/docs` (Swagger) and `/api/redoc` ·
OpenAPI: `/api/openapi.json` · Version: `1.0.0`.

## Conventions

* JSON everywhere except receipt upload (multipart) and report export (binary).
* Money is serialised as a JSON **number with two decimals**; the database stores `NUMERIC(18,2)`.
* IDs are UUID strings. Dates are `YYYY-MM-DD`; timestamps are ISO-8601 UTC.
* List endpoints accept `page` (1-based), `page_size` (default 25, max 200) and return
  `{ items, total, page, page_size, pages }`.
* Empty optional query parameters are treated as "no filter".
* Errors use FastAPI's shape: `{ "detail": "message" }` with 400/401/403/404/409/422/429/500.
* Scope is always derived from the authenticated household; IDs from other households 404.

## Authentication

Header: `Authorization: Bearer <access_token>`.
Access tokens are short-lived (30 min by default); refresh tokens last 7 days. Tokens are
rotated on refresh; logout revokes refresh tokens. Five failed logins lock the account for
15 minutes.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/status` | `{ initialized, household_name? }` – drives setup vs login |
| POST | `/auth/setup` | First-run household + administrator creation (409 if already set up) |
| POST | `/auth/login` | `{ email, password }` → `{ access_token, refresh_token, context }` |
| POST | `/auth/refresh` | `{ refresh_token }` → new token pair |
| POST | `/auth/logout` | Revokes the supplied refresh token |
| GET | `/auth/me` | User, household, role, settings |
| POST | `/auth/change-password` | `{ current_password, new_password }` |

`context` returned by login/setup/me:

```json
{
  "user": { "id": "…", "email": "…", "full_name": "…", "role": "admin" },
  "household": { "id": "…", "name": "Sharma Family" },
  "settings": { "currency": "INR", "currency_symbol": "₹",
                "budget_warning_threshold": 80, "budget_critical_threshold": 100,
                "notification_lead_days": 7, "fiscal_year_start_month": 4 }
}
```

## Members

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/members` | Household members with role, relationship, colour, status, monthly summary |
| GET | `/members/{id}` | Single member |
| POST | `/members` | Admin only: `{ full_name, email, password, role, relationship_label, display_color }` |
| PATCH | `/members/{id}` | Name, relationship, colour, role, `is_active` |
| DELETE | `/members/{id}` | Soft-deactivate; last admin protected |
| POST | `/members/{id}/reset-password` | Admin sets a temporary password |

## Accounts

`GET /accounts`, `GET /accounts/{id}` (each includes derived `current_balance`),
`POST /accounts`, `PATCH /accounts/{id}`, `DELETE /accounts/{id}` (deactivate).

```json
{
  "name": "Main Savings Account",
  "account_type": "savings",
  "owner_user_id": null,
  "opening_balance": 250000,
  "institution": "State Bank of India",
  "account_number_last4": "4821"
}
```

## Categories

`GET /categories` · `POST /categories` · `PATCH /categories/{id}` ·
`POST /categories/{id}/subcategories` · `DELETE /categories/{id}/subcategories/{subId}` ·
`DELETE /categories/{id}`.

A new household is seeded with system categories (income: salary, business, freelance,
interest & dividends, rental, gift, other; expense: groceries, rent, utilities split into
electricity/water/internet, transport, education, medical, entertainment, shopping,
household help, insurance, maintenance, other).

## Transactions

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/transactions` | Search, filters, sorting, pagination |
| GET | `/transactions/export` | Excel of the filtered register |
| GET | `/transactions/{id}` | Detail with attachments and editability |
| POST | `/transactions` | Create (draft or posted) |
| PUT | `/transactions/{id}` | Edit with audit snapshot |
| POST | `/transactions/{id}/reverse` | Soft delete with reason |
| DELETE | `/transactions/{id}` | Draft only – deletes outright |
| GET | `/transactions/{id}/duplicates` | Possible duplicates |
| POST | `/transactions/{id}/attachments` | Multipart receipt upload |
| GET | `/transactions/{id}/attachments/{aid}` | Download / preview |
| DELETE | `/transactions/{id}/attachments/{aid}` | Remove receipt |

Filters: `search`, `transaction_type`, `scope`, `status`, `owner_user_id`, `account_id`,
`category_id`, `date_from`, `date_to`, `min_amount`, `max_amount`, `sort_by`, `sort_order`.

```json
{
  "transaction_type": "expense",
  "scope": "shared",
  "amount": 15800,
  "transaction_date": "2026-11-06",
  "description": "Monthly groceries - Big Bazaar",
  "account_id": "…",
  "category_id": "…",
  "subcategory_id": null,
  "owner_user_id": null,
  "payment_method": "cash",
  "notes": null,
  "status": "posted"
}
```

Response includes server-computed `is_editable`, `can_reverse`, category/account/member
display names, attachments and reversal metadata.

## Transfers

`GET /transfers` · `POST /transfers` · `DELETE /transfers/{id}` (reversal).

```json
{ "from_account_id": "…", "to_account_id": "…", "amount": 8000,
  "transfer_date": "2026-11-04", "description": "Monthly cash withdrawal" }
```

Rejected when both accounts are identical or either is invisible to the caller.

## Budgets

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/budgets?status=active|archived` | Budgets with utilisation |
| GET | `/budgets/current` | Budgets covering today (used by dashboard) |
| GET | `/budgets/{id}` | Allocations and computed actuals |
| POST | `/budgets` | Create with optional allocations |
| PUT | `/budgets/{id}` | Update header/allocations |
| PUT | `/budgets/{id}/allocations` | Replace allocation set |
| POST | `/budgets/{id}/carry-forward` | Copy unspent amounts into the next period |
| DELETE | `/budgets/{id}` | Archive |

```json
{ "name": "Family budget November 2026", "period_type": "monthly",
  "start_date": "2026-11-01", "end_date": "2026-11-30",
  "owner_user_id": null, "carry_forward": true,
  "allocations": [{ "category_id": "…", "planned_amount": 25000 }] }
```

Each budget returns per-allocation `planned_amount`, `actual_amount`, `remaining_amount`,
`utilization_percent`, `status`, plus totals and `unbudgeted_actual`.

## Recurring rules

`GET /recurring` · `POST /recurring` · `PATCH /recurring/{id}` · `DELETE /recurring/{id}`
(deactivate) · `POST /recurring/{id}/generate` · `POST /recurring/generate-due`.

Generation creates **draft** transactions for the due date and advances `next_due_date`.
It is idempotent for the same due date.

## Savings

`GET /savings/goals` · `GET /savings/overview` · `POST /savings/goals` ·
`PATCH /savings/goals/{id}` · `DELETE /savings/goals/{id}` (archive) ·
`POST /savings/goals/{id}/contributions` · `DELETE /savings/goals/{id}/contributions/{cid}`.

Contributions never appear in expense reports; goal progress is
`Σ contributions / target_amount`.

## Loans

`GET /loans` · `GET /loans/{id}` · `POST /loans` · `PATCH /loans/{id}` ·
`DELETE /loans/{id}` (close) · `POST /loans/{id}/repayments` ·
`DELETE /loans/{id}/repayments/{rid}`.

Repayment validation: `principal_component + interest_component == amount`, and the
principal component cannot exceed the outstanding principal.

## Reports

All report endpoints accept `year` or `date_from`/`date_to` and return computed JSON.

| Path | Report |
| --- | --- |
| `GET /reports/dashboard?view=family|personal&month=YYYY-MM` | Dashboard payload |
| `GET /reports/monthly-summary?year=&month=` | Monthly income, expenditure, net, savings, transfers |
| `GET /reports/annual-summary` | 12-month table and trend |
| `GET /reports/category-expenses` | Category breakdown with shares |
| `GET /reports/member-summary` | Member-wise income, expenses, net |
| `GET /reports/shared-vs-personal` | Scope split |
| `GET /reports/budget-vs-actual` | Planned vs actual per category |
| `GET /reports/savings-growth` | Goal progress and contribution trend |
| `GET /reports/account-balances` | Opening, flows, closing per account |
| `GET /reports/outstanding-loans` | Loans with outstanding totals |
| `GET /reports/recurring-schedule` | Upcoming recurring payments |
| `GET /reports/transactions?date_from=&date_to=&member_id=&include_drafts=` | Transaction register (default: posted rows only) |

### Export

```
GET /reports/export?report=<report-key>&format=xlsx|pdf&year=2026&date_from=…&date_to=…
```

Report keys (eleven, covering the ten report types of blueprint §1.10 plus the
searchable register export):

| Key | Blueprint report |
| --- | --- |
| `monthly-summary` | 1. Monthly income and expenditure |
| `annual-summary` | 2. Annual financial summary |
| `category-expenses` | 3. Category-wise expenses |
| `member-summary` | 4. Family-member-wise expenses |
| `shared-vs-personal` | 5. Shared versus personal spending |
| `budget-vs-actual` | 6. Planned versus actual budgets |
| `savings-growth` | 7. Savings growth |
| `account-balances` | 8. Account balances |
| `outstanding-loans` | 9. Outstanding loans and debts |
| `recurring-schedule` | 10. Recurring payment schedule |
| `transactions` | Supporting register export (full row-level history) |

Each key is exportable as `xlsx` and `pdf`; an unknown key returns `400` with the supported list
(asserted by `tests/test_reports.py::test_every_report_type_is_exportable`).

Responses are streamed with `Content-Disposition: attachment` and a timestamped filename.
PDF files are generated with ReportLab (A4, household header, table layout); Excel files via
OpenPyXL with bold headers, currency formats and frozen panes.

## Notifications

`GET /notifications?unread_only=` · `GET /notifications/count` ·
`PATCH /notifications/{id}/read` · `POST /notifications/read-all`.

Generated on demand from live data and de-duplicated by keys such as
`budget-warning:{budget_id}:{period_start}`, `recurring-due:{rule_id}:{due_date}`,
`loan-due:{loan_id}:{due_date}`, `goal-achieved:{goal_id}`.

## Audit

`GET /audit` (admin) with `search`, `action`, `entity_type`, `date_from`, `date_to`,
`page`, `page_size`; `GET /audit/actions` returns the distinct action list for filtering.
Rows contain actor, action, entity, summary, before/after JSON, IP and timestamp.

## Settings

`GET /households/current` · `PATCH /households/current` (admin) ·
`GET /settings` · `PATCH /settings` (admin) · `GET /settings/system`.

## Health

`GET /health` and `GET /api/v1/health` → `{ "status": "ok", "version": "1.0.0" }`.
