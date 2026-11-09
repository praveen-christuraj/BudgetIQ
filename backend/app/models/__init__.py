"""Import every model so SQLAlchemy's registry and Alembic see all tables."""
from app.models.account import Account
from app.models.audit import AuditLog
from app.models.budget import Budget, BudgetAllocation
from app.models.category import Category, Subcategory
from app.models.household import Household, HouseholdMember, HouseholdSettings, User
from app.models.loan import Loan, LoanRepayment
from app.models.notification import Notification
from app.models.recurring import RecurringRule
from app.models.savings import SavingsContribution, SavingsGoal
from app.models.transaction import Transaction, TransactionAttachment, Transfer

__all__ = [
    "Account",
    "AuditLog",
    "Budget",
    "BudgetAllocation",
    "Category",
    "Subcategory",
    "Household",
    "HouseholdMember",
    "HouseholdSettings",
    "User",
    "Loan",
    "LoanRepayment",
    "Notification",
    "RecurringRule",
    "SavingsContribution",
    "SavingsGoal",
    "Transaction",
    "TransactionAttachment",
    "Transfer",
]
