# RBAC Permission Matrix

Roles: **Administrator** (`admin`) and **Member** (`member`). Only one household exists per
deployment by default; every query is scoped to the caller's household on the server.

## 1. Summary

| Capability | Administrator | Member |
| --- | --- | --- |
| Sign in, change own password | ✅ | ✅ |
| Create accounts/budgets/etc. | ✅ | ✅ (own records) |
| Create additional members | ✅ | ❌ |
| Household settings, thresholds, backup settings | ✅ | ❌ (read-only system info) |
| Audit history | ✅ | ❌ |
| See every shared transaction | ✅ | ✅ |
| See another member's personal transactions | ✅ | ❌ |
| Edit/delete another member's transactions | ✅ (audited) | ❌ |
| Manage members' accounts | ✅ | ❌ |
| Manage own accounts | ✅ | ✅ |
| Deactivate last administrator | ❌ (blocked) | ❌ |

## 2. Detailed matrix

### Authentication & account
| Action | Admin | Member | Enforcement |
| --- | --- | --- | --- |
| `GET /auth/status` (public) | ✅ | ✅ | Public |
| `POST /auth/setup` (first user only) | ✅ | – | Blocked once a household exists |
| `POST /auth/login`, `/refresh`, `/logout` | ✅ | ✅ | Public / token |
| `GET /auth/me` | ✅ | ✅ | Authenticated |
| `POST /auth/change-password` | ✅ | ✅ | Own password only |

### Family management
| Action | Admin | Member | Enforcement |
| --- | --- | --- | --- |
| List household members | ✅ | ✅ | Household scope |
| Create member | ✅ | ❌ | `require_admin` |
| Edit member/role | ✅ | ❌ | `require_admin`; last-admin guard |
| Reset another member's password | ✅ | ❌ | `require_admin` |
| Deactivate member | ✅ | ❌ | `require_admin`; last-admin guard |
| Edit own profile | ✅ | ✅ | `PATCH /members/{self}` allowed for self |

### Accounts
| Action | Admin | Member | Enforcement |
| --- | --- | --- | --- |
| View shared accounts | ✅ | ✅ | Household |
| View own personal accounts | ✅ | ✅ | Owner |
| View another member's personal account | ✅ | ❌ | `visible_account_ids` |
| Create account | ✅ | ✅ | Members must own what they create |
| Edit account | ✅ | ✅ own | `assert_can_manage` |
| Deactivate account | ✅ | ✅ own | No hard delete with history |

### Transactions, transfers, receipts
| Action | Admin | Member | Enforcement |
| --- | --- | --- | --- |
| Create shared transaction | ✅ | ✅ | Any member |
| Create personal transaction | ✅ | ✅ own only | Owner must be self |
| Compare/confirm duplicates | ✅ | ✅ | Scope-aware |
| View shared transactions | ✅ | ✅ | Household |
| View personal transactions | ✅ all | ✅ own only | Visibility filter |
| Edit transaction | ✅ all | ✅ own/created | `can_edit_transaction` |
| Reverse transaction | ✅ all | ✅ own/created | Recorded with reason + audit |
| Hard delete draft | ✅ | ✅ own | Drafts never affected balances |
| Upload/delete receipts | ✅ | ✅ own | MIME/size validated |
| Export transactions | ✅ household | ✅ visible only | Same filter as list |
| Create / reverse transfer | ✅ | ✅ visible accounts | Both accounts must be visible |

### Planning (budgets, recurring, savings, loans)
| Action | Admin | Member | Enforcement |
| --- | --- | --- | --- |
| View family budgets | ✅ | ✅ | Household |
| View another member's budget | ✅ | ❌ | `owner_user_id` check |
| Create family budget | ✅ | ✅ | Members may too (blueprint: everyone records) |
| Create personal budget | ✅ | ✅ own | Owner check |
| Edit/archive budget | ✅ | ✅ own | `assert_can_manage` |
| Set allocations, apply carry-forward | ✅ | ✅ own | Owner check |
| Manage recurring rules | ✅ | ✅ own/created | Owner check |
| Generate drafts (due or manual) | ✅ | ✅ own/created | Owner check |
| View/manage goals | ✅ all | ✅ shared + own | Owner check |
| Add contributions | ✅ | ✅ shared + own | Owner check |
| View/manage loans | ✅ all | ✅ household | Loan records are household-level by design |
| Record repayment | ✅ | ✅ | Validated split |
| Close/archive loan | ✅ | ✅ | Creating/editing user or admin |

### Analytics, notifications, administration
| Action | Admin | Member | Enforcement |
| --- | --- | --- | --- |
| Dashboard family view | ✅ | ✅ | Household aggregates |
| Dashboard personal view | ✅ | ✅ | Own data |
| All report endpoints | ✅ | ✅ (visibility-scoped) | Same filters as transactions |
| Excel/PDF export | ✅ | ✅ | Server-side generation |
| Read notifications | ✅ | ✅ | Own + household |
| Mark notification read / read-all | ✅ | ✅ | Own |
| Audit history & action list | ✅ | ❌ | `require_admin` |
| Household settings (name, thresholds, currency) | ✅ | ❌ | `require_admin` |
| System info | ✅ | ✅ (read-only) | Authenticated |

## 3. Implementation

* `backend/app/core/deps.py` — resolves the authenticated user and household context.
* `backend/app/permissions/rbac.py` — `require_admin`, `assert_can_manage`,
  `can_edit_transaction`, `visible_account_ids`, `visible_transaction_query`.
* Frontend mirrors permissions for UX only (`ProtectedRoutes`, nav filtering). The backend is
  the source of truth; every endpoint re-checks access.

## 4. Test evidence

`backend/tests/test_auth.py`, `test_accounts_transactions.py` and `test_reports.py` verify (among others):

* members cannot list/create members or read audit history (403);
* members never see another member's personal transactions in lists, exports or dashboards;
* members cannot edit another member's transaction, but administrators can;
* the last administrator cannot be demoted or deactivated;
* account visibility blocks cross-member transaction creation.
