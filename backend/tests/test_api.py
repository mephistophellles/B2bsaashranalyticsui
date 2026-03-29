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
    assert isinstance(r.json(), list)


def _survey_blocks_five_by_five() -> list[dict]:
    return [{"block_index": i, "scores": [3, 3, 3, 3, 3]} for i in range(1, 6)]


def test_campaign_dates_visibility_and_submit(client: TestClient, token_manager: str, token_employee: str) -> None:
    h_m = {"Authorization": f"Bearer {token_manager}"}
    h_e = {"Authorization": f"Bearer {token_employee}"}
    r = client.post(
        "/api/surveys/campaigns",
        headers=h_m,
        json={"name": "Future window", "starts_at": "2099-01-01", "ends_at": "2099-12-31"},
    )
    assert r.status_code == 201
    r = client.get("/api/me/campaigns", headers=h_e)
    assert r.status_code == 200
    assert all(x["name"] != "Future window" for x in r.json())

    r = client.post("/api/surveys/campaigns", headers=h_m, json={"name": "Open dates"})
    assert r.status_code == 201
    r = client.get("/api/me/campaigns", headers=h_e)
    assert any(x["name"] == "Open dates" for x in r.json())

    r = client.post(
        "/api/surveys/campaigns",
        headers=h_m,
        json={"name": "Summer 2030", "starts_at": "2030-06-01", "ends_at": "2030-08-31"},
    )
    assert r.status_code == 201
    cid_bnd = r.json()["id"]

    me = client.get("/api/auth/me", headers=h_e).json()
    eid = me["employee_id"]
    assert eid is not None
    blocks = _survey_blocks_five_by_five()

    r = client.post(
        "/api/surveys",
        headers=h_m,
        json={
            "employee_id": eid,
            "campaign_id": cid_bnd,
            "survey_date": "2025-01-01",
            "blocks": blocks,
        },
    )
    assert r.status_code == 400
    assert "кампании" in r.json().get("detail", "")

    r = client.post(
        "/api/surveys",
        headers=h_m,
        json={
            "employee_id": eid,
            "campaign_id": cid_bnd,
            "survey_date": "2030-09-15",
            "blocks": blocks,
        },
    )
    assert r.status_code == 400
    assert "кампании" in r.json().get("detail", "")

    r = client.post(
        "/api/surveys",
        headers=h_m,
        json={
            "employee_id": eid,
            "campaign_id": cid_bnd,
            "survey_date": "2030-07-15",
            "blocks": blocks,
        },
    )
    assert r.status_code == 201
