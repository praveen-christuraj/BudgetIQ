"""Loans and debts: borrowing, lending and repayment tracking.

Loan principal repayments are recorded here - not as household consumption
expenses - so reports stay accurate.
"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.constants import LOAN_ACTIVE, LOAN_CLOSED, money
from app.core.database import get_db
from app.core.deps import CurrentContext, client_ip, get_current_context
from app.core.errors import bad_request, forbidden, not_found
from app.models.loan import Loan, LoanRepayment
from app.permissions.rbac import is_admin
from app.schemas.common import Message
from app.schemas.planning import LoanCreate, LoanOut, LoanUpdate, RepaymentCreate
from app.services.audit import log_event
from app.services.serializers import loan_out
from app.services.transactions import get_visible_account

router = APIRouter(prefix="/loans", tags=["Loans & Debts"])

LOAN_LOAD = (
    selectinload(Loan.repayments).selectinload(LoanRepayment.account),
    selectinload(Loan.repayments).selectinload(LoanRepayment.creator),
    selectinload(Loan.account),
)


def _get_loan(db: Session, ctx: CurrentContext, loan_id: uuid.UUID) -> Loan:
    loan = db.execute(
        select(Loan).where(Loan.id == loan_id, Loan.household_id == ctx.household_id).options(*LOAN_LOAD)
    ).scalar_one_or_none()
    if loan is None:
        raise not_found("Loan")
    return loan


def _principal_repaid(loan: Loan):
    return money(sum((money(r.principal_component) for r in loan.repayments), start=money(0)))


@router.get("", response_model=list[LoanOut])
def list_loans(
    direction: str | None = None,
    status: str | None = None,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    query = select(Loan).where(Loan.household_id == ctx.household_id).options(*LOAN_LOAD)
    if direction:
        query = query.where(Loan.direction == direction)
    if status:
        query = query.where(Loan.status == status)
    loans = db.execute(query.order_by(Loan.start_date.desc())).scalars().all()
    return [loan_out(loan) for loan in loans]


@router.get("/{loan_id}", response_model=LoanOut)
def get_loan(loan_id: uuid.UUID, ctx: CurrentContext = Depends(get_current_context), db: Session = Depends(get_db)):
    return loan_out(_get_loan(db, ctx, loan_id))


@router.post("", response_model=LoanOut, status_code=201)
def create_loan(
    payload: LoanCreate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    if payload.account_id:
        get_visible_account(db, ctx, payload.account_id)
    if payload.due_date and payload.due_date < payload.start_date:
        raise bad_request("Due date must be on or after the start date")

    loan = Loan(
        household_id=ctx.household_id,
        direction=payload.direction,
        counterparty=payload.counterparty.strip(),
        principal_amount=money(payload.principal_amount),
        interest_rate=payload.interest_rate,
        start_date=payload.start_date,
        due_date=payload.due_date,
        account_id=payload.account_id,
        notes=payload.notes,
        status=LOAN_ACTIVE,
        created_by=ctx.user.id,
    )
    db.add(loan)
    db.flush()
    log_event(
        db,
        ctx,
        action="loan.create",
        entity_type="loan",
        entity_id=loan.id,
        summary=f"Recorded {loan.direction} loan with {loan.counterparty} of {money(loan.principal_amount)}",
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(loan)
    return loan_out(loan)


@router.patch("/{loan_id}", response_model=LoanOut)
def update_loan(
    loan_id: uuid.UUID,
    payload: LoanUpdate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    loan = _get_loan(db, ctx, loan_id)
    if not is_admin(ctx) and loan.created_by != ctx.user.id:
        raise forbidden("You can only modify loans you recorded")
    data = payload.model_dump(exclude_unset=True)
    if "account_id" in data and data["account_id"]:
        get_visible_account(db, ctx, data["account_id"])
    for field, value in data.items():
        if field == "principal_amount" and value is not None:
            if money(value) < _principal_repaid(loan):
                raise bad_request("Principal cannot be less than the amount already repaid")
            value = money(value)
        setattr(loan, field, value)
    log_event(
        db,
        ctx,
        action="loan.update",
        entity_type="loan",
        entity_id=loan.id,
        summary=f"Updated loan with {loan.counterparty}",
        after={k: str(v) for k, v in data.items()},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(loan)
    return loan_out(loan)


@router.delete("/{loan_id}", response_model=Message)
def close_loan(
    loan_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    loan = _get_loan(db, ctx, loan_id)
    if not is_admin(ctx) and loan.created_by != ctx.user.id:
        raise forbidden("You can only close loans you recorded")
    loan.status = LOAN_CLOSED
    log_event(
        db,
        ctx,
        action="loan.close",
        entity_type="loan",
        entity_id=loan.id,
        summary=f"Closed loan with {loan.counterparty}",
        ip_address=client_ip(request),
    )
    db.commit()
    return Message(message="Loan marked as closed. Repayment history is preserved.")


@router.post("/{loan_id}/repayments", response_model=LoanOut, status_code=201)
def add_repayment(
    loan_id: uuid.UUID,
    payload: RepaymentCreate,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    loan = _get_loan(db, ctx, loan_id)
    if loan.status == LOAN_CLOSED:
        raise bad_request("This loan is already closed")
    if payload.account_id:
        get_visible_account(db, ctx, payload.account_id)

    amount = money(payload.amount)
    principal = money(payload.principal_component) if payload.principal_component is not None else amount
    interest = money(payload.interest_component) if payload.interest_component is not None else money(0)
    if principal + interest != amount:
        raise bad_request("Principal and interest components must add up to the repayment amount")

    outstanding = money(money(loan.principal_amount) - _principal_repaid(loan))
    if principal > outstanding:
        raise bad_request(
            f"Principal component ({principal}) exceeds the outstanding balance ({outstanding})"
        )

    repayment = LoanRepayment(
        loan_id=loan.id,
        amount=amount,
        principal_component=principal,
        interest_component=interest,
        repayment_date=payload.repayment_date,
        account_id=payload.account_id,
        notes=payload.notes,
        created_by=ctx.user.id,
    )
    db.add(repayment)
    db.flush()

    if money(outstanding - principal) <= 0:
        loan.status = LOAN_CLOSED

    log_event(
        db,
        ctx,
        action="loan.repayment",
        entity_type="loan",
        entity_id=loan.id,
        summary=f"Recorded repayment of {amount} for loan with {loan.counterparty}",
        after={
            "amount": str(amount),
            "principal": str(principal),
            "interest": str(interest),
            "date": str(payload.repayment_date),
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(loan)
    return loan_out(loan)


@router.delete("/{loan_id}/repayments/{repayment_id}", response_model=LoanOut)
def delete_repayment(
    loan_id: uuid.UUID,
    repayment_id: uuid.UUID,
    request: Request,
    ctx: CurrentContext = Depends(get_current_context),
    db: Session = Depends(get_db),
):
    loan = _get_loan(db, ctx, loan_id)
    repayment = db.get(LoanRepayment, repayment_id)
    if repayment is None or repayment.loan_id != loan.id:
        raise not_found("Repayment")
    if not is_admin(ctx) and repayment.created_by != ctx.user.id:
        raise forbidden("You can only remove repayments you recorded")

    db.delete(repayment)
    db.flush()
    if loan.status == LOAN_CLOSED and money(loan.principal_amount) > _principal_repaid(loan):
        loan.status = LOAN_ACTIVE
    log_event(
        db,
        ctx,
        action="loan.repayment_delete",
        entity_type="loan",
        entity_id=loan.id,
        summary=f"Removed repayment of {money(repayment.amount)} for loan with {loan.counterparty}",
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(loan)
    return loan_out(loan)
