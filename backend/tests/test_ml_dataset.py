from __future__ import annotations

from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.ml.dataset import build_training_dataset, format_coverage_report, summarize_training_coverage
from app.ml.features import build_feature_row
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


def test_pairing_logic_builds_t_to_t1_rows() -> None:
    db = _db()
    try:
        dept = Department(name="Data")
        db.add(dept)
        db.commit()
        db.refresh(dept)

        employee = Employee(name="Alice", department_id=dept.id, hire_date=date(2024, 1, 1))
        db.add(employee)
        db.commit()
        db.refresh(employee)

        db.add_all(
            [
                _survey(employee.id, date(2025, 1, 1), (15, 15, 15, 15, 15)),
                _survey(employee.id, date(2025, 2, 1), (20, 20, 20, 20, 20)),
                _survey(employee.id, date(2025, 3, 1), (25, 25, 25, 25, 25)),
            ]
        )
        db.commit()

        rows = build_training_dataset(db)

        assert len(rows) == 2
        assert rows[0].employee_id == employee.id
        assert rows[0].survey_date_t == date(2025, 1, 1)
        assert rows[0].survey_date_t1 == date(2025, 2, 1)
        assert rows[0].current_essi == 60.0
        assert rows[0].next_essi == 80.0
        assert rows[0].delta_next_essi == 20.0

        assert rows[1].survey_date_t == date(2025, 2, 1)
        assert rows[1].survey_date_t1 == date(2025, 3, 1)
        assert rows[1].prev_essi == 60.0
        assert rows[1].delta_prev == 20.0
    finally:
        db.close()


def test_no_leakage_excludes_future_surveys_from_temporal_context() -> None:
    db = _db()
    try:
        dept = Department(name="Ops")
        db.add(dept)
        db.commit()
        db.refresh(dept)

        e1 = Employee(name="A", department_id=dept.id, hire_date=date(2024, 1, 1))
        e2 = Employee(name="B", department_id=dept.id, hire_date=date(2024, 1, 1))
        db.add_all([e1, e2])
        db.commit()
        db.refresh(e1)
        db.refresh(e2)

        db.add_all(
            [
                _survey(e1.id, date(2025, 1, 1), (15, 15, 15, 15, 15)),
                _survey(e1.id, date(2025, 4, 1), (20, 20, 20, 20, 20)),
                _survey(e2.id, date(2025, 3, 1), (25, 25, 25, 25, 25)),
            ]
        )
        db.commit()

        rows = build_training_dataset(db)
        row = next(r for r in rows if r.employee_id == e1.id and r.survey_date_t == date(2025, 1, 1))

        assert row.dept_avg_essi_t == 60.0
        assert row.org_avg_essi_t == 60.0
    finally:
        db.close()


def test_feature_generation_uses_current_and_previous_surveys_only() -> None:
    db = _db()
    try:
        dept = Department(name="Product")
        db.add(dept)
        db.commit()
        db.refresh(dept)

        employee = Employee(name="Cara", department_id=dept.id, hire_date=date(2024, 1, 1))
        db.add(employee)
        db.commit()
        db.refresh(employee)

        prev = _survey(employee.id, date(2025, 1, 1), (10, 10, 10, 10, 10))
        curr = _survey(employee.id, date(2025, 2, 1), (10, 15, 20, 25, 5))

        row = build_feature_row(
            employee=employee,
            current_survey=curr,
            prev_survey=prev,
            dept_avg_essi_t=55.0,
            dept_employee_count_t=3,
            org_avg_essi_t=58.0,
        )

        assert row.current_essi == 60.0
        assert (row.block1_pct, row.block2_pct, row.block3_pct, row.block4_pct, row.block5_pct) == (
            40.0,
            60.0,
            80.0,
            100.0,
            20.0,
        )
        assert row.prev_essi == 40.0
        assert row.delta_prev == 20.0
        assert row.days_since_prev_survey == 31
        assert row.tenure_days == 397
    finally:
        db.close()


def test_coverage_summary_reports_small_fixture() -> None:
    db = _db()
    try:
        dept_a = Department(name="A")
        dept_b = Department(name="B")
        db.add_all([dept_a, dept_b])
        db.commit()
        db.refresh(dept_a)
        db.refresh(dept_b)

        e1 = Employee(name="E1", department_id=dept_a.id, hire_date=date(2024, 1, 1))
        e2 = Employee(name="E2", department_id=dept_b.id, hire_date=date(2024, 1, 1))
        e3 = Employee(name="E3", department_id=dept_b.id, hire_date=date(2024, 1, 1))
        db.add_all([e1, e2, e3])
        db.commit()
        db.refresh(e1)
        db.refresh(e2)
        db.refresh(e3)

        db.add_all(
            [
                _survey(e1.id, date(2025, 1, 1), (15, 15, 15, 15, 15)),
                _survey(e1.id, date(2025, 2, 1), (16, 16, 16, 16, 16)),
                _survey(e1.id, date(2025, 3, 1), (17, 17, 17, 17, 17)),
                _survey(e2.id, date(2025, 1, 1), (18, 18, 18, 18, 18)),
                _survey(e2.id, date(2025, 2, 1), (19, 19, 19, 19, 19)),
                _survey(e3.id, date(2025, 1, 1), (20, 20, 20, 20, 20)),
            ]
        )
        db.commit()

        rows = build_training_dataset(db)
        summary = summarize_training_coverage(db, rows)
        report = format_coverage_report(summary)

        assert summary.total_surveys == 6
        assert summary.unique_employees == 3
        assert summary.employees_with_2plus_surveys == 2
        assert summary.training_pairs == 3
        assert summary.covered_departments == 2
        assert summary.pairs_by_department == {"A": 2, "B": 1}
        assert summary.min_pairs_per_employee == 1
        assert summary.median_pairs_per_employee == 1.5
        assert summary.max_pairs_per_employee == 2
        assert summary.warnings
        assert "training_pairs: 3" in report
    finally:
        db.close()
