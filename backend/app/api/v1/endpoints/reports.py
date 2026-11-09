"""Dashboard aggregation and financial reports with Excel/PDF export."""
import calendar
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentContext, get_current_context
from app.core.constants import STATUS_POSTED, TXN_INCOME
from app.core.errors import bad_request
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.permissions.rbac import is_admin, transaction_visibility_filter
from app.reports.export import ReportDocument, ReportSection, build_excel, build_pdf
from app.reports.service import (
    account_balances,
    annual_summary,
    budget_vs_actual,
    category_expenses,
    member_summary,
    monthly_summary_row,
    outstanding_loans,
    recurring_schedule,
    savings_growth,
    scope_report,
)
from app.schemas.reporting import (
    AccountBalanceRow,
    AnnualSummary,
    BudgetVsActualRow,
    CategoryReportRow,
    DashboardOut,
    LoanReportRow,
    MemberReportRow,
    MonthlySummary,
    RecurringRow,
    RegisterRow,
    ReportExportRequest,
    SavingsGrowthRow,
    ScopeReport,
    TransactionRegisterReport,
)
from app.services.dashboard import build_dashboard
from app.core.constants import money

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])


def _safe_member(ctx: CurrentContext, member_id: uuid.UUID | None) -> uuid.UUID | None:
    if not is_admin(ctx):
        return ctx.user.id
    return member_id


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    month: str | None = Query(default=None, description="YYYY-MM"),
    view: str = Query(default="family", pattern="^(family|personal)$"),
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    return build_dashboard(db, ctx, month, view)


