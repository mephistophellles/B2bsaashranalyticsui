from __future__ import annotations

import time
from datetime import date

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models import Department, Employee, Survey


def _admin_headers(token_admin: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_admin}"}


def _seed_training_dataset() -> None:
    db = SessionLocal()
    try:
        if db.query(Survey).count() >= 12:
            return
        departments = [Department(name="OPS A"), Department(name="OPS B")]
        db.add_all(departments)
        db.commit()
        for department in departments:
            db.refresh(department)
        employees = [
            Employee(name="OPS-E1", department_id=departments[0].id, hire_date=date(2023, 1, 1)),
            Employee(name="OPS-E2", department_id=departments[0].id, hire_date=date(2023, 2, 1)),
            Employee(name="OPS-E3", department_id=departments[1].id, hire_date=date(2023, 3, 1)),
        ]
        db.add_all(employees)
        db.commit()
        for employee in employees:
            db.refresh(employee)
        month_sets = [
            ((15, 15, 15, 15, 15), (16, 16, 16, 16, 16), (18, 18, 18, 18, 18), (19, 19, 19, 19, 19)),
            ((14, 14, 14, 14, 14), (15, 15, 15, 15, 15), (17, 17, 17, 17, 17), (18, 18, 18, 18, 18)),
            ((20, 20, 20, 20, 20), (19, 19, 19, 19, 19), (18, 18, 18, 18, 18), (17, 17, 17, 17, 17)),
        ]
        dates = [date(2025, 1, 1), date(2025, 2, 1), date(2025, 3, 1), date(2025, 4, 1)]
        for employee, blocks_seq in zip(employees, month_sets):
            for sdate, blocks in zip(dates, blocks_seq):
                db.add(
                    Survey(
                        employee_id=employee.id,
                        survey_date=sdate,
                        score_block1=blocks[0],
                        score_block2=blocks[1],
                        score_block3=blocks[2],
                        score_block4=blocks[3],
                        score_block5=blocks[4],
                        source="import",
                    )
                )
        db.commit()
    finally:
        db.close()


def _wait_run(client: TestClient, run_id: str, headers: dict[str, str], artifact_dir: str) -> dict:
    for _ in range(80):
        r = client.get(
            f"/api/admin/ml/runs/{run_id}",
            headers=headers,
            params={"artifact_dir": artifact_dir},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        if body["status"] in {"success", "failed", "skipped"}:
            return body
        time.sleep(0.05)
    raise AssertionError("ML run timeout")


def _train_and_promote_active_model(client: TestClient, token_admin: str, artifact_dir: str) -> str:
    train = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": artifact_dir},
    )
    assert train.status_code == 200, train.text
    version = train.json()["model_version"]
    assert version
    promote = client.post(
        "/api/admin/ml/promote",
        headers=_admin_headers(token_admin),
        json={"model_version": version, "artifact_dir": artifact_dir},
    )
    assert promote.status_code == 200, promote.text
    return version


def test_train_async_creates_background_run(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    artifact_dir = str(tmp_path)
    r = client.post(
        "/api/admin/ml/train-async",
        headers=_admin_headers(token_admin),
        json={"model_type": "linear_numpy", "min_pairs": 4, "min_unique_employees": 2, "artifact_dir": artifact_dir},
    )
    assert r.status_code == 202, r.text
    run = r.json()
    done = _wait_run(client, run["run_id"], _admin_headers(token_admin), artifact_dir)
    assert done["operation_type"] == "train"
    assert done["status"] == "success"
    assert done["resulting_model_version"]


def test_run_history_tracks_train_success_skipped_failed(
    client: TestClient, token_admin: str, tmp_path, monkeypatch
) -> None:
    _seed_training_dataset()
    artifact_dir = str(tmp_path)
    ok = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": artifact_dir},
    )
    assert ok.status_code == 200 and ok.json()["status"] == "trained"

    skipped = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 999, "min_unique_employees": 999, "artifact_dir": artifact_dir},
    )
    assert skipped.status_code == 200 and skipped.json()["status"] == "skipped"

    def _boom(*args, **kwargs):
        raise RuntimeError("synthetic ops failure")

    monkeypatch.setattr("app.ml.ops.build_training_dataset", _boom)
    failed = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"artifact_dir": artifact_dir},
    )
    assert failed.status_code == 200 and failed.json()["status"] == "failed"

    runs = client.get(
        "/api/admin/ml/runs",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": artifact_dir, "operation_type": "train"},
    )
    assert runs.status_code == 200, runs.text
    statuses = {row["status"] for row in runs.json()}
    assert {"success", "skipped", "failed"} <= statuses


