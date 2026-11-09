"""Pagination contract shared by every paged list endpoint."""

from app.repositories.pagination import paginate
from app.core.database import SessionLocal


def test_paginate_returns_requested_slice_with_totals(db_session, admin, client, shared_account, categories):
    from app.models.audit import AuditLog

    for index in range(7):
        client.post(
            "/api/v1/transactions",
            json={
                "transaction_type": "expense",
                "scope": "shared",
                "amount": 100 + index,
                "transaction_date": "2026-11-01",
                "description": f"Row {index}",
                "account_id": shared_account["id"],
                "category_id": categories["groceries"]["id"],
                "payment_method": "cash",
                "status": "posted",
            },
            headers=admin["headers"],
        )

    session = SessionLocal()
    try:
        from app.schemas.reporting import AuditOut

        first = paginate(session, AuditLog, AuditOut, page=1, page_size=3, order_by=AuditLog.created_at)
        assert first.page == 1
        assert first.page_size == 3
        assert len(first.items) == 3
        assert first.total >= 7
        assert first.pages == (first.total + 2) // 3

        second = paginate(session, AuditLog, AuditOut, page=2, page_size=3, order_by=AuditLog.created_at)
        assert {row.id for row in first.items}.isdisjoint({row.id for row in second.items})

        beyond = paginate(session, AuditLog, AuditOut, page=999, page_size=3)
        assert beyond.items == []
    finally:
        session.close()


def test_audit_endpoint_pages_and_counts(client, admin):
    for index in range(5):
        client.post(
            "/api/v1/members",
            json={"full_name": f"Member {index}", "email": f"m{index}@example.com", "password": "MemberPass123", "role": "member"},
            headers=admin["headers"],
        )

    page_one = client.get("/api/v1/audit", params={"page": 1, "page_size": 2}, headers=admin["headers"])
    assert page_one.status_code == 200
    body = page_one.json()
    assert body["page"] == 1 and body["page_size"] == 2
    assert len(body["items"]) == 2
    assert body["pages"] == (body["total"] + 1) // 2

    last = client.get("/api/v1/audit", params={"page": body["pages"], "page_size": 2}, headers=admin["headers"]).json()
    assert len(last["items"]) >= 1
    assert last["total"] == body["total"]
