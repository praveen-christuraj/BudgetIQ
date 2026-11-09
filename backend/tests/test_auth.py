"""Authentication, first-run setup and access-control tests."""
from tests.conftest import ADMIN, MEMBER


def test_setup_is_only_allowed_once(client, admin):
    status = client.get("/api/v1/auth/status").json()
    assert status["initialized"] is True

    second = client.post("/api/v1/auth/setup", json={**ADMIN, "email": "another@example.com"})
    assert second.status_code == 409


def test_first_user_is_administrator(client, admin):
    me = client.get("/api/v1/auth/me", headers=admin["headers"])
    assert me.status_code == 200
    assert me.json()["role"] == "admin"
    assert me.json()["user"]["email"] == ADMIN["email"].lower()


def test_login_rejects_bad_password_and_locks_after_repeated_failures(client, admin):
    bad = client.post("/api/v1/auth/login", json={"email": ADMIN["email"], "password": "wrong-pass"})
    assert bad.status_code == 401
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": ADMIN["email"], "password": "wrong-pass"})
    locked = client.post("/api/v1/auth/login", json={"email": ADMIN["email"], "password": ADMIN["password"]})
    assert locked.status_code == 429


def test_protected_endpoint_requires_token(client):
    assert client.get("/api/v1/accounts").status_code == 401
    assert client.get("/api/v1/accounts", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_refresh_token_issues_new_access_token(client, admin):
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": admin["refresh"]})
    assert response.status_code == 200
    token = response.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200


def test_access_token_cannot_be_used_as_refresh(client, admin):
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": admin["token"]})
    assert response.status_code == 401


def test_administrator_creates_member_and_member_cannot_manage_members(client, admin, member):
    listing = client.get("/api/v1/members", headers=member["headers"])
    assert listing.status_code == 200
    assert {m["email"] for m in listing.json()} == {ADMIN["email"], MEMBER["email"]}

    attempt = client.post(
        "/api/v1/members",
        json={**MEMBER, "email": "third@example.com"},
        headers=member["headers"],
    )
    assert attempt.status_code == 403


def test_member_password_change(client, member):
    changed = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": MEMBER["password"], "new_password": "BrandNew123"},
        headers=member["headers"],
    )
    assert changed.status_code == 200
    login = client.post(
        "/api/v1/auth/login", json={"email": MEMBER["email"], "password": "BrandNew123"}
    )
    assert login.status_code == 200


def test_household_isolation_between_households(client, admin):
    """A second household must never see the first household's data."""
    from app.core.database import SessionLocal
    from app.core.security import hash_password
    from app.models.household import Household, HouseholdMember, User

    db = SessionLocal()
    other_household = Household(name="Other Family")
    db.add(other_household)
    db.flush()
    other_user = User(
        email="other@example.com",
        full_name="Other Admin",
        password_hash=hash_password("OtherPass123"),
    )
    db.add(other_user)
    db.flush()
    db.add(
        HouseholdMember(
            household_id=other_household.id,
            user_id=other_user.id,
            role="admin",
            relationship_label="Self",
        )
    )
    db.commit()
    db.close()

    login = client.post(
        "/api/v1/auth/login", json={"email": "other@example.com", "password": "OtherPass123"}
    )
    assert login.status_code == 200
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    accounts = client.get("/api/v1/accounts", headers=other_headers).json()
    assert accounts == []

    transactions = client.get("/api/v1/transactions", headers=other_headers).json()
    assert transactions["total"] == 0

    # Members of the first household are not visible to the second.
    members = client.get("/api/v1/members", headers=other_headers).json()
    assert [m["email"] for m in members] == ["other@example.com"]
