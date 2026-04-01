from __future__ import annotations

from datetime import date

from app.ml.types import DatasetRow, FeatureRow
from app.models import Employee, Survey
from app.services.essi import block_percentages, block_scores_from_survey, essi_from_blocks

COMPACT_FEATURE_NAMES = [
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
]


def survey_essi(survey: Survey) -> float:
    return essi_from_blocks(block_scores_from_survey(survey))


def survey_block_percentages(survey: Survey) -> tuple[float, float, float, float, float]:
    pcts = block_percentages(block_scores_from_survey(survey))
    return (pcts[0], pcts[1], pcts[2], pcts[3], pcts[4])


def tenure_days_at_survey(employee: Employee, survey_date: date) -> int | None:
    if employee.hire_date is None:
        return None
    if employee.hire_date > survey_date:
        return None
    return (survey_date - employee.hire_date).days


def build_feature_row(
    *,
    employee: Employee,
    current_survey: Survey,
    prev_survey: Survey | None,
    dept_avg_essi_t: float | None,
    dept_employee_count_t: int,
    org_avg_essi_t: float | None,
) -> FeatureRow:
    current_essi = survey_essi(current_survey)
    block1_pct, block2_pct, block3_pct, block4_pct, block5_pct = survey_block_percentages(current_survey)
    prev_essi = survey_essi(prev_survey) if prev_survey is not None else None
    delta_prev = round(current_essi - prev_essi, 2) if prev_essi is not None else None
    days_since_prev_survey = (
        (current_survey.survey_date - prev_survey.survey_date).days if prev_survey is not None else None
    )
    return FeatureRow(
        employee_id=employee.id,
        department_id=employee.department_id,
        survey_date_t=current_survey.survey_date,
        current_essi=current_essi,
        block1_pct=block1_pct,
        block2_pct=block2_pct,
        block3_pct=block3_pct,
        block4_pct=block4_pct,
        block5_pct=block5_pct,
        prev_essi=prev_essi,
        delta_prev=delta_prev,
        days_since_prev_survey=days_since_prev_survey,
        tenure_days=tenure_days_at_survey(employee, current_survey.survey_date),
        dept_avg_essi_t=dept_avg_essi_t,
        dept_employee_count_t=dept_employee_count_t,
        org_avg_essi_t=org_avg_essi_t,
    )


def compact_feature_vector(row: FeatureRow | DatasetRow) -> list[float]:
    current_essi = row.current_essi
    dept_avg = row.dept_avg_essi_t if row.dept_avg_essi_t is not None else current_essi
    org_avg = row.org_avg_essi_t if row.org_avg_essi_t is not None else dept_avg
    return [
        current_essi,
        row.block1_pct,
        row.block2_pct,
        row.block3_pct,
        row.block4_pct,
        row.block5_pct,
        row.prev_essi if row.prev_essi is not None else current_essi,
        row.delta_prev if row.delta_prev is not None else 0.0,
        float(row.days_since_prev_survey) if row.days_since_prev_survey is not None else 0.0,
        float(row.tenure_days) if row.tenure_days is not None else 0.0,
        dept_avg,
        float(row.dept_employee_count_t),
        org_avg,
    ]
