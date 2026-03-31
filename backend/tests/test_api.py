from __future__ import annotations

import time
from datetime import date

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models import Department, Recommendation


def _wait_import_job(client: TestClient, job_id: int, headers: dict) -> dict:
    for _ in range(120):
        r = client.get(f"/api/jobs/{job_id}", headers=headers)
        assert r.status_code == 200
        row = r.json()
        if row["status"] in ("success", "failed"):
            return row
        time.sleep(0.05)
    raise AssertionError("import job timeout")


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
    body = r.json()
    assert isinstance(body, dict)
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body.get("offset") == 0


def test_audit_logs_pagination_keys(client: TestClient, token_admin: str) -> None:
    r = client.get(
        "/api/audit/logs?limit=2&offset=0",
        headers={"Authorization": f"Bearer {token_admin}"},
    )
    assert r.status_code == 200
    j = r.json()
    assert "items" in j and "has_more" in j and "offset" in j and "limit" in j
    assert j["offset"] == 0
    assert len(j["items"]) <= 2


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
    assert r.status_code == 422
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
    assert r.status_code == 422
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


def test_survey_import_with_campaign_duplicate_fails(
    client: TestClient, token_manager: str, token_employee: str
) -> None:
    h_m = {"Authorization": f"Bearer {token_manager}"}
    h_e = {"Authorization": f"Bearer {token_employee}"}
    r = client.post("/api/surveys/campaigns", headers=h_m, json={"name": "CSV import campaign"})
    assert r.status_code == 201
    cid = r.json()["id"]

    me = client.get("/api/auth/me", headers=h_e).json()
    eid = me["employee_id"]
    assert eid is not None

    today = date.today().isoformat()
    csv_body = (
        "employee_id,survey_date,score_block1,score_block2,score_block3,score_block4,score_block5\n"
        f"{eid},{today},15,15,15,15,15\n"
    )
    files = {"file": ("imp.csv", csv_body.encode("utf-8"), "text/csv")}
    data = {"campaign_id": str(cid)}
    r = client.post("/api/surveys/upload", headers=h_m, files=files, data=data)
    assert r.status_code == 202
    done = _wait_import_job(client, r.json()["id"], h_m)
    assert done["status"] == "success", done.get("detail")

    r = client.post("/api/surveys/upload", headers=h_m, files=files, data=data)
    assert r.status_code == 422
    detail = (r.json().get("detail") or "").lower()
    assert "пройден" in detail or "кампании" in detail


def test_survey_submit_validation_requires_five_scores_per_block(client: TestClient, token_employee: str) -> None:
    r = client.post(
        "/api/surveys",
        headers={"Authorization": f"Bearer {token_employee}"},
        json={
            "blocks": [
                {"block_index": 1, "scores": [3, 3, 3, 3]},
                {"block_index": 2, "scores": [3, 3, 3, 3, 3]},
                {"block_index": 3, "scores": [3, 3, 3, 3, 3]},
                {"block_index": 4, "scores": [3, 3, 3, 3, 3]},
                {"block_index": 5, "scores": [3, 3, 3, 3, 3]},
            ]
        },
    )
    assert r.status_code == 422
    assert "ровно 5 ответов" in r.json()["detail"]


def test_survey_submit_validation_requires_answer_range_one_to_five(client: TestClient, token_employee: str) -> None:
    blocks = _survey_blocks_five_by_five()
    blocks[0]["scores"] = [3, 3, 0, 3, 3]
    r = client.post(
        "/api/surveys",
        headers={"Authorization": f"Bearer {token_employee}"},
        json={"blocks": blocks},
    )
    assert r.status_code == 422
    assert "диапазоне 1..5" in r.json()["detail"]


def test_survey_submit_validation_requires_all_blocks(client: TestClient, token_employee: str) -> None:
    r = client.post(
        "/api/surveys",
        headers={"Authorization": f"Bearer {token_employee}"},
        json={"blocks": _survey_blocks_five_by_five()[:4]},
    )
    assert r.status_code == 422
    assert "ровно 5 блоков" in r.json()["detail"]


