from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_login_invalid(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"username": "nope", "password": "bad"})
    assert r.status_code == 401


def test_me_requires_auth(client: TestClient) -> None:
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_employee(client: TestClient, token_employee: str) -> None:
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_employee}"})
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "employee"
    assert body["role"] == "employee"


def test_me_summary_employee(client: TestClient, token_employee: str) -> None:
    r = client.get("/api/me/summary", headers={"Authorization": f"Bearer {token_employee}"})
    assert r.status_code == 200
    data = r.json()
    assert "name" in data
    assert "essi" in data


def test_me_surveys_employee(client: TestClient, token_employee: str) -> None:
    r = client.get("/api/me/surveys", headers={"Authorization": f"Bearer {token_employee}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_surveys_template_block_titles(client: TestClient) -> None:
    r = client.get("/api/surveys/template")
    assert r.status_code == 200
    data = r.json()
    assert "questions" in data
    assert "block_titles" in data
    assert len(data["block_titles"]) == 5
    titles = {x["block_index"]: x["title"] for x in data["block_titles"]}
    assert 1 in titles and "условия" in titles[1].lower()


def test_recommendations_forbidden_for_employee(client: TestClient, token_employee: str) -> None:
    r = client.get("/api/recommendations", headers={"Authorization": f"Bearer {token_employee}"})
    assert r.status_code == 403


def test_recommendations_manager(client: TestClient, token_manager: str) -> None:
    r = client.get("/api/recommendations", headers={"Authorization": f"Bearer {token_manager}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_me_recommendations_employee(client: TestClient, token_employee: str) -> None:
    r = client.get("/api/me/recommendations", headers={"Authorization": f"Bearer {token_employee}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_indices_recalculate_manager(client: TestClient, token_manager: str) -> None:
    r = client.post("/api/indices/recalculate", headers={"Authorization": f"Bearer {token_manager}"})
    assert r.status_code == 202
    assert r.json().get("status") == "scheduled"


def test_audit_logs_admin(client: TestClient, token_admin: str) -> None:
    r = client.get("/api/audit/logs?limit=10", headers={"Authorization": f"Bearer {token_admin}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_audit_logs_forbidden_manager(client: TestClient, token_manager: str) -> None:
    r = client.get("/api/audit/logs", headers={"Authorization": f"Bearer {token_manager}"})
    assert r.status_code == 403


def test_economy_defaults_manager(client: TestClient, token_manager: str) -> None:
    r = client.get("/api/economy/defaults", headers={"Authorization": f"Bearer {token_manager}"})
    assert r.status_code == 200
    data = r.json()
    assert "suggested_essi" in data
    assert "draft_fot" in data


def test_me_campaigns_employee(client: TestClient, token_employee: str) -> None:
    r = client.get("/api/me/campaigns", headers={"Authorization": f"Bearer {token_employee}"})
    assert r.status_code == 200
    assert r.json() == []
