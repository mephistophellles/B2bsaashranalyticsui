from __future__ import annotations

from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.ml.dataset import build_training_dataset
from app.ml.storage import load_model, save_model
from app.ml.train import format_training_report, train_baseline_model
from app.models import Department, Employee, Survey


def _db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return Session()


def _survey(employee_id: int, survey_date: date, blocks: tuple[float, float, float, float, float]) -> Survey:
    return Survey(
        employee_id=employee_id,
        survey_date=survey_date,
        score_block1=blocks[0],
        score_block2=blocks[1],
        score_block3=blocks[2],
        score_block4=blocks[3],
        score_block5=blocks[4],
        source="import",
    )


def _seed_rows(db: Session) -> list:
    departments = [Department(name="A"), Department(name="B")]
    db.add_all(departments)
    db.commit()
    for department in departments:
        db.refresh(department)

    employees = [
        Employee(name="E1", department_id=departments[0].id, hire_date=date(2023, 1, 1)),
        Employee(name="E2", department_id=departments[0].id, hire_date=date(2023, 2, 1)),
        Employee(name="E3", department_id=departments[1].id, hire_date=date(2023, 3, 1)),
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
            db.add(_survey(employee.id, sdate, blocks))
    db.commit()
    return build_training_dataset(db)


def test_training_skip_when_dataset_too_small(tmp_path) -> None:
    db = _db()
    try:
        dept = Department(name="Tiny")
        db.add(dept)
        db.commit()
        db.refresh(dept)
        employee = Employee(name="One", department_id=dept.id, hire_date=date(2024, 1, 1))
        db.add(employee)
        db.commit()
        db.refresh(employee)
        db.add_all(
            [
                _survey(employee.id, date(2025, 1, 1), (15, 15, 15, 15, 15)),
                _survey(employee.id, date(2025, 2, 1), (16, 16, 16, 16, 16)),
            ]
        )
        db.commit()
        rows = build_training_dataset(db)

        result = train_baseline_model(rows, min_pairs=5, min_unique_employees=2, artifact_root=str(tmp_path))

        assert result.status == "skipped"
        assert "need at least" in result.reason
        assert result.artifact_path is None
    finally:
        db.close()


def test_successful_train_on_small_fixture(tmp_path) -> None:
    db = _db()
    try:
        rows = _seed_rows(db)
        result = train_baseline_model(
            rows,
            min_pairs=4,
            min_unique_employees=2,
            artifact_root=str(tmp_path),
        )

        assert result.status == "trained"
        assert result.model_type == "linear_numpy"
        assert result.model_version is not None
        assert result.artifact_path is not None
        payload = load_model(result.artifact_path)
        assert payload["model_version"] == result.model_version
        assert payload["model_type"] == "linear_numpy"
        assert payload["feature_names"]
    finally:
        db.close()


def test_artifact_save_and_load(tmp_path) -> None:
    path = save_model({"hello": "world"}, model_version="test-model", artifact_root=str(tmp_path))
    payload = load_model(path)
    assert payload == {"hello": "world"}


def test_result_contract_and_report_format(tmp_path) -> None:
    db = _db()
    try:
        rows = _seed_rows(db)
        result = train_baseline_model(
            rows,
            min_pairs=4,
            min_unique_employees=2,
            artifact_root=str(tmp_path),
        )
        report = format_training_report(result)

        assert result.status in {"trained", "skipped", "failed"}
        assert isinstance(result.reason, str)
        assert isinstance(result.train_rows, int)
        assert isinstance(result.unique_employees, int)
        assert "status:" in report
        assert "metrics:" in report
    finally:
        db.close()


def test_no_crash_when_optional_lightgbm_unavailable(tmp_path, monkeypatch) -> None:
    db = _db()
    try:
        rows = _seed_rows(db)

        def _fail_lightgbm(_rows):
            raise ImportError("lightgbm missing")

        monkeypatch.setattr("app.ml.train._fit_lightgbm", _fail_lightgbm)
        result = train_baseline_model(
            rows,
            preferred_model_type="lightgbm",
            min_pairs=4,
            min_unique_employees=2,
            artifact_root=str(tmp_path),
        )

        assert result.status == "trained"
        assert result.model_type == "linear_numpy"
        assert result.metrics.validation_note is not None
        assert "fallback" in result.metrics.validation_note
    finally:
        db.close()
