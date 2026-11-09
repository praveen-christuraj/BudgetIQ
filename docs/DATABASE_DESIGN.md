# Database Design

PostgreSQL 16, SQLAlchemy 2.x declarative models, Alembic migrations
(`backend/alembic/versions/efa524286bc2_initial_schema.py`).

## Global conventions

* **Primary keys:** UUID (`uuid.uuid4()` generated in the application). PostgreSQL stores
  native `UUID`; the SQLite development fallback stores `CHAR(36)` via a custom `GUID` type.
* **Money:** `NUMERIC(18,2)`; Python `Decimal` everywhere; never floats.
* **Timestamps:** `TIMESTAMP WITH TIME ZONE`, UTC default (`created_at`, `updated_at`).
  Entity dates (`transaction_date`, `transfer_date`, …) are `DATE`.
* **Currency:** ISO-4217 string, default `INR`.
* **Foreign keys:** enforced, with deliberate `ON DELETE` behaviour (history is protected).
* **Household isolation:** every financial table carries `household_id` and is indexed on it.
* **Indexes:** household+date, household+account, household+category, household+owner.
* **Soft deletion:** posted transactions/transfers are `reversed`; members/accounts are
  deactivated; budgets/goals are archived. Nothing financial is hard-deleted.

## Tables

### households
| Column | Type | Notes |
| --- | --- | --- |
| id | UUID PK | |
| name | varchar(150) | Family/household name |
| created_at / updated_at | timestamptz | |

### users
| Column | Type | Notes |
| --- | --- | --- |
| id | UUID PK | |
| email | varchar(255) unique | Login identifier, stored lowercase |
| full_name | varchar(150) | |
| password_hash | varchar(255) | Argon2id |
| is_active | boolean | Deactivation flag |
| last_login_at | timestamptz | |
| failed_login_attempts | integer | Brute-force protection |
| locked_until | timestamptz | Temporary lockout |
| password_changed_at | timestamptz | |
| created_at / updated_at | timestamptz | |

### household_members
| Column | Type | Notes |
| --- | --- | --- |
| id | UUID PK | |
| household_id | UUID FK → households | CASCADE |
| user_id | UUID FK → users | CASCADE |
| role | varchar(20) | `admin` \| `member` |
| relationship | varchar(50) | e.g. Spouse, Son |
| display_color | varchar(20) | Chart colour |
| is_active | boolean | |
| joined_at | timestamptz | |

Unique: `(household_id, user_id)`.

### household_settings
`household_id` (unique FK), `currency`, `currency_symbol`, `timezone`, `date_format`,
`fiscal_year_start_month`, `budget_warning_threshold` NUMERIC(5,2) default 80,
`budget_critical_threshold` default 100, `notification_lead_days`, `backup_retention_days`.

### accounts
| Column | Type | Notes |
| --- | --- | --- |
| id | UUID PK | |
| household_id | UUID FK | CASCADE |
| owner_user_id | UUID FK → users, nullable | `NULL` = shared household account |
| name | varchar(120) | |
| account_type | varchar(30) | cash, savings, current, credit_card, fixed_deposit, investment, other |
| institution | varchar(120) | |
| account_number_last4 | varchar(4) | |
| opening_balance | NUMERIC(18,2) | |
| currency | varchar(3) | |
| is_active | boolean | |
| notes | text | |

### categories / subcategories
`categories`: household, name, kind (`income`/`expense`), colour, icon, `is_active`,
`is_system`; unique `(household_id, name, kind)`.
`subcategories`: `category_id` FK CASCADE, name; unique `(category_id, name)`.

### transactions
| Column | Type | Notes |
| --- | --- | --- |
| id | UUID PK | |
| household_id | UUID FK | CASCADE, indexed |
| account_id | UUID FK → accounts | RESTRICT |
| created_by | UUID FK → users | RESTRICT |
| owner_user_id | UUID FK → users, nullable | NULL for shared; member for personal |
| transaction_type | varchar(20) | `income` \| `expense` |
| scope | varchar(20) | `shared` \| `personal` |
| status | varchar(20) | `draft` \| `posted` \| `reversed` |
| category_id / subcategory_id | UUID FK nullable | SET NULL |
| amount | NUMERIC(18,2) | > 0 enforced by API |
| currency | varchar(3) | |
| transaction_date | date | indexed |
| description | varchar(255) | |
| notes | text | |
| payment_method | varchar(30) | cash, upi, card, bank_transfer, cheque, other |
| reversed_at | timestamptz | |
| reversal_reason | text | |
| reversed_by | UUID FK → users | |
| duplicate_of_id | UUID FK → transactions | Self-reference when confirmed duplicate |
| created_at / updated_at | timestamptz | |

