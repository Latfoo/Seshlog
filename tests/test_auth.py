import pytest


VALID_EMAIL = "user@example.com"
VALID_PASSWORD = "Password123"


def test_register_success(client):
    response = client.post("/auth/register", json={
        "email": VALID_EMAIL,
        "password": VALID_PASSWORD
    })
    assert response.status_code == 201
    assert "access_token" in response.cookies


def test_register_duplicate_email_returns_400(client):
    client.post("/auth/register", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})

    response = client.post("/auth/register", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})

    assert response.status_code == 400


def test_login_success(client):
    client.post("/auth/register", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})

    response = client.post("/auth/login", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})

    assert response.status_code == 200
    assert "access_token" in response.cookies


def test_login_wrong_password_returns_401(client):
    client.post("/auth/register", json={"email": VALID_EMAIL, "password": VALID_PASSWORD})

    response = client.post("/auth/login", json={"email": VALID_EMAIL, "password": "wrongpassword"})

    assert response.status_code == 401


def test_login_nonexistent_email_returns_401(client):
    response = client.post("/auth/login", json={
        "email": "nobody@example.com",
        "password": VALID_PASSWORD
    })

    assert response.status_code == 401


def test_accessing_protected_endpoint_without_login_returns_401(client):
    response = client.get("/sessions")

    assert response.status_code == 401


def test_tampered_token_returns_401(client):
    client.cookies.set("access_token", "not.a.valid.jwt")
    response = client.get("/sessions")

    assert response.status_code == 401


def test_logout_clears_session(auth_client):
    auth_client.post("/auth/logout")

    response = auth_client.get("/sessions")

    assert response.status_code == 401


# --- Email validation ---

@pytest.mark.parametrize("bad_email", [
    "notanemail",
    "missing@domain",
    "@nodomain.com",
    "spaces in@email.com",
    "",
])
def test_register_invalid_email_returns_422(client, bad_email):
    response = client.post("/auth/register", json={"email": bad_email, "password": VALID_PASSWORD})
    assert response.status_code == 422


def test_register_email_is_normalized_to_lowercase(client):
    response = client.post("/auth/register", json={"email": "User@Example.COM", "password": VALID_PASSWORD})
    assert response.status_code == 201

    # Logging in with the lowercase version should work
    response = client.post("/auth/login", json={"email": "user@example.com", "password": VALID_PASSWORD})
    assert response.status_code == 200


def test_register_email_with_leading_trailing_spaces_is_accepted(client):
    response = client.post("/auth/register", json={"email": "  user@example.com  ", "password": VALID_PASSWORD})
    assert response.status_code == 201


# --- Password validation ---

def test_register_password_too_short_returns_422(client):
    response = client.post("/auth/register", json={"email": VALID_EMAIL, "password": "Ab1"})
    assert response.status_code == 422


def test_register_password_no_uppercase_returns_422(client):
    response = client.post("/auth/register", json={"email": VALID_EMAIL, "password": "password123"})
    assert response.status_code == 422


def test_register_password_no_lowercase_returns_422(client):
    response = client.post("/auth/register", json={"email": VALID_EMAIL, "password": "PASSWORD123"})
    assert response.status_code == 422


def test_register_password_no_digit_returns_422(client):
    response = client.post("/auth/register", json={"email": VALID_EMAIL, "password": "PasswordOnly"})
    assert response.status_code == 422


def test_register_password_empty_returns_422(client):
    response = client.post("/auth/register", json={"email": VALID_EMAIL, "password": ""})
    assert response.status_code == 422
