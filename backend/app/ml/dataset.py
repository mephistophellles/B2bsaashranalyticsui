from __future__ import annotations

from collections import Counter, defaultdict
from statistics import median

from sqlalchemy.orm import Session

from app.ml.features import build_feature_row, survey_essi
from app.ml.types import CoverageSummary, DatasetRow
from app.models import Department, Employee, Survey


def chronological_surveys_by_employee(db: Session) -> dict[int, list[Survey]]:
    grouped: dict[int, list[Survey]] = defaultdict(list)
    rows = db.query(Survey).order_by(Survey.employee_id, Survey.survey_date, Survey.id).all()
    for survey in rows:
        grouped[survey.employee_id].append(survey)
    return dict(grouped)


def _active_employee_ids_at_date(employees_by_id: dict[int, Employee], survey_date) -> set[int]:
    active = set()
    for employee in employees_by_id.values():
        if employee.hire_date is None or employee.hire_date <= survey_date:
            active.add(employee.id)
    return active


def snapshot_surveys_at_date(
    surveys_by_employee: dict[int, list[Survey]],
    survey_date,
) -> dict[int, Survey]:
    snapshots: dict[int, Survey] = {}
    for employee_id, surveys in surveys_by_employee.items():
        latest = None
        for survey in surveys:
            if survey.survey_date <= survey_date:
                latest = survey
            else:
                break
        if latest is not None:
            snapshots[employee_id] = latest
    return snapshots


def temporal_context_at_date(
    *,
    survey_date,
    department_id: int,
    surveys_by_employee: dict[int, list[Survey]],
    employees_by_id: dict[int, Employee],
) -> tuple[float | None, int, float | None]:
    snapshots = snapshot_surveys_at_date(surveys_by_employee, survey_date)
    active_ids = _active_employee_ids_at_date(employees_by_id, survey_date)

    dept_employee_count = sum(
        1
        for employee_id in active_ids
        if employees_by_id[employee_id].department_id == department_id
    )

    dept_scores: list[float] = []
    dept_scores_by_department: dict[int, list[float]] = defaultdict(list)
    for employee_id, survey in snapshots.items():
        if employee_id not in active_ids:
            continue
        employee = employees_by_id.get(employee_id)
        if employee is None:
            continue
        essi = survey_essi(survey)
        dept_scores_by_department[employee.department_id].append(essi)
        if employee.department_id == department_id:
            dept_scores.append(essi)

    dept_avg = round(sum(dept_scores) / len(dept_scores), 2) if dept_scores else None
    dept_avgs = [
        sum(values) / len(values)
        for values in dept_scores_by_department.values()
        if values
    ]
    org_avg = round(sum(dept_avgs) / len(dept_avgs), 2) if dept_avgs else None
    return dept_avg, dept_employee_count, org_avg


def build_training_dataset(db: Session) -> list[DatasetRow]:
    employees = db.query(Employee).all()
    employees_by_id = {employee.id: employee for employee in employees}
    surveys_by_employee = chronological_surveys_by_employee(db)

    rows: list[DatasetRow] = []
    for employee_id, surveys in surveys_by_employee.items():
        employee = employees_by_id.get(employee_id)
        if employee is None or len(surveys) < 2:
            continue
        for idx in range(len(surveys) - 1):
            current = surveys[idx]
            nxt = surveys[idx + 1]
            prev = surveys[idx - 1] if idx > 0 else None
            dept_avg, dept_employee_count, org_avg = temporal_context_at_date(
                survey_date=current.survey_date,
                department_id=employee.department_id,
                surveys_by_employee=surveys_by_employee,
                employees_by_id=employees_by_id,
            )
            feature_row = build_feature_row(
                employee=employee,
                current_survey=current,
                prev_survey=prev,
                dept_avg_essi_t=dept_avg,
                dept_employee_count_t=dept_employee_count,
                org_avg_essi_t=org_avg,
            )
            next_essi = survey_essi(nxt)
            rows.append(
                DatasetRow(
                    employee_id=feature_row.employee_id,
                    department_id=feature_row.department_id,
                    survey_date_t=feature_row.survey_date_t,
                    current_essi=feature_row.current_essi,
                    block1_pct=feature_row.block1_pct,
                    block2_pct=feature_row.block2_pct,
                    block3_pct=feature_row.block3_pct,
                    block4_pct=feature_row.block4_pct,
                    block5_pct=feature_row.block5_pct,
                    prev_essi=feature_row.prev_essi,
                    delta_prev=feature_row.delta_prev,
                    days_since_prev_survey=feature_row.days_since_prev_survey,
                    tenure_days=feature_row.tenure_days,
                    dept_avg_essi_t=feature_row.dept_avg_essi_t,
                    dept_employee_count_t=feature_row.dept_employee_count_t,
                    org_avg_essi_t=feature_row.org_avg_essi_t,
                    survey_date_t1=nxt.survey_date,
                    next_essi=next_essi,
                    delta_next_essi=round(next_essi - feature_row.current_essi, 2),
                )
            )
    return rows


