from __future__ import annotations

from sqlalchemy.orm import Session

from app.ml.dataset import chronological_surveys_by_employee, temporal_context_at_date
from app.ml.features import build_feature_row, compact_feature_vector
from app.ml.storage import resolve_runtime_artifact
from app.ml.types import FeatureRow, InferenceEmployeeResult, InferenceRunResult
from app.models import Employee

HIGH_RISK_DELTA_THRESHOLD = -10.0
MEDIUM_RISK_DELTA_THRESHOLD = 0.0


def _np():
    import numpy as np

    return np


def _predict_linear_numpy(model_payload: dict, rows: list[FeatureRow]) -> list[float]:
    if not rows:
        return []
    np = _np()
    X = np.array([compact_feature_vector(row) for row in rows], dtype=float)
    x_mean = np.array(model_payload["x_mean"], dtype=float)
    x_std = np.array(model_payload["x_std"], dtype=float)
    coef = np.array(model_payload["coef"], dtype=float)
    intercept = float(model_payload["intercept"])
    preds = ((X - x_mean) / x_std) @ coef + intercept
    return preds.astype(float).tolist()


def _predict_lightgbm(model_payload: dict, rows: list[FeatureRow]) -> list[float]:
    if not rows:
        return []
    X = [compact_feature_vector(row) for row in rows]
    model = model_payload["model"]
    return [float(value) for value in model.predict(X)]


def _risk_band(predicted_delta_next_essi: float) -> str:
    if predicted_delta_next_essi <= HIGH_RISK_DELTA_THRESHOLD:
        return "high"
    if predicted_delta_next_essi < MEDIUM_RISK_DELTA_THRESHOLD:
        return "medium"
    return "low"


def build_latest_feature_rows(db: Session) -> list[FeatureRow]:
    employees = db.query(Employee).all()
    employees_by_id = {employee.id: employee for employee in employees}
    surveys_by_employee = chronological_surveys_by_employee(db)

    rows: list[FeatureRow] = []
    for employee_id, surveys in surveys_by_employee.items():
        employee = employees_by_id.get(employee_id)
        if employee is None or not surveys:
            continue
        current = surveys[-1]
        prev = surveys[-2] if len(surveys) >= 2 else None
        dept_avg, dept_employee_count, org_avg = temporal_context_at_date(
            survey_date=current.survey_date,
            department_id=employee.department_id,
            surveys_by_employee=surveys_by_employee,
            employees_by_id=employees_by_id,
        )
        rows.append(
            build_feature_row(
                employee=employee,
                current_survey=current,
                prev_survey=prev,
                dept_avg_essi_t=dept_avg,
                dept_employee_count_t=dept_employee_count,
                org_avg_essi_t=org_avg,
            )
        )
    return sorted(rows, key=lambda row: (row.department_id, row.employee_id))


def run_inference(
    db: Session,
    *,
    artifact_root: str | None = None,
) -> InferenceRunResult:
    artifact, status = resolve_runtime_artifact(artifact_root)
    if artifact is None:
        return InferenceRunResult(
            status="skipped" if status.last_status in {"no_active_model", "active_manifest_missing"} else "failed",
            reason=status.last_reason,
            model_type=status.model_type,
            model_version=status.active_model_version,
            artifact_path=status.artifact_path,
            resolution_source=status.resolution_source,
            employee_results=[],
        )

    model_type = artifact.get("model_type")
    model_version = artifact.get("model_version")
    model_payload = artifact.get("model_payload")
    if not model_type or model_payload is None:
        return InferenceRunResult(
            status="failed",
            reason="model artifact is missing model_type or model_payload",
            model_type=model_type,
            model_version=model_version,
            artifact_path=status.artifact_path,
            resolution_source=status.resolution_source,
            employee_results=[],
        )

    rows = build_latest_feature_rows(db)
    if not rows:
        return InferenceRunResult(
            status="skipped",
            reason="no surveys available for inference",
            model_type=model_type,
            model_version=model_version,
            artifact_path=status.artifact_path,
            resolution_source=status.resolution_source,
            employee_results=[],
        )

    try:
        if model_type == "lightgbm":
            predictions = _predict_lightgbm(model_payload, rows)
        elif model_type == "linear_numpy":
            predictions = _predict_linear_numpy(model_payload, rows)
        else:
            return InferenceRunResult(
                status="failed",
                reason=f"unsupported model_type: {model_type}",
                model_type=model_type,
                model_version=model_version,
                artifact_path=status.artifact_path,
                resolution_source=status.resolution_source,
                employee_results=[],
            )
    except Exception as exc:
        return InferenceRunResult(
            status="failed",
            reason=f"inference failed: {exc}",
            model_type=model_type,
            model_version=model_version,
            artifact_path=status.artifact_path,
            resolution_source=status.resolution_source,
            employee_results=[],
        )

    employee_results: list[InferenceEmployeeResult] = []
    for row, predicted_delta in zip(rows, predictions):
        predicted_delta = round(float(predicted_delta), 2)
        predicted_next = round(row.current_essi + predicted_delta, 2)
        employee_results.append(
            InferenceEmployeeResult(
                employee_id=row.employee_id,
                department_id=row.department_id,
                survey_date_t=row.survey_date_t,
                current_essi=row.current_essi,
                block1_pct=row.block1_pct,
                block2_pct=row.block2_pct,
                block3_pct=row.block3_pct,
                block4_pct=row.block4_pct,
                block5_pct=row.block5_pct,
                prev_essi=row.prev_essi,
                delta_prev=row.delta_prev,
                days_since_prev_survey=row.days_since_prev_survey,
                tenure_days=row.tenure_days,
                dept_avg_essi_t=row.dept_avg_essi_t,
                dept_employee_count_t=row.dept_employee_count_t,
                org_avg_essi_t=row.org_avg_essi_t,
                predicted_delta_next_essi=predicted_delta,
                predicted_next_essi=predicted_next,
                risk_band=_risk_band(predicted_delta),
            )
        )

    return InferenceRunResult(
        status="success",
        reason="inference completed",
        model_type=model_type,
        model_version=model_version,
        artifact_path=status.artifact_path,
        resolution_source=status.resolution_source,
        employee_results=employee_results,
    )
