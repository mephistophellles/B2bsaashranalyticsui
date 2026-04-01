from __future__ import annotations

import json
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.ml.dataset import build_training_dataset
from app.ml.storage import artifact_dir
from app.ml.train import DEFAULT_MIN_PAIRS, DEFAULT_MIN_UNIQUE_EMPLOYEES, train_baseline_model
from app.ml.types import MLRunRecord, TrainingMetrics, TrainingResult
from app.services.recommendations_engine import generate_recommendations_with_status

RUNS_DIRNAME = "runs"


def _now() -> str:
    return datetime.now(UTC).isoformat()


def runs_dir(artifact_root: str | None = None) -> Path:
    base = artifact_dir(artifact_root) / RUNS_DIRNAME
    base.mkdir(parents=True, exist_ok=True)
    return base


def run_path(run_id: str, artifact_root: str | None = None) -> Path:
    return runs_dir(artifact_root) / f"{run_id}.json"


def create_run(
    *,
    operation_type: str,
    triggered_by: str,
    requested_model_type: str | None = None,
    note: str | None = None,
    artifact_root: str | None = None,
) -> MLRunRecord:
    record = MLRunRecord(
        run_id=uuid4().hex,
        operation_type=operation_type,
        started_at=_now(),
        finished_at=None,
        status="running",
        reason="operation scheduled",
        triggered_by=triggered_by,
        requested_model_type=requested_model_type,
        resulting_model_version=None,
        artifact_path=None,
        summary=None,
        note=note,
        error=None,
    )
    write_run(record, artifact_root)
    return record