def test_survey_import_accepts_documented_alias_columns(client: TestClient, token_manager: str, token_employee: str) -> None:
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_employee}"}).json()
    eid = me["employee_id"]
    assert eid is not None
    today = date.today().isoformat()
    csv_body = (
        "employee_id,date,block_o,block_s,block_m,block_j,block_w\n"
        f"{eid},{today},15,15,15,15,15\n"
    )
    files = {"file": ("imp_alias.csv", csv_body.encode("utf-8"), "text/csv")}
    r = client.post("/api/surveys/upload", headers={"Authorization": f"Bearer {token_manager}"}, files=files)
    assert r.status_code == 202
    done = _wait_import_job(client, r.json()["id"], {"Authorization": f"Bearer {token_manager}"})
    assert done["status"] == "success", done.get("detail")


def test_survey_import_rejects_block_sum_out_of_range(client: TestClient, token_manager: str, token_employee: str) -> None:
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_employee}"}).json()
    eid = me["employee_id"]
    assert eid is not None
    today = date.today().isoformat()
    csv_body = (
        "employee_id,survey_date,score_block1,score_block2,score_block3,score_block4,score_block5\n"
        f"{eid},{today},4,15,15,15,15\n"
    )
    files = {"file": ("imp_bad.csv", csv_body.encode("utf-8"), "text/csv")}
    r = client.post("/api/surveys/upload", headers={"Authorization": f"Bearer {token_manager}"}, files=files)
    assert r.status_code == 422
    assert "диапазоне 5..25" in r.json()["detail"]


def test_survey_import_rejects_conflicting_alias_columns(client: TestClient, token_manager: str, token_employee: str) -> None:
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_employee}"}).json()
    eid = me["employee_id"]
    assert eid is not None
    today = date.today().isoformat()
    csv_body = (
        "employee_id,survey_date,score_block1,block_o,score_block2,score_block3,score_block4,score_block5\n"
        f"{eid},{today},15,20,15,15,15,15\n"
    )
    files = {"file": ("imp_conflict.csv", csv_body.encode("utf-8"), "text/csv")}
    r = client.post("/api/surveys/upload", headers={"Authorization": f"Bearer {token_manager}"}, files=files)
    assert r.status_code == 422
    assert "конфликт колонок" in r.json()["detail"].lower()


def test_dashboard_returns_block_percentages(client: TestClient, token_manager: str) -> None:
    emp = client.post("/api/auth/login", json={"username": "employee", "password": "employee123"})
    assert emp.status_code == 200
    employee_token = emp.json()["access_token"]
    employee_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {employee_token}"}).json()
    eid = employee_me["employee_id"]
    assert eid is not None
    submit = client.post(
        "/api/surveys",
        headers={"Authorization": f"Bearer {token_manager}"},
        json={
            "employee_id": eid,
            "blocks": _survey_blocks_five_by_five(),
        },
    )
    assert submit.status_code == 201
    r = client.get("/api/reports/dashboard", headers={"Authorization": f"Bearer {token_manager}"})
    assert r.status_code == 200
    data = r.json()
    assert "block_percentages" in data
    assert isinstance(data["block_percentages"], list)
    assert len(data["block_percentages"]) == 5


def test_recommendation_description_employee_vs_manager(
    client: TestClient, token_employee: str, token_manager: str
) -> None:
    db = SessionLocal()
    try:
        dept = db.query(Department).first()
        assert dept is not None
        rec = Recommendation(
            department_id=dept.id,
            title="Compare text",
            text="Текст для руководителя",
            text_employee="Текст для сотрудника",
            priority="medium",
            status="Новая",
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        rid = rec.id
    finally:
        db.close()

    er = client.get("/api/me/recommendations", headers={"Authorization": f"Bearer {token_employee}"})
    assert er.status_code == 200
    found = next((x for x in er.json() if x["id"] == rid), None)
    assert found is not None
    assert found["description"] == "Текст для сотрудника"

    mr = client.get("/api/recommendations", headers={"Authorization": f"Bearer {token_manager}"})
    assert mr.status_code == 200
    found_m = next((x for x in mr.json() if x["id"] == rid), None)
    assert found_m is not None
    assert found_m["description"] == "Текст для руководителя"
