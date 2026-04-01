from __future__ import annotations

from datetime import date
import json

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.ml.ops import create_run
from app.ml.predict import run_inference
from app.ml.storage import manifest_path, save_model
from app.ml.types import TrainingMetrics, TrainingResult
from app.models import Department, Employee, Survey


def _admin_headers(token_admin: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_admin}"}


def _seed_training_dataset() -> None:
    db = SessionLocal()
    try:
        if db.query(Survey).count() >= 12:
            return
        departments = [Department(name="ML A"), Department(name="ML B")]
        db.add_all(departments)
        db.commit()
        for department in departments:
            db.refresh(department)

        employees = [
            Employee(name="ML-E1", department_id=departments[0].id, hire_date=date(2023, 1, 1)),
            Employee(name="ML-E2", department_id=departments[0].id, hire_date=date(2023, 2, 1)),
            Employee(name="ML-E3", department_id=departments[1].id, hire_date=date(2023, 3, 1)),
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


def _write_fake_linear_artifact(tmp_path, model_version: str, intercept: float) -> str:
    payload = {
        "model_version": model_version,
        "trained_at": "2026-04-01T00:00:00+00:00",
        "model_type": "linear_numpy",
        "feature_names": [],
        "train_rows": 10,
        "unique_employees": 3,
        "metrics": {
            "mae": 1.0,
            "rmse": 1.2,
            "train_rows": 10,
            "validation_rows": 2,
            "validation_note": None,
        },
        "model_payload": {
            "model_type": "linear_numpy",
            "feature_names": [
                "current_essi",
                "block1_pct",
                "block2_pct",
                "block3_pct",
                "block4_pct",
                "block5_pct",
                "prev_essi",
                "delta_prev",
                "days_since_prev_survey",
                "tenure_days",
                "dept_avg_essi_t",
                "dept_employee_count_t",
                "org_avg_essi_t",
            ],
            "x_mean": [0.0] * 13,
            "x_std": [1.0] * 13,
            "coef": [0.0] * 13,
            "intercept": intercept,
        },
    }
    return save_model(payload, model_version=model_version, artifact_root=str(tmp_path))


def test_admin_ml_train_success(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    r = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={
            "model_type": "linear_numpy",
            "min_pairs": 4,
            "min_unique_employees": 2,
            "artifact_dir": str(tmp_path),
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "trained"
    assert body["model_type"] == "linear_numpy"
    assert body["model_version"]
    assert body["artifact_path"]
    assert body["metrics"]["train_rows"] >= 1


def test_admin_ml_train_skipped(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    r = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={
            "model_type": "linear_numpy",
            "min_pairs": 999,
            "min_unique_employees": 999,
            "artifact_dir": str(tmp_path),
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "skipped"
    assert "training skipped" in body["reason"]
    assert body["artifact_path"] is None


def test_admin_ml_train_failed_path(client: TestClient, token_admin: str, tmp_path, monkeypatch) -> None:
    _seed_training_dataset()

    def _fake_execute(*args, **kwargs):
        run = create_run(
            operation_type="train",
            triggered_by="admin",
            requested_model_type="linear_numpy",
            artifact_root=str(tmp_path),
        )
        return (
            TrainingResult(
                status="failed",
                reason="training failed: synthetic error",
                train_rows=0,
                unique_employees=0,
                model_type="linear_numpy",
                model_version=None,
                metrics=TrainingMetrics(mae=None, rmse=None, train_rows=0, validation_rows=0),
                artifact_path=None,
            ),
            run,
        )

    monkeypatch.setattr("app.routers.admin.execute_train_operation", _fake_execute)
    r = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "failed"
    assert "synthetic error" in body["reason"]


def test_admin_ml_status_no_artifact(client: TestClient, token_admin: str, tmp_path) -> None:
    r = client.get(
        "/api/admin/ml/status",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["artifact_exists"] is False
    assert body["active_model_version"] is None
    assert body["last_status"] == "no_active_model"


def test_admin_ml_status_with_valid_artifact(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    train = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={
            "min_pairs": 4,
            "min_unique_employees": 2,
            "artifact_dir": str(tmp_path),
        },
    )
    assert train.status_code == 200, train.text
    version = train.json()["model_version"]

    r = client.get(
        "/api/admin/ml/status",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["artifact_exists"] is True
    assert body["active_model_version"] == version
    assert body["last_status"] == "active_manifest_missing"
    assert body["metrics"] is not None
    assert body["resolution_source"] == "legacy_latest"


def test_admin_ml_status_with_broken_artifact(client: TestClient, token_admin: str, tmp_path) -> None:
    bad_path = tmp_path / "broken.pkl"
    bad_path.write_bytes(b"broken")

    r = client.get(
        "/api/admin/ml/status",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["artifact_exists"] is True
    assert body["active_model_version"] is None
    assert body["last_status"] == "active_manifest_missing"
    assert "unreadable" in body["last_reason"]


def test_admin_ml_models_no_artifacts(client: TestClient, token_admin: str, tmp_path) -> None:
    r = client.get(
        "/api/admin/ml/models",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_admin_ml_models_with_several_artifacts(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    first = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": str(tmp_path)},
    )
    assert first.status_code == 200, first.text
    second = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": str(tmp_path)},
    )
    assert second.status_code == 200, second.text

    r = client.get(
        "/api/admin/ml/models",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 2
    assert sum(1 for row in body if row["is_active"]) == 1


def test_admin_ml_promote_valid_model(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    first = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": str(tmp_path)},
    ).json()
    second = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": str(tmp_path)},
    ).json()
    assert first["model_version"] != second["model_version"]

    r = client.post(
        "/api/admin/ml/promote",
        headers=_admin_headers(token_admin),
        json={"model_version": first["model_version"], "note": "rollback-lite", "artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "promoted"
    assert body["active_model_version"] == first["model_version"]
    assert body["note"] == "rollback-lite"


def test_admin_ml_promote_unknown_model(client: TestClient, token_admin: str, tmp_path) -> None:
    r = client.post(
        "/api/admin/ml/promote",
        headers=_admin_headers(token_admin),
        json={"model_version": "missing-model", "artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 404


def test_admin_ml_status_with_active_manifest(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    first = client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": str(tmp_path)},
    ).json()
    promoted = client.post(
        "/api/admin/ml/promote",
        headers=_admin_headers(token_admin),
        json={"model_version": first["model_version"], "artifact_dir": str(tmp_path)},
    )
    assert promoted.status_code == 200, promoted.text

    r = client.get(
        "/api/admin/ml/status",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["active_model_version"] == first["model_version"]
    assert body["last_status"] == "active_model_ok"
    assert body["resolution_source"] == "active_manifest"


def test_admin_ml_status_with_broken_manifest(client: TestClient, token_admin: str, tmp_path) -> None:
    _seed_training_dataset()
    client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": str(tmp_path)},
    )
    manifest_path(str(tmp_path)).write_text("{broken", encoding="utf-8")

    r = client.get(
        "/api/admin/ml/status",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["artifact_exists"] is True
    assert body["last_status"] == "active_manifest_broken"
    assert body["resolution_source"] == "legacy_latest"


def test_admin_ml_status_when_manifest_points_to_missing_artifact(
    client: TestClient, token_admin: str, tmp_path
) -> None:
    _seed_training_dataset()
    client.post(
        "/api/admin/ml/train",
        headers=_admin_headers(token_admin),
        json={"min_pairs": 4, "min_unique_employees": 2, "artifact_dir": str(tmp_path)},
    )
    manifest_path(str(tmp_path)).write_text(
        json.dumps(
            {
                "active_model_version": "ghost-model",
                "model_type": "linear_numpy",
                "artifact_path": str(tmp_path / "ghost-model.pkl"),
                "promoted_at": "2026-04-01T00:00:00+00:00",
                "promoted_by": "admin",
                "note": None,
                "previous_model_version": None,
            }
        ),
        encoding="utf-8",
    )

    r = client.get(
        "/api/admin/ml/status",
        headers=_admin_headers(token_admin),
        params={"artifact_dir": str(tmp_path)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["last_status"] == "active_artifact_missing"
    assert body["resolution_source"] == "legacy_latest"


def test_admin_ml_endpoints_forbidden_for_non_admin(
    client: TestClient, token_manager: str, tmp_path
) -> None:
    headers = {"Authorization": f"Bearer {token_manager}"}
    train = client.post("/api/admin/ml/train", headers=headers, json={"artifact_dir": str(tmp_path)})
    status = client.get("/api/admin/ml/status", headers=headers, params={"artifact_dir": str(tmp_path)})
    models = client.get("/api/admin/ml/models", headers=headers, params={"artifact_dir": str(tmp_path)})
    promote = client.post(
        "/api/admin/ml/promote",
        headers=headers,
        json={"model_version": "any", "artifact_dir": str(tmp_path)},
    )
    assert train.status_code == 403
    assert status.status_code == 403
    assert models.status_code == 403
    assert promote.status_code == 403


def test_inference_uses_promoted_model_not_newest(tmp_path) -> None:
    _seed_training_dataset()
    older_path = _write_fake_linear_artifact(tmp_path, "linear_numpy-older", intercept=-20.0)
    newer_path = _write_fake_linear_artifact(tmp_path, "linear_numpy-newer", intercept=5.0)

    db = SessionLocal()
    try:
        status_before = run_inference(db, artifact_root=str(tmp_path))
        assert status_before.model_version == "linear_numpy-newer"

        manifest_path(str(tmp_path)).write_text(
            json.dumps(
                {
                    "active_model_version": "linear_numpy-older",
                    "model_type": "linear_numpy",
                    "artifact_path": older_path,
                    "promoted_at": "2026-04-01T00:00:00+00:00",
                    "promoted_by": "admin",
                    "note": "pin older",
                    "previous_model_version": "linear_numpy-newer",
                }
            ),
            encoding="utf-8",
        )
        status_after = run_inference(db, artifact_root=str(tmp_path))
        assert status_after.model_version == "linear_numpy-older"
        assert status_after.artifact_path == older_path
        assert older_path != newer_path
    finally:
        db.close()
