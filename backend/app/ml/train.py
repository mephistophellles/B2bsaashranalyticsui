from __future__ import annotations

from datetime import UTC, datetime
import math

from app.ml.features import COMPACT_FEATURE_NAMES, compact_feature_vector
from app.ml.storage import save_model
from app.ml.types import DatasetRow, TrainingMetrics, TrainingResult

DEFAULT_MIN_PAIRS = 30
DEFAULT_MIN_UNIQUE_EMPLOYEES = 10
DEFAULT_VALIDATION_FRACTION = 0.2
MIN_MEANINGFUL_VALIDATION_ROWS = 5
RIDGE_ALPHA = 1.0


def _np():
    import numpy as np

    return np


def dataset_unique_employee_count(rows: list[DatasetRow]) -> int:
    return len({row.employee_id for row in rows})


def chronological_train_validation_split(
    rows: list[DatasetRow],
    *,
    validation_fraction: float = DEFAULT_VALIDATION_FRACTION,
) -> tuple[list[DatasetRow], list[DatasetRow], str | None]:
    if not rows:
        return [], [], "dataset is empty"
    ordered = sorted(rows, key=lambda row: (row.survey_date_t1, row.survey_date_t, row.employee_id))
    if len(ordered) < 5:
        return ordered, [], "validation skipped: dataset too small for time-based holdout"
    validation_rows = max(1, int(len(ordered) * validation_fraction))
    train_rows = len(ordered) - validation_rows
    if train_rows < 2:
        return ordered, [], "validation skipped: not enough train rows after split"
    return ordered[:train_rows], ordered[train_rows:], None


def _feature_matrix(rows: list[DatasetRow]):
    np = _np()
    X = np.array([compact_feature_vector(row) for row in rows], dtype=float)
    y = np.array([row.delta_next_essi for row in rows], dtype=float)
    return X, y


def _fit_linear_numpy(train_rows: list[DatasetRow]) -> dict:
    np = _np()
    X_train, y_train = _feature_matrix(train_rows)
    x_mean = X_train.mean(axis=0)
    x_std = X_train.std(axis=0)
    x_std = np.where(x_std == 0.0, 1.0, x_std)
    X_scaled = (X_train - x_mean) / x_std
    y_mean = float(y_train.mean()) if len(y_train) else 0.0
    y_centered = y_train - y_mean
    xtx = X_scaled.T @ X_scaled
    reg = RIDGE_ALPHA * np.eye(X_scaled.shape[1], dtype=float)
    coef = np.linalg.solve(xtx + reg, X_scaled.T @ y_centered)
    return {
        "model_type": "linear_numpy",
        "feature_names": COMPACT_FEATURE_NAMES,
        "x_mean": x_mean.tolist(),
        "x_std": x_std.tolist(),
        "coef": coef.tolist(),
        "intercept": y_mean,
    }


def _predict_linear_numpy(model_payload: dict, rows: list[DatasetRow]) -> list[float]:
    if not rows:
        return []
    np = _np()
    X, _ = _feature_matrix(rows)
    x_mean = np.array(model_payload["x_mean"], dtype=float)
    x_std = np.array(model_payload["x_std"], dtype=float)
    coef = np.array(model_payload["coef"], dtype=float)
    intercept = float(model_payload["intercept"])
    preds = ((X - x_mean) / x_std) @ coef + intercept
    return preds.astype(float).tolist()


def _fit_lightgbm(train_rows: list[DatasetRow]) -> dict:
    from lightgbm import LGBMRegressor

    X_train, y_train = _feature_matrix(train_rows)
    model = LGBMRegressor(n_estimators=40, learning_rate=0.05, random_state=42)
    model.fit(X_train, y_train)
    return {
        "model_type": "lightgbm",
        "feature_names": COMPACT_FEATURE_NAMES,
        "model": model,
    }


def _predict_lightgbm(model_payload: dict, rows: list[DatasetRow]) -> list[float]:
    if not rows:
        return []
    X, _ = _feature_matrix(rows)
    model = model_payload["model"]
    return [float(value) for value in model.predict(X)]


def _safe_metrics(validation_rows: list[DatasetRow], predictions: list[float]) -> tuple[float | None, float | None]:
    if not validation_rows or not predictions:
        return None, None
    y_true = [row.delta_next_essi for row in validation_rows]
    errors = [abs(true - pred) for true, pred in zip(y_true, predictions)]
    mae = sum(errors) / len(errors)
    rmse = math.sqrt(sum((true - pred) ** 2 for true, pred in zip(y_true, predictions)) / len(predictions))
    return round(mae, 4), round(rmse, 4)


def _risk_band_distribution(rows: list[DatasetRow]) -> dict[str, int] | None:
    if not rows:
        return None
    distribution = {"high": 0, "medium": 0, "low": 0}
    for row in rows:
        delta = row.delta_next_essi
        if delta <= -10.0:
            distribution["high"] += 1
        elif delta < 0.0:
            distribution["medium"] += 1
        else:
            distribution["low"] += 1
    return distribution


