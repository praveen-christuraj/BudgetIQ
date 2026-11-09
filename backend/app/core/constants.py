"""Domain constants shared across models, services and API endpoints."""
from decimal import Decimal

CURRENCY_DEFAULT = "INR"

# Roles
ROLE_ADMIN = "admin"
ROLE_MEMBER = "member"
ROLES = (ROLE_ADMIN, ROLE_MEMBER)

# Transaction types / statuses / scopes
TXN_INCOME = "income"
TXN_EXPENSE = "expense"
TXN_TYPES = (TXN_INCOME, TXN_EXPENSE)

SCOPE_SHARED = "shared"
SCOPE_PERSONAL = "personal"
SCOPES = (SCOPE_SHARED, SCOPE_PERSONAL)

STATUS_DRAFT = "draft"
STATUS_POSTED = "posted"
STATUS_REVERSED = "reversed"
TXN_STATUSES = (STATUS_DRAFT, STATUS_POSTED, STATUS_REVERSED)

# Account types
ACCOUNT_TYPES = (
    "cash",
    "savings",
    "current",
    "credit_card",
    "fixed_deposit",
    "investment",
    "other",
)
LIABILITY_ACCOUNT_TYPES = ("credit_card",)

# Payment methods
PAYMENT_METHODS = ("cash", "upi", "card", "bank_transfer", "cheque", "other")

# Budgets
PERIOD_MONTHLY = "monthly"
PERIOD_ANNUAL = "annual"
PERIOD_TYPES = (PERIOD_MONTHLY, PERIOD_ANNUAL)
BUDGET_ACTIVE = "active"
BUDGET_ARCHIVED = "archived"

# Recurring
FREQUENCIES = ("daily", "weekly", "monthly", "quarterly", "yearly")

# Loans
LOAN_BORROWED = "borrowed"
LOAN_LENT = "lent"
LOAN_DIRECTIONS = (LOAN_BORROWED, LOAN_LENT)
LOAN_ACTIVE = "active"
LOAN_CLOSED = "closed"

# Notifications
NOTIF_BUDGET_WARNING = "budget_warning"
NOTIF_BUDGET_EXCEEDED = "budget_exceeded"
NOTIF_RECURRING_DUE = "recurring_due"
NOTIF_LOAN_DUE = "loan_due"
NOTIF_GOAL_ACHIEVED = "goal_achieved"
SEVERITY_INFO = "info"
SEVERITY_WARNING = "warning"
SEVERITY_CRITICAL = "critical"
SEVERITY_SUCCESS = "success"

# Money helpers
ZERO = Decimal("0.00")
CENTS = Decimal("0.01")
MONEY_QUANT = Decimal("0.01")


def money(value) -> Decimal:
    """Convert arbitrary input to a 2-decimal Decimal. Never use float math."""
    return Decimal(str(value if value is not None else 0)).quantize(MONEY_QUANT)


DEFAULT_CATEGORIES = [
    # (name, kind, color, [subcategories])
    ("Salary", "income", "#2e7d32", ["Primary salary", "Bonus", "Allowance"]),
    ("Business Income", "income", "#00897b", ["Sales", "Consulting"]),
    ("Interest & Dividends", "income", "#5e35b1", ["Bank interest", "Investments"]),
    ("Other Income", "income", "#455a64", ["Gift", "Refund", "Other"]),
    ("Groceries", "expense", "#ef6c00", ["Vegetables", "Household supplies"]),
    ("Rent", "expense", "#c62828", ["House rent"]),
    ("Electricity", "expense", "#f9a825", ["Power bill"]),
    ("Water", "expense", "#0288d1", ["Water bill"]),
    ("Internet & Phone", "expense", "#1976d2", ["Broadband", "Mobile recharge"]),
    ("Transport", "expense", "#6d4c41", ["Fuel", "Public transport", "Cab"]),
    ("Education", "expense", "#3949ab", ["School fees", "Tuition", "Books"]),
    ("Medical", "expense", "#d81b60", ["Doctor", "Medicines", "Insurance"]),
    ("Entertainment", "expense", "#8e24aa", ["Movies", "Subscriptions", "Dining out"]),
    ("Household Help", "expense", "#00838f", ["Maid", "Cook"]),
    ("Insurance", "expense", "#546e7a", ["Life", "Health", "Vehicle"]),
    ("Loan EMI", "expense", "#6a1b9a", ["Home loan", "Personal loan", "Vehicle loan"]),
    ("Savings & Investments", "expense", "#00695c", ["Mutual funds", "Fixed deposit"]),
    ("Gifts & Donations", "expense", "#ad1457", ["Festivals", "Charity"]),
    ("Miscellaneous", "expense", "#616161", ["Other"]),
]
