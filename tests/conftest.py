import os
import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from sqlmodel import SQLModel

# Set env variables before importing the app so modules read the correct values at startup.
# setdefault means GitHub Actions can still override them via its own environment.
os.environ.setdefault("RATELIMIT_ENABLED", "false")
load_dotenv(".env.test", override=False)

from app.main import app
from app.db.schema import engine
@pytest.fixture
def client(): 
    # Wipe and recreate all tables so every test starts with an empty database.
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_client(client):
    # A client that is already logged in as a test user.
    response = client.post("/auth/register", json={
        "email": "test@example.com",
        "password": "password123"
    })
    assert response.status_code == 201, f"Setup failed: registration returned {response.status_code}"
    return client


@pytest.fixture
def second_client(client):  # client is unused but required so pytest runs the DB setup fixture first
    # A second browser session, used for tests that need two separate logged-in users at once.
    with TestClient(app) as c:
        yield c


@pytest.fixture
def second_auth_client(second_client):
    # A second logged-in user, separate from auth_client.
    response = second_client.post("/auth/register", json={
        "email": "other@example.com",
        "password": "password123"
    })
    assert response.status_code == 201, f"Setup failed: registration returned {response.status_code}"
    return second_client