def train_baseline_model(
    rows: list[DatasetRow],
    *,
    preferred_model_type: str = "linear_numpy",
    min_pairs: int = DEFAULT_MIN_PAIRS,
    min_unique_employees: int = DEFAULT_MIN_UNIQUE_EMPLOYEES,
    validation_fraction: float = DEFAULT_VALIDATION_FRACTION,
    artifact_root: str | None = None,
) -> TrainingResult:
    unique_employees = dataset_unique_employee_count(rows)
    if len(rows) < min_pairs:
        return TrainingResult(
            status="skipped",
            reason=f"training skipped: need at least {min_pairs} pairs, got {len(rows)}",
            train_rows=len(rows),
            unique_employees=unique_employees,
            model_type=preferred_model_type,
            model_version=None,
            metrics=TrainingMetrics(
                mae=None,
                rmse=None,
                train_rows=len(rows),
                validation_rows=0,
                warnings=[f"quality gate: min_pairs={min_pairs} not met"],
                validation_risk_distribution=None,
            ),
            artifact_path=None,
        )
    if unique_employees < min_unique_employees:
        return TrainingResult(
            status="skipped",
            reason=f"training skipped: need at least {min_unique_employees} unique employees, got {unique_employees}",
            train_rows=len(rows),
            unique_employees=unique_employees,
            model_type=preferred_model_type,
            model_version=None,
            metrics=TrainingMetrics(
                mae=None,
                rmse=None,
                train_rows=len(rows),
                validation_rows=0,
                warnings=[f"quality gate: min_unique_employees={min_unique_employees} not met"],
                validation_risk_distribution=None,
            ),
            artifact_path=None,
        )

    train_rows, validation_rows, validation_note = chronological_train_validation_split(
        rows,
        validation_fraction=validation_fraction,
    )

    model_type = preferred_model_type
    fallback_note: str | None = None
    try:
        if preferred_model_type == "lightgbm":
            try:
                model_payload = _fit_lightgbm(train_rows)
            except ImportError:
                fallback_note = "lightgbm unavailable; fallback to linear_numpy"
                model_payload = _fit_linear_numpy(train_rows)
                model_type = "linear_numpy"
        else:
            model_payload = _fit_linear_numpy(train_rows)
            model_type = "linear_numpy"
    except Exception as exc:
        return TrainingResult(
            status="failed",
            reason=f"training failed: {exc}",
            train_rows=len(train_rows),
            unique_employees=unique_employees,
            model_type=model_type,
            model_version=None,
            metrics=TrainingMetrics(
                mae=None,
                rmse=None,
                train_rows=len(train_rows),
                validation_rows=len(validation_rows),
                warnings=["training exception raised before artifact save"],
                validation_risk_distribution=_risk_band_distribution(validation_rows),
            ),
            artifact_path=None,
        )

    if model_type == "lightgbm":
        predictions = _predict_lightgbm(model_payload, validation_rows)
    else:
        predictions = _predict_linear_numpy(model_payload, validation_rows)
    mae, rmse = _safe_metrics(validation_rows, predictions)

    note_parts = [part for part in [validation_note, fallback_note] if part]
    warnings: list[str] = []
    if validation_rows and len(validation_rows) < MIN_MEANINGFUL_VALIDATION_ROWS:
        warnings.append("validation statistically weak: too few holdout rows")
    train_employee_ids = {row.employee_id for row in train_rows}
    validation_employee_ids = {row.employee_id for row in validation_rows}
    if train_employee_ids & validation_employee_ids:
        warnings.append(
            "time-based split may be optimistic: some employees appear in both train and validation windows"
        )
    final_note = "; ".join(note_parts) if note_parts else None
    validation_distribution = _risk_band_distribution(validation_rows)

    now_utc = datetime.now(UTC)
    model_version = f"{model_type}-{now_utc.strftime('%Y%m%d%H%M%S%f')}"
    artifact_payload = {
        "model_version": model_version,
        "trained_at": now_utc.isoformat(),
        "model_type": model_type,
        "feature_names": COMPACT_FEATURE_NAMES,
        "train_rows": len(train_rows),
        "unique_employees": unique_employees,
        "metrics": {
            "mae": mae,
            "rmse": rmse,
            "train_rows": len(train_rows),
            "validation_rows": len(validation_rows),
            "validation_note": final_note,
            "warnings": warnings,
            "validation_risk_distribution": validation_distribution,
        },
        "model_payload": model_payload,
    }
    artifact_path = save_model(artifact_payload, model_version=model_version, artifact_root=artifact_root)

    return TrainingResult(
        status="trained",
        reason="training completed",
        train_rows=len(train_rows),
        unique_employees=unique_employees,
        model_type=model_type,
        model_version=model_version,
        metrics=TrainingMetrics(
            mae=mae,
            rmse=rmse,
            train_rows=len(train_rows),
            validation_rows=len(validation_rows),
            validation_note=final_note,
            warnings=warnings,
            validation_risk_distribution=validation_distribution,
        ),
        artifact_path=artifact_path,
    )


def format_training_report(result: TrainingResult) -> str:
    lines = [
        "ML baseline training report",
        f"status: {result.status}",
        f"reason: {result.reason}",
        f"train_rows: {result.train_rows}",
        f"unique_employees: {result.unique_employees}",
        f"model_type: {result.model_type}",
        f"model_version: {result.model_version or 'none'}",
        f"artifact_path: {result.artifact_path or 'none'}",
        "metrics:",
        f"  - train_rows: {result.metrics.train_rows}",
        f"  - validation_rows: {result.metrics.validation_rows}",
        f"  - mae: {result.metrics.mae if result.metrics.mae is not None else 'n/a'}",
        f"  - rmse: {result.metrics.rmse if result.metrics.rmse is not None else 'n/a'}",
        f"  - validation_note: {result.metrics.validation_note or 'none'}",
        f"  - warnings: {', '.join(result.metrics.warnings or ['none'])}",
    ]
    return "\n".join(lines)