Composite indexes: `(household_id, transaction_date)`, `(household_id, category_id)`,
`(household_id, account_id)`, `(household_id, owner_user_id)`.

### transaction_attachments
`transaction_id` FK CASCADE, `filename`, `stored_name` (random UUID on disk), `content_type`,
`size_bytes`, `uploaded_by`, `created_at`.

### transfers
`household_id`, `from_account_id`, `to_account_id` (both FK RESTRICT), `amount`,
`currency`, `transfer_date`, `description`, `status` (`posted`/`reversed`), `created_by`,
`reversed_at`, `reversal_reason`. Index `(household_id, transfer_date)`.

### budgets / budget_allocations
`budgets`: household, `owner_user_id` (NULL = family), name, `period_type`
(`monthly`/`annual`), `start_date`, `end_date`, `carry_forward`, `status`
(`active`/`archived`), notes, `created_by`.
`budget_allocations`: `budget_id` FK CASCADE, `category_id` FK RESTRICT,
`planned_amount` NUMERIC(18,2), `carry_forward_amount`, note; unique
`(budget_id, category_id)`.

### recurring_rules
household, name, `transaction_type`, `scope`, `owner_user_id`, `category_id`, `account_id`,
`responsible_user_id`, `amount`, `frequency` (daily/weekly/monthly/quarterly/yearly),
`start_date`, `end_date`, `next_due_date` (indexed), `payment_method`, description, notes,
`is_active`, `last_generated_at`, `created_by`.

### savings_goals / savings_contributions
`goals`: household, `owner_user_id` (NULL = shared), name, `target_amount`, `target_date`,
status (`active`/`achieved`/`archived`), `account_id`, notes, `created_by`.
`contributions`: `goal_id` CASCADE, `amount`, `contribution_date` (indexed), `account_id`,
notes, `created_by`.

### loans / loan_repayments
`loans`: household, `direction` (`borrowed`/`lent`), `counterparty`, `principal_amount`,
`interest_rate` NUMERIC(6,3) nullable, `start_date`, `due_date`, `account_id`, status
(`active`/`closed`), notes, `created_by`.
`repayments`: `loan_id` CASCADE, `amount`, `principal_component`, `interest_component`
(must sum to `amount`, validated in the API), `repayment_date`, `account_id`, notes,
`created_by`.

### notifications
household, optional `user_id`, `type`, `severity`, `title`, `message`, `entity_type`,
`entity_id`, `dedupe_key`, `is_read`. Indexes `(household_id, is_read)` and
`(household_id, dedupe_key)` for de-duplication.

### audit_logs
Append-only: household, `actor_user_id` (SET NULL), `actor_name`, `action`, `entity_type`,
`entity_id` (string, supports non-UUID entities), `summary`, `before_json`, `after_json`,
`ip_address`, `created_at`. Index `(household_id, created_at)`.

## Financial integrity rules enforced

1. **Balances are derived**, never stored: opening balance + posted income + transfers in −
   posted expenses − transfers out. Reversals therefore restore balances automatically.
2. **Transfers touch balances only**; they never appear in income/expense aggregates.
3. **Scope and account ownership are independent columns**; a personal expense can be paid
   from a shared account without changing its scope.
4. **Only `posted` records** feed balances, budgets, dashboards and reports.
5. **Reversal preserves history**: status, timestamp, actor and reason are recorded and audited.
6. **Savings contributions and loan principal repayments** are separate tables, so they never
   inflate expense reports.
7. **Category kind must match transaction type** (validated server-side).
8. **Ownership/authorisation checks** run on every write, not just in the UI.

## Migration workflow

```bash
cd backend
export DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/family_finance
alembic upgrade head                          # apply
alembic revision --autogenerate -m "change"   # create a new migration after model changes
alembic downgrade -1                          # roll back one revision (use with care)
```

The initial revision creates all 19 tables and indexes and works on PostgreSQL (native UUID)
and SQLite (development fallback). Docker Compose applies migrations automatically on start.
