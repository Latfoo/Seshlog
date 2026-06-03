def test_list_tags_does_not_require_auth(client):
    response = client.get("/tags")

    assert response.status_code == 200


def test_list_tags_empty(client):
    response = client.get("/tags")

    assert response.json() == []


def test_list_tags_returns_used_tags(auth_client):
    auth_client.post("/sessions", json={"duration_minutes": 25, "tags": ["work"]})

    tag_names = [t["name"] for t in auth_client.get("/tags").json()]

    assert "work" in tag_names


def test_list_tags_does_not_return_unused_tags(auth_client):
    # Create a session with a tag, then delete the session
    session_id = auth_client.post("/sessions", json={"duration_minutes": 25, "tags": ["fleeting"]}).json()["id"]
    auth_client.delete(f"/sessions/{session_id}")

    tag_names = [t["name"] for t in auth_client.get("/tags").json()]

    assert "fleeting" not in tag_names
