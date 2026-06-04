def test_root_returns_200(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def test_imprint_returns_200(client):
    response = client.get("/imprint")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def test_privacy_returns_200(client):
    response = client.get("/privacy")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def test_unknown_route_returns_404(client):
    response = client.get("/does-not-exist")
    assert response.status_code == 404