@router.get("/monthly-summary", response_model=MonthlySummary)
def monthly_summary(
    year: int | None = None,
    month: int | None = None,
    member_id: uuid.UUID | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    today = date.today()
    year = year or today.year
    month = month or today.month
    if not 1 <= month <= 12:
        raise bad_request("Month must be between 1 and 12")
    return monthly_summary_row(db, ctx, year, month, _safe_member(ctx, member_id))


@router.get("/annual-summary", response_model=AnnualSummary)
def annual_summary_endpoint(
    year: int | None = None,
    member_id: uuid.UUID | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    return annual_summary(db, ctx, year or date.today().year, _safe_member(ctx, member_id))


@router.get("/category-expenses", response_model=list[CategoryReportRow])
def category_expenses_endpoint(
    date_from: date | None = None,
    date_to: date | None = None,
    member_id: uuid.UUID | None = None,
    kind: str = Query(default="expense", pattern="^(income|expense)$"),
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    return category_expenses(db, ctx, date_from, date_to, _safe_member(ctx, member_id), kind)


@router.get("/member-summary", response_model=list[MemberReportRow])
def member_summary_endpoint(
    date_from: date | None = None,
    date_to: date | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    return member_summary(db, ctx, date_from, date_to)


@router.get("/shared-vs-personal", response_model=ScopeReport)
def shared_vs_personal(
    date_from: date | None = None,
    date_to: date | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    return scope_report(db, ctx, date_from, date_to)


@router.get("/budget-vs-actual", response_model=list[BudgetVsActualRow])
def budget_vs_actual_endpoint(
    on_date: date | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    return budget_vs_actual(db, ctx, on_date)


@router.get("/savings-growth", response_model=list[SavingsGrowthRow])
def savings_growth_endpoint(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    return savings_growth(db, ctx)


@router.get("/account-balances", response_model=list[AccountBalanceRow])
def account_balances_endpoint(
    date_from: date | None = None,
    date_to: date | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    return account_balances(db, ctx, date_from, date_to)


@router.get("/outstanding-loans", response_model=list[LoanReportRow])
def outstanding_loans_endpoint(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    return outstanding_loans(db, ctx)


@router.get("/recurring-schedule", response_model=list[RecurringRow])
def recurring_schedule_endpoint(ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    return recurring_schedule(db, ctx)


def _document_for(
    db: Session,
    ctx: CurrentContext,
    report: str,
    date_from: date | None,
    date_to: date | None,
    year: int,
    member_id: uuid.UUID | None,
) -> ReportDocument:
    meta = {
        "Household": ctx.household.name,
        "Generated by": ctx.user.full_name,
        "Generated on": datetime.now().strftime("%d-%m-%Y %H:%M"),
    }

    if report == "monthly-summary":
        month_filters = [
            Transaction.household_id == ctx.household_id,
            transaction_visibility_filter(ctx),
            Transaction.status == STATUS_POSTED,
        ]
        if date_from:
            month_filters.append(Transaction.transaction_date >= date_from)
        if date_to:
            month_filters.append(Transaction.transaction_date <= date_to)
        if member_id:
            month_filters.append(Transaction.owner_user_id == member_id)
        buckets: dict[str, dict[str, object]] = {}
        for txn in db.execute(
            select(Transaction).where(*month_filters).order_by(Transaction.transaction_date)
        ).scalars():
            key = txn.transaction_date.strftime("%Y-%m")
            bucket = buckets.setdefault(
                key, {"income": money(0), "expenses": money(0), "count": 0}
            )
            bucket["count"] = int(bucket["count"]) + 1
            if txn.transaction_type == TXN_INCOME:
                bucket["income"] = money(bucket["income"]) + money(txn.amount)
            else:
                bucket["expenses"] = money(bucket["expenses"]) + money(txn.amount)
        rows = []
        total_income = money(0)
        total_expenses = money(0)
        total_count = 0
        for key in sorted(buckets):
            bucket = buckets[key]
            income = money(bucket["income"])
            expenses = money(bucket["expenses"])
            total_income += income
            total_expenses += expenses
            total_count += int(bucket["count"])
            rows.append([key, income, expenses, money(income - expenses), int(bucket["count"])])
        return ReportDocument(
            title="Monthly Income and Expenditure",
            subtitle="Income, spending and net cash flow for every month with activity",
            meta={
                **meta,
                "Period": f"{date_from or 'all time'} to {date_to or date.today()}",
            },
            sections=[
                ReportSection(
                    title="Monthly breakdown",
                    headers=["Month", "Income (INR)", "Expenses (INR)", "Net (INR)", "Transactions"],
                    rows=rows,
                    total_row=["Total", total_income, total_expenses, money(total_income - total_expenses), total_count],
                )
            ],
        )

    if report == "annual-summary":
        summary = annual_summary(db, ctx, year, _safe_member(ctx, member_id))
        rows = [
            [m.label, m.income, m.expenses, m.net, m.savings_contributions, m.transfers, m.transaction_count]
            for m in summary.months
        ]
        return ReportDocument(
            title=f"Annual Financial Summary {year}",
            subtitle="Income, expenditure, savings and transfers by month",
            meta=meta,
            sections=[
                ReportSection(
                    title=f"Year {year}",
                    headers=["Month", "Income (INR)", "Expenses (INR)", "Net (INR)", "Savings (INR)", "Transfers (INR)", "Transactions"],
                    rows=rows,
                    total_row=[
                        "Total",
                        summary.total_income,
                        summary.total_expenses,
                        summary.net,
                        summary.total_savings,
                        "",
                        sum(m.transaction_count for m in summary.months),
                    ],
                )
            ],
        )

    if report == "category-expenses":
        rows_data = category_expenses(db, ctx, date_from, date_to, _safe_member(ctx, member_id))
        return ReportDocument(
            title="Category-wise Expenses",
            subtitle="Posted expenses grouped by category",
            meta={**meta, "Period": f"{date_from or 'all time'} to {date_to or date.today()}"},
            sections=[
                ReportSection(
                    title="Category breakdown",
                    headers=["Category", "Amount (INR)", "Share %", "Transactions"],
                    rows=[[r.category, r.amount, f"{r.percent:.1f}%", r.transaction_count] for r in rows_data],
                    total_row=["Total", sum((r.amount for r in rows_data), start=0), "100.0%", sum(r.transaction_count for r in rows_data)],
                )
            ],
        )

    if report == "member-summary":
        rows_data = member_summary(db, ctx, date_from, date_to)
        return ReportDocument(
            title="Family Member Summary",
            subtitle="Income and spending by family member",
            meta=meta,
            sections=[
                ReportSection(
                    title="Members",
                    headers=["Member", "Income (INR)", "Expenses (INR)", "Net (INR)", "Shared expenses", "Personal expenses"],
                    rows=[[r.member, r.income, r.expenses, r.net, r.shared_expenses, r.personal_expenses] for r in rows_data],
                    total_row=[
                        "Total",
                        sum((r.income for r in rows_data), start=0),
                        sum((r.expenses for r in rows_data), start=0),
                        sum((r.net for r in rows_data), start=0),
                        sum((r.shared_expenses for r in rows_data), start=0),
                        sum((r.personal_expenses for r in rows_data), start=0),
                    ],
                )
            ],
        )

    if report == "account-balances":
        rows_data = account_balances(db, ctx)
        return ReportDocument(
            title="Account Balances",
            subtitle="Derived from opening balance plus posted entries",
            meta=meta,
            sections=[
                ReportSection(
                    title="Accounts",
                    headers=["Account", "Type", "Owner", "Opening", "Income", "Expenses", "Transfers in", "Transfers out", "Balance"],
                    rows=[
                        [r.name, r.account_type.replace("_", " ").title(), r.owner, r.opening_balance, r.income, r.expenses, r.transfers_in, r.transfers_out, r.current_balance]
                        for r in rows_data
                    ],
                    total_row=["Total", "", "", "", "", "", "", "", sum((r.current_balance for r in rows_data), start=0)],
                )
            ],
        )

    if report == "outstanding-loans":
        rows_data = outstanding_loans(db, ctx)
        return ReportDocument(
            title="Outstanding Loans & Debts",
            subtitle="Borrowed and lent amounts with repayment status",
            meta=meta,
            sections=[
                ReportSection(
                    title="Loans",
                    headers=["Counterparty", "Direction", "Principal", "Repaid", "Outstanding", "Due date", "Status"],
                    rows=[
                        [r.counterparty, r.direction.title(), r.principal, r.repaid, r.outstanding, r.due_date, "Overdue" if r.is_overdue else r.status.title()]
                        for r in rows_data
                    ],
                    total_row=["Total", "", sum((r.principal for r in rows_data), start=0), sum((r.repaid for r in rows_data), start=0), sum((r.outstanding for r in rows_data), start=0), "", ""],
                )
            ],
        )

    if report == "recurring-schedule":
        rows_data = recurring_schedule(db, ctx)
        return ReportDocument(
            title="Recurring Payment Schedule",
            subtitle="Upcoming bills, subscriptions, salary and commitments",
            meta=meta,
            sections=[
                ReportSection(
                    title="Schedule",
                    headers=["Name", "Frequency", "Amount (INR)", "Next due", "Days until due", "Account", "Responsible"],
                    rows=[[r.name, r.frequency.title(), r.amount, r.next_due_date, r.days_until_due, r.account, r.responsible or "-"] for r in rows_data],
                )
            ],
        )

    if report == "savings-growth":
        rows_data = savings_growth(db, ctx)
        return ReportDocument(
            title="Savings Growth",
            subtitle="Progress towards every savings goal",
            meta=meta,
            sections=[
                ReportSection(
                    title="Goals",
                    headers=["Goal", "Target (INR)", "Saved (INR)", "Progress %"],
                    rows=[[r.goal, r.target, r.current, f"{r.progress_percent:.1f}%"] for r in rows_data],
                    total_row=["Total", sum((r.target for r in rows_data), start=0), sum((r.current for r in rows_data), start=0), ""],
                )
            ],
        )

    if report == "budget-vs-actual":
        rows_data = budget_vs_actual(db, ctx)
        return ReportDocument(
            title="Budget vs Actual",
            subtitle="Planned allocations compared with posted spending",
            meta=meta,
            sections=[
                ReportSection(
                    title="Budgets",
                    headers=["Budget", "Period", "Owner", "Planned", "Actual", "Remaining", "Utilisation %"],
                    rows=[[r.budget, r.period, r.owner, r.planned, r.actual, r.remaining, f"{r.utilization_percent:.1f}%"] for r in rows_data],
                    total_row=["Total", "", "", sum((r.planned for r in rows_data), start=0), sum((r.actual for r in rows_data), start=0), sum((r.remaining for r in rows_data), start=0), ""],
                )
            ],
        )

    if report == "shared-vs-personal":
        split = scope_report(db, ctx, date_from, date_to)
        return ReportDocument(
            title="Shared vs Personal Spending",
            subtitle="How household and individual money is split",
            meta={**meta, "Period": f"{date_from or 'all time'} to {date_to or date.today()}"},
            sections=[
                ReportSection(
                    title="Scope split",
                    headers=["Scope", "Income (INR)", "Expenses (INR)", "Share of expenses %"],
                    rows=[
                        ["Shared", split.shared_income, split.shared_expenses, f"{split.shared_percent:.1f}%"],
                        ["Personal", split.personal_income, split.personal_expenses, f"{split.personal_percent:.1f}%"],
                    ],
                    total_row=[
                        "Total",
                        split.shared_income + split.personal_income,
                        split.shared_expenses + split.personal_expenses,
                        "100.0%",
                    ],
                )
            ],
        )

    # Default: transaction register
    filters = [
        Transaction.household_id == ctx.household_id,
        transaction_visibility_filter(ctx),
        Transaction.status != "reversed",
    ]
    if date_from:
        filters.append(Transaction.transaction_date >= date_from)
    if date_to:
        filters.append(Transaction.transaction_date <= date_to)
    if member_id:
        filters.append(Transaction.owner_user_id == member_id)
    transactions = db.execute(
        select(Transaction).where(*filters).order_by(Transaction.transaction_date.desc()).limit(5000)
    ).scalars().all()
    return ReportDocument(
        title="Transaction Register",
        subtitle="Income and expenditure records",
        meta={**meta, "Period": f"{date_from or 'all time'} to {date_to or date.today()}"},
        sections=[
            ReportSection(
                title="Transactions",
                headers=["Date", "Type", "Description", "Scope", "Owner", "Amount (INR)", "Status"],
                rows=[
                    [
                        t.transaction_date,
                        t.transaction_type.title(),
                        t.description,
                        t.scope.title(),
                        t.owner.full_name if t.owner else "Household",
                        t.amount,
                        t.status.title(),
                    ]
                    for t in transactions
                ],
            )
        ],
    )


@router.get("/transactions", response_model=TransactionRegisterReport)
def transaction_register(
    date_from: date | None = None,
    date_to: date | None = None,
    member_id: uuid.UUID | None = None,
    include_drafts: bool = False,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    """Ten report types: the tenth is the complete transaction register."""
    filters = [
        Transaction.household_id == ctx.household_id,
        transaction_visibility_filter(ctx),
        Transaction.status != "reversed",
    ]
    if not include_drafts:
        filters.append(Transaction.status == STATUS_POSTED)
    if date_from:
        filters.append(Transaction.transaction_date >= date_from)
    if date_to:
        filters.append(Transaction.transaction_date <= date_to)
    safe_member = _safe_member(ctx, member_id)
    if safe_member:
        filters.append(Transaction.owner_user_id == safe_member)
    rows = db.execute(
        select(Transaction).where(*filters).order_by(Transaction.transaction_date.desc()).limit(5000)
    ).scalars().all()

    total_income = money(0)
    total_expenses = money(0)
    for row in rows:
        if row.status != "posted":
            continue
        if row.transaction_type == "income":
            total_income += money(row.amount)
        else:
            total_expenses += money(row.amount)

    return TransactionRegisterReport(
        rows=[
            RegisterRow(
                transaction_id=row.id,
                transaction_date=row.transaction_date,
                transaction_type=row.transaction_type,
                description=row.description,
                scope=row.scope,
                owner=row.owner.full_name if row.owner else "Household",
                amount=money(row.amount),
                status=row.status,
            )
            for row in rows
        ],
        total_income=money(total_income),
        total_expenses=money(total_expenses),
        count=len(rows),
    )


@router.get("/export")
def export_report(
    report: str = Query(default="annual-summary"),
    format: str = Query(default="xlsx", pattern="^(xlsx|pdf)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    year: int | None = None,
    member_id: uuid.UUID | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    supported = {
        "annual-summary",
        "monthly-summary",
        "shared-vs-personal",
        "category-expenses",
        "member-summary",
        "account-balances",
        "outstanding-loans",
        "recurring-schedule",
        "savings-growth",
        "budget-vs-actual",
        "transactions",
    }
    if report not in supported:
        raise bad_request(f"Unknown report. Supported: {', '.join(sorted(supported))}")

    document = _document_for(
        db, ctx, report, date_from, date_to, year or date.today().year, _safe_member(ctx, member_id)
    )
    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    if format == "pdf":
        stream = build_pdf(document)
        return StreamingResponse(
            stream,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{report}_{stamp}.pdf"'},
        )
    stream = build_excel(document)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{report}_{stamp}.xlsx"'},
    )