def write_run(record: MLRunRecord, artifact_root: str | None = None) -> MLRunRecord:
    run_path(record.run_id, artifact_root).write_text(
        json.dumps(asdict(record), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return record


def read_run(run_id: str, artifact_root: str | None = None) -> MLRunRecord | None:
    path = run_path(run_id, artifact_root)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return MLRunRecord(**data)


def update_run(
    run_id: str,
    *,
    artifact_root: str | None = None,
    finished_at: str | None = None,
    status: str | None = None,
    reason: str | None = None,
    resulting_model_version: str | None = None,
    artifact_path: str | None = None,
    summary: dict | None = None,
    error: str | None = None,
) -> MLRunRecord:
    current = read_run(run_id, artifact_root)
    if current is None:
        raise FileNotFoundError(f"ML run not found: {run_id}")
    updated = MLRunRecord(
        run_id=current.run_id,
        operation_type=current.operation_type,
        started_at=current.started_at,
        finished_at=finished_at if finished_at is not None else current.finished_at,
        status=status if status is not None else current.status,
        reason=reason if reason is not None else current.reason,
        triggered_by=current.triggered_by,
        requested_model_type=current.requested_model_type,
        resulting_model_version=(
            resulting_model_version if resulting_model_version is not None else current.resulting_model_version
        ),
        artifact_path=artifact_path if artifact_path is not None else current.artifact_path,
        summary=summary if summary is not None else current.summary,
        note=current.note,
        error=error if error is not None else current.error,
    )
    return write_run(updated, artifact_root)


def list_runs(
    artifact_root: str | None = None,
    *,
    operation_type: str | None = None,
    limit: int = 50,
) -> list[MLRunRecord]:
    rows: list[MLRunRecord] = []
    for path in sorted(runs_dir(artifact_root).glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            record = MLRunRecord(**json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            continue
        if operation_type and record.operation_type != operation_type:
            continue
        rows.append(record)
        if len(rows) >= limit:
            break
    return rows


def latest_run(operation_type: str, artifact_root: str | None = None) -> MLRunRecord | None:
    rows = list_runs(artifact_root, operation_type=operation_type, limit=1)
    return rows[0] if rows else None


def execute_train_operation(
    db: Session,
    *,
    triggered_by: str,
    requested_model_type: str = "linear_numpy",
    min_pairs: int = DEFAULT_MIN_PAIRS,
    min_unique_employees: int = DEFAULT_MIN_UNIQUE_EMPLOYEES,
    artifact_root: str | None = None,
    note: str | None = None,
    run_id: str | None = None,
) -> tuple[TrainingResult, MLRunRecord]:
    run = (
        read_run(run_id, artifact_root)
        if run_id is not None
        else create_run(
            operation_type="train",
            triggered_by=triggered_by,
            requested_model_type=requested_model_type,
            note=note,
            artifact_root=artifact_root,
        )
    )
    if run is None:
        raise FileNotFoundError(f"ML run not found: {run_id}")
    try:
        rows = build_training_dataset(db)
        result = train_baseline_model(
            rows,
            preferred_model_type=requested_model_type,
            min_pairs=min_pairs,
            min_unique_employees=min_unique_employees,
            artifact_root=artifact_root,
        )
        run_status = {"trained": "success", "skipped": "skipped", "failed": "failed"}[result.status]
        summary = {
            "train_rows": result.train_rows,
            "unique_employees": result.unique_employees,
            "metrics": {
                "mae": result.metrics.mae,
                "rmse": result.metrics.rmse,
                "train_rows": result.metrics.train_rows,
                "validation_rows": result.metrics.validation_rows,
                "validation_note": result.metrics.validation_note,
                "warnings": result.metrics.warnings,
                "validation_risk_distribution": result.metrics.validation_risk_distribution,
            },
        }
        updated = update_run(
            run.run_id,
            artifact_root=artifact_root,
            finished_at=_now(),
            status=run_status,
            reason=result.reason,
            resulting_model_version=result.model_version,
            artifact_path=result.artifact_path,
            summary=summary,
            error=result.reason if result.status == "failed" else None,
        )
        return result, updated
    except Exception as exc:
        updated = update_run(
            run.run_id,
            artifact_root=artifact_root,
            finished_at=_now(),
            status="failed",
            reason=f"training failed: {exc}",
            summary=None,
            error=str(exc),
        )
        return (
            TrainingResult(
                status="failed",
                reason=f"training failed: {exc}",
                train_rows=0,
                unique_employees=0,
                model_type=requested_model_type,
                model_version=None,
                metrics=TrainingMetrics(
                    mae=None,
                    rmse=None,
                    train_rows=0,
                    validation_rows=0,
                    warnings=["training exception raised before artifact save"],
                    validation_risk_distribution=None,
                ),
                artifact_path=None,
            ),
            updated,
        )


def run_train_operation_background(
    *,
    triggered_by: str,
    requested_model_type: str = "linear_numpy",
    min_pairs: int = DEFAULT_MIN_PAIRS,
    min_unique_employees: int = DEFAULT_MIN_UNIQUE_EMPLOYEES,
    artifact_root: str | None = None,
    note: str | None = None,
    run_id: str,
) -> None:
    db = SessionLocal()
    try:
        execute_train_operation(
            db,
            triggered_by=triggered_by,
            requested_model_type=requested_model_type,
            min_pairs=min_pairs,
            min_unique_employees=min_unique_employees,
            artifact_root=artifact_root,
            note=note,
            run_id=run_id,
        )
    finally:
        db.close()


def execute_refresh_operation(
    db: Session,
    *,
    triggered_by: str,
    artifact_root: str | None = None,
    note: str | None = None,
    run_id: str | None = None,
) -> MLRunRecord:
    run = (
        read_run(run_id, artifact_root)
        if run_id is not None
        else create_run(
            operation_type="refresh_recommendations",
            triggered_by=triggered_by,
            requested_model_type=None,
            note=note,
            artifact_root=artifact_root,
        )
    )
    if run is None:
        raise FileNotFoundError(f"ML run not found: {run_id}")
    try:
        result = generate_recommendations_with_status(db, artifact_root=artifact_root)
        summary = {
            "created_count": result.created_count,
            "strategy": result.strategy,
            "fallback_used": result.fallback_used,
            "fallback_reason": result.fallback_reason,
            "resolution_source": result.resolution_source,
        }
        return update_run(
            run.run_id,
            artifact_root=artifact_root,
            finished_at=_now(),
            status="success",
            reason=result.reason,
            resulting_model_version=result.model_version,
            artifact_path=result.artifact_path,
            summary=summary,
            error=None,
        )
    except Exception as exc:
        return update_run(
            run.run_id,
            artifact_root=artifact_root,
            finished_at=_now(),
            status="failed",
            reason=f"refresh failed: {exc}",
            summary=None,
            error=str(exc),
        )
