def test_register_success(client):
    response = client.post("/auth/register", json={
        "email": "user@example.com",
        "password": "password123"
    })
    assert response.status_code == 201
    assert "access_token" in response.cookies


def test_register_duplicate_email_returns_400(client):
    client.post("/auth/register", json={"email": "user@example.com", "password": "password123"})

    response = client.post("/auth/register", json={"email": "user@example.com", "password": "password123"})

    assert response.status_code == 400



def test_login_success(client):
    client.post("/auth/register", json={"email": "user@example.com", "password": "password123"})

    response = client.post("/auth/login", json={"email": "user@example.com", "password": "password123"})

    assert response.status_code == 200
    assert "access_token" in response.cookies


def test_login_wrong_password_returns_401(client):
    client.post("/auth/register", json={"email": "user@example.com", "password": "password123"})

    response = client.post("/auth/login", json={"email": "user@example.com", "password": "wrongpassword"})

    assert response.status_code == 401


def test_login_nonexistent_email_returns_401(client):
    response = client.post("/auth/login", json={
        "email": "nobody@example.com",
        "password": "password123"
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
