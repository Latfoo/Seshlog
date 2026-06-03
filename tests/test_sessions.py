import pytest
from datetime import datetime, timezone, timedelta
from sqlmodel import Session as DBSession

from app.db.schema import engine, PomodoroSession


# --- Basic CRUD ---

def test_session_id_not_found(auth_client):
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25}).json()["id"]
    auth_client.delete(f"/sessions/{session_id}")

    response = auth_client.get(f"/sessions/{session_id}")
    assert response.status_code == 404

def test_create_session_returns_correct_data(auth_client):
    response = auth_client.post("/sessions", json={"duration_minutes": 25})

    assert response.status_code == 201
    data = response.json()
    assert data["duration_minutes"] == 25
    assert data["status"] == "in_progress"


def test_delete_session(auth_client):
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25}).json()["id"]

    response = auth_client.delete(f"/sessions/{session_id}")

    assert response.status_code == 204
    assert auth_client.get(f"/sessions/{session_id}").status_code == 404


# --- Input validation ---

@pytest.mark.parametrize("duration", [0, -1, 481])
def test_create_session_invalid_duration_returns_422(auth_client, duration):
    response = auth_client.post("/sessions", json={"duration_minutes": duration})

    assert response.status_code == 422


@pytest.mark.parametrize("tag", ["hello world", "@invalid", "#tag", "a" * 51])
def test_create_session_invalid_tag_returns_422(auth_client, tag):
    response = auth_client.post("/sessions", json={"duration_minutes": 25, "tags": [tag]})

    assert response.status_code == 422


# --- Tags ---

def test_create_session_with_tags(auth_client):
    response = auth_client.post("/sessions", json={"duration_minutes": 25, "tags": ["work", "deep-focus"]})

    assert response.status_code == 201
    tag_names = [t["name"] for t in response.json()["tags"]]
    assert "work" in tag_names
    assert "deep-focus" in tag_names


def test_tags_are_lowercased_and_stripped(auth_client):
    response = auth_client.post("/sessions", json={"duration_minutes": 25, "tags": ["  WORK  "]})

    tag_names = [t["name"] for t in response.json()["tags"]]
    assert "work" in tag_names


# --- Authorization ---

def test_cannot_access_another_users_session(client):
    # User 1 registers and creates a session
    client.post("/auth/register", json={"email": "user1@example.com", "password": "password123"})
    session_response = client.post("/sessions", json={"duration_minutes": 25})
    session_id = session_response.json()["id"]

    # User 2 registers, this replaces the auth cookie, so the client is now logged in as user 2
    client.post("/auth/register", json={"email": "user2@example.com", "password": "password123"})

    # User 2 tries to fetch user 1's session
    response = client.get(f"/sessions/{session_id}")

    assert response.status_code == 404


def test_cannot_update_another_users_session(auth_client, second_auth_client):
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25}).json()["id"]

    response = second_auth_client.patch(f"/sessions/{session_id}", json={"status": "completed"})

    assert response.status_code == 404


def test_cannot_delete_another_users_session(auth_client, second_auth_client):
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25}).json()["id"]

    response = second_auth_client.delete(f"/sessions/{session_id}")

    assert response.status_code == 404


def test_list_sessions_only_returns_own_sessions(auth_client, second_auth_client):
    auth_client.post("/sessions", json={"duration_minutes": 25})
    auth_client.post("/sessions", json={"duration_minutes": 25})
    second_auth_client.post("/sessions", json={"duration_minutes": 25})

    sessions = auth_client.get("/sessions").json()

    assert len(sessions) == 2


# --- Session status changes ---

def test_session_can_be_paused(auth_client):
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25}).json()["id"]

    response = auth_client.patch(f"/sessions/{session_id}", json={"status": "paused"})

    assert response.status_code == 200
    assert response.json()["status"] == "paused"


def test_session_can_be_resumed(auth_client):
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25}).json()["id"]
    auth_client.patch(f"/sessions/{session_id}", json={"status": "paused"})

    response = auth_client.patch(f"/sessions/{session_id}", json={"status": "in_progress"})

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"


def test_session_can_be_completed(auth_client):
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25}).json()["id"]

    response = auth_client.patch(f"/sessions/{session_id}", json={"status": "completed"})

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    # duration_minutes is overwritten with actual elapsed time; min is 1 due to _elapsed_to_minutes
    assert data["duration_minutes"] >= 1


# --- Session that ran out while the tab was closed ---

def test_auto_complete_expired_session_on_list(auth_client):
    # Create a 1-minute session
    session_id = auth_client.post("/sessions", json={"duration_minutes": 1}).json()["id"]

    # Simulate the timer running out: set started_at to 5 minutes ago,
    # so the server sees a 1-minute session that started 5 minutes ago and knows it's overdue.
    five_minutes_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
    with DBSession(engine) as db:
        session = db.get(PomodoroSession, session_id)
        session.started_at = five_minutes_ago
        db.commit()

    # Fetching the session list triggers auto-complete for any expired sessions.
    # The server should detect that this session is overdue and mark it as completed.
    all_sessions = auth_client.get("/sessions").json()
    our_session = next(s for s in all_sessions if s["id"] == session_id)

    assert our_session["status"] == "completed"