def summarize_training_coverage(db: Session, rows: list[DatasetRow]) -> CoverageSummary:
    surveys_by_employee = chronological_surveys_by_employee(db)
    departments = {d.id: d.name for d in db.query(Department).all()}

    total_surveys = sum(len(surveys) for surveys in surveys_by_employee.values())
    unique_employees = len(surveys_by_employee)
    employees_with_2plus_surveys = sum(1 for surveys in surveys_by_employee.values() if len(surveys) >= 2)
    pairs_per_employee = Counter(row.employee_id for row in rows)
    pairs_by_department_id = Counter(row.department_id for row in rows)
    pair_counts = list(pairs_per_employee.values())

    warnings: list[str] = []
    if len(rows) < 30:
        warnings.append("Мало training pairs для MVP ML: рекомендуется минимум 30+ пар t->t+1.")
    if employees_with_2plus_surveys < 10:
        warnings.append("Мало сотрудников с >=2 surveys: temporal target next-period ESSI будет нестабилен.")
    if len(pairs_by_department_id) < 2:
        warnings.append("Покрытие отделов слабое: модель может переобучиться на одном подразделении.")

    return CoverageSummary(
        total_surveys=total_surveys,
        unique_employees=unique_employees,
        employees_with_2plus_surveys=employees_with_2plus_surveys,
        training_pairs=len(rows),
        covered_departments=len(pairs_by_department_id),
        pairs_by_department={
            departments.get(department_id, f"department:{department_id}"): count
            for department_id, count in sorted(
                pairs_by_department_id.items(),
                key=lambda item: (departments.get(item[0], ""), item[0]),
            )
        },
        min_pairs_per_employee=min(pair_counts) if pair_counts else 0,
        median_pairs_per_employee=float(median(pair_counts)) if pair_counts else 0.0,
        max_pairs_per_employee=max(pair_counts) if pair_counts else 0,
        warnings=warnings,
    )


def format_coverage_report(summary: CoverageSummary) -> str:
    lines = [
        "ML dataset coverage report",
        f"total_surveys: {summary.total_surveys}",
        f"unique_employees: {summary.unique_employees}",
        f"employees_with_2plus_surveys: {summary.employees_with_2plus_surveys}",
        f"training_pairs: {summary.training_pairs}",
        f"covered_departments: {summary.covered_departments}",
        "pairs_by_department:",
    ]
    if summary.pairs_by_department:
        for department, count in summary.pairs_by_department.items():
            lines.append(f"  - {department}: {count}")
    else:
        lines.append("  - none")
    lines.extend(
        [
            f"pairs_per_employee_min: {summary.min_pairs_per_employee}",
            f"pairs_per_employee_median: {summary.median_pairs_per_employee}",
            f"pairs_per_employee_max: {summary.max_pairs_per_employee}",
        ]
    )
    if summary.warnings:
        lines.append("warnings:")
        for warning in summary.warnings:
            lines.append(f"  - {warning}")
    else:
        lines.append("warnings:")
        lines.append("  - none")
    return "\n".join(lines)