def test_refresh_uses_active_model(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    artifact_dir = str(tmp_path)
    active_version = _train_and_promote_active_model(client, token_admin, artifact_dir)

    refresh = client.post(
        "/api/admin/ml/refresh",
        headers=_admin_headers(token_admin),
        json={"artifact_dir": artifact_dir, "note": "manual refresh"},
    )
    assert refresh.status_code == 200, refresh.text
    body = refresh.json()
    assert body["status"] == "success"
    assert body["summary"]["strategy"] == "ml"
    assert body["summary"]["fallback_used"] is False
    assert body["resulting_model_version"] == active_version


def test_refresh_falls_back_to_rules_when_model_unusable(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    artifact_dir = str(tmp_path)
    refresh = client.post(
        "/api/admin/ml/refresh",
        headers=_admin_headers(token_admin),
        json={"artifact_dir": artifact_dir},
    )
    assert refresh.status_code == 200, refresh.text
    body = refresh.json()
    assert body["status"] == "success"
    assert body["summary"]["strategy"] == "rules"
    assert body["summary"]["fallback_used"] is True


def test_status_reflects_last_runs_and_fallback(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    artifact_dir = str(tmp_path)
    client.post(
        "/api/admin/ml/refresh",
        headers=_admin_headers(token_admin),
        json={"artifact_dir": artifact_dir},
    )

    status = client.get(
        "/api/admin/ml/status",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": artifact_dir},
    )
    assert status.status_code == 200, status.text
    body = status.json()
    assert body["last_refresh_run"] is not None
    assert body["last_refresh_run"]["summary"]["fallback_used"] is True


def test_non_admin_forbidden_on_ops_endpoints(client: TestClient, token_manager: str, tmp_path) -> None:
    headers = {"Authorization": f"Bearer {token_manager}"}
    artifact_dir = str(tmp_path)
    async_train = client.post("/api/admin/ml/train-async", headers=headers, json={"artifact_dir": artifact_dir})
    refresh = client.post("/api/admin/ml/refresh", headers=headers, json={"artifact_dir": artifact_dir})
    runs = client.get("/api/admin/ml/runs", headers=headers, params={"artifact_dir": artifact_dir})
    assert async_train.status_code == 403
    assert refresh.status_code == 403
    assert runs.status_code == 403


def test_active_model_not_replaced_by_broken_newer_artifact(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    artifact_dir = str(tmp_path)
    active_version = _train_and_promote_active_model(client, token_admin, artifact_dir)

    broken_path = tmp_path / "broken-newer.pkl"
    broken_path.write_bytes(b"broken")

    status = client.get(
        "/api/admin/ml/status",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": artifact_dir},
    )
    assert status.status_code == 200, status.text
    body = status.json()
    assert body["active_model_version"] == active_version
    assert body["resolution_source"] == "active_manifest"


def test_refresh_uses_manifest_selected_model_not_latest(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    artifact_dir = str(tmp_path)
    first = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": artifact_dir},
    ).json()
    second = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": artifact_dir},
    ).json()
    client.post(
        "/api/admin/ml/promote",
        headers=_admin_headers(token_admin),
        json={"model_version": first["model_version"], "artifact_dir": artifact_dir},
    )

    refresh = client.post(
        "/api/admin/ml/refresh",
        headers=_admin_headers(token_admin),
        json={"artifact_dir": artifact_dir},
    )
    assert refresh.status_code == 200, refresh.text
    body = refresh.json()
    assert body["resulting_model_version"] == first["model_version"]
    assert body["resulting_model_version"] != second["model_version"]
