from __future__ import annotations

from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.ml.predict import run_inference
from app.ml.recommendations import aggregate_department_risks, build_recommendation_drafts
from app.ml.train import train_baseline_model
from app.models import Department, Employee, Recommendation, Survey
from app.services.essi import recompute_indices
from app.services.recommendations_engine import generate_recommendations


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


def _seed(db: Session) -> tuple[list[Department], list[Employee]]:
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
    recompute_indices(db, date(2025, 4, 1))
    return departments, employees


def _train_artifact(db: Session, tmp_path) -> str:
    from app.ml.dataset import build_training_dataset

    rows = build_training_dataset(db)
    result = train_baseline_model(
        rows,
        min_pairs=4,
        min_unique_employees=2,
        artifact_root=str(tmp_path),
    )
    assert result.status == "trained"
    assert result.artifact_path is not None
    return result.artifact_path


def test_load_artifact_and_infer_on_latest_surveys(tmp_path) -> None:
    db = _db()
    try:
        _, employees = _seed(db)
        artifact_path = _train_artifact(db, tmp_path)

        result = run_inference(db, artifact_root=str(tmp_path))

        assert result.status == "success"
        assert result.artifact_path == artifact_path
        assert len(result.employee_results) == len(employees)
        assert all(row.survey_date_t == date(2025, 4, 1) for row in result.employee_results)
        assert all(row.risk_band in {"high", "medium", "low"} for row in result.employee_results)
    finally:
        db.close()


def test_aggregation_and_template_generation(tmp_path) -> None:
    db = _db()
    try:
        departments, _ = _seed(db)
        _train_artifact(db, tmp_path)
        inference = run_inference(db, artifact_root=str(tmp_path))

        summaries = aggregate_department_risks(
            inference.employee_results,
            {department.id: department.name for department in departments},
        )
        drafts = build_recommendation_drafts(summaries, model_version=inference.model_version or "ml-test")

        assert len(summaries) == 2
        assert len(drafts) == 2
        assert all(draft.priority in {"high", "medium", "low"} for draft in drafts)
        assert all(draft.model_version == (inference.model_version or "ml-test") for draft in drafts)
        assert any("ML-прогноз" in draft.title for draft in drafts)
    finally:
        db.close()


def test_no_artifact_falls_back_to_rule_based(tmp_path) -> None:
    db = _db()
    try:
        _seed(db)

        created = generate_recommendations(db, artifact_root=str(tmp_path))
        rows = db.query(Recommendation).all()

        assert created >= 1
        assert rows
        assert all((row.model_version or "").startswith("rules-") for row in rows)
    finally:
        db.close()


def test_broken_artifact_falls_back_to_rule_based(tmp_path) -> None:
    db = _db()
    try:
        _seed(db)
        bad_path = tmp_path / "broken-model.pkl"
        bad_path.write_bytes(b"not-a-pickle")

        created = generate_recommendations(db, artifact_root=str(tmp_path))
        rows = db.query(Recommendation).all()

        assert created >= 1
        assert rows
        assert all((row.model_version or "").startswith("rules-") for row in rows)
    finally:
        db.close()


def test_orchestration_uses_ml_when_artifact_available(tmp_path) -> None:
    db = _db()
    try:
        _seed(db)
        artifact_path = _train_artifact(db, tmp_path)

        created = generate_recommendations(db, artifact_root=str(tmp_path))
        rows = db.query(Recommendation).order_by(Recommendation.department_id, Recommendation.id).all()

        assert created == 2
        assert len(rows) == 2
        assert all(row.model_version and row.model_version.startswith("linear_numpy-") for row in rows)
        assert artifact_path.endswith(".pkl")
    finally:
        db.close()
