def test_statistics_requires_auth(client):
    response = client.get("/statistics")

    assert response.status_code == 401


def test_statistics_empty_returns_zeros(auth_client):
    response = auth_client.get("/statistics")

    assert response.status_code == 200
    data = response.json()
    assert data["total_sessions"] == 0
    assert data["total_minutes"] == 0
    assert data["avg_minutes"] == 0
    assert len(data["daily"]) == 30


def test_statistics_counts_completed_sessions(auth_client):
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25}).json()["id"]
    auth_client.patch(f"/sessions/{session_id}", json={"status": "completed"})

    data = auth_client.get("/statistics").json()

    assert data["total_sessions"] == 1
    assert data["total_minutes"] >= 1


def test_statistics_ignores_in_progress_sessions(auth_client):
    auth_client.post("/sessions", json={"duration_minutes": 25})  # stays in_progress

    data = auth_client.get("/statistics").json()

    assert data["total_sessions"] == 0


def test_statistics_user_isolation(auth_client, second_auth_client):
    # User 1 completes a session
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25}).json()["id"]
    auth_client.patch(f"/sessions/{session_id}", json={"status": "completed"})

    # User 2 should see zero completed sessions
    data = second_auth_client.get("/statistics").json()

    assert data["total_sessions"] == 0


def test_statistics_tag_filter(auth_client):
    work_id = auth_client.post("/sessions", json={"duration_minutes": 25, "tags": ["work"]}).json()["id"]
    auth_client.patch(f"/sessions/{work_id}", json={"status": "completed"})

    personal_id = auth_client.post("/sessions", json={"duration_minutes": 25, "tags": ["personal"]}).json()["id"]
    auth_client.patch(f"/sessions/{personal_id}", json={"status": "completed"})

    data = auth_client.get("/statistics?tag=work").json()

    assert data["total_sessions"] == 1
