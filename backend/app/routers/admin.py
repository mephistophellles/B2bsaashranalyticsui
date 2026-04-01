from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import get_db
from app.dependencies import audit, require_roles
from app.ml.ops import (
    create_run,
    execute_refresh_operation,
    execute_train_operation,
    latest_run,
    list_runs,
    read_run,
    run_train_operation_background,
)
from app.ml.storage import (
    find_artifact_by_model_version,
    list_artifacts,
    read_artifact_status,
    write_active_manifest,
)
from app.ml.train import DEFAULT_MIN_PAIRS, DEFAULT_MIN_UNIQUE_EMPLOYEES
from app.models import User, UserRole
from app.schemas import (
    MLModelArtifactOut,
    MLPromoteRequest,
    MLPromoteResultOut,
    MLRefreshRequest,
    MLRunOut,
    MLStatusOut,
    MLTrainRequest,
    MLTrainResultOut,
    MLTrainingMetricsOut,
    UserAdminListPage,
    UserAdminOut,
    UserAdminPatch,
    UserAdminResetPassword,
    UserCreateRequest,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _metrics_out(metrics) -> MLTrainingMetricsOut:
    return MLTrainingMetricsOut(
        mae=metrics.mae,
        rmse=metrics.rmse,
        train_rows=metrics.train_rows,
        validation_rows=metrics.validation_rows,
        validation_note=metrics.validation_note,
        warnings=metrics.warnings,
        validation_risk_distribution=metrics.validation_risk_distribution,
    )


def _artifact_out(item) -> MLModelArtifactOut:
    return MLModelArtifactOut(
        model_version=item.model_version,
        model_type=item.model_type,
        trained_at=item.trained_at,
        artifact_path=item.artifact_path,
        train_rows=item.train_rows,
        unique_employees=item.unique_employees,
        metrics=_metrics_out(item.metrics) if item.metrics is not None else None,
        is_active=item.is_active,
        load_status=item.load_status,
        load_reason=item.load_reason,
    )


def _run_out(run) -> MLRunOut:
    return MLRunOut(
        run_id=run.run_id,
        operation_type=run.operation_type,
        started_at=run.started_at,
        finished_at=run.finished_at,
        status=run.status,
        reason=run.reason,
        triggered_by=run.triggered_by,
        requested_model_type=run.requested_model_type,
        resulting_model_version=run.resulting_model_version,
        artifact_path=run.artifact_path,
        summary=run.summary,
        note=run.note,
        error=run.error,
    )


@router.get("/users", response_model=UserAdminListPage)
def list_users(
    q: str | None = Query(None, description="Поиск по username"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_roles(UserRole.admin)),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        query = query.filter(User.username.contains(q.strip()))
    total = query.count()
    rows = query.order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(limit).all()
    items = [UserAdminOut.model_validate(row) for row in rows]
    return UserAdminListPage(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + limit) < total,
    )


@router.post("/users", status_code=201)
def create_user(
    body: UserCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    u = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        employee_id=body.employee_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    audit(db, user, "admin_create_user", "user", {"username": body.username})
    return {"id": u.id, "username": u.username}


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def patch_user(
    user_id: int,
    body: UserAdminPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        target.role = body.role
    if body.employee_id is not None or body.role == UserRole.employee:
        target.employee_id = body.employee_id
    if body.role is not None and body.role != UserRole.employee:
        target.employee_id = None
    db.commit()
    db.refresh(target)
    audit(
        db,
        user,
        "admin_update_user",
        "user",
        {"id": user_id, "role": target.role.value, "employee_id": target.employee_id},
    )
    return UserAdminOut.model_validate(target)


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    body: UserAdminResetPassword,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.password_hash = hash_password(body.new_password)
    db.commit()
    audit(db, user, "admin_reset_password", "user", {"id": user_id})
    return {"ok": True}


@router.post("/ml/train", response_model=MLTrainResultOut)
def train_ml_model(
    body: MLTrainRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    result, run = execute_train_operation(
        db,
        triggered_by=user.username,
        requested_model_type=body.model_type,
        min_pairs=body.min_pairs if body.min_pairs is not None else DEFAULT_MIN_PAIRS,
        min_unique_employees=(
            body.min_unique_employees if body.min_unique_employees is not None else DEFAULT_MIN_UNIQUE_EMPLOYEES
        ),
        artifact_root=body.artifact_dir,
        note=body.note,
    )
    audit(
        db,
        user,
        "admin_ml_train",
        "ml_model",
        {
            "status": result.status,
            "model_type": result.model_type,
            "model_version": result.model_version,
            "artifact_path": result.artifact_path,
            "run_id": run.run_id,
        },
    )
    return MLTrainResultOut(
        status=result.status,
        reason=result.reason,
        model_type=result.model_type,
        model_version=result.model_version,
        artifact_path=result.artifact_path,
        train_rows=result.train_rows,
        unique_employees=result.unique_employees,
        metrics=_metrics_out(result.metrics),
    )


@router.post("/ml/train-async", response_model=MLRunOut, status_code=202)
def train_ml_model_async(
    body: MLTrainRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    run = create_run(
        operation_type="train",
        triggered_by=user.username,
        requested_model_type=body.model_type,
        note=body.note,
        artifact_root=body.artifact_dir,
    )
    background_tasks.add_task(
        run_train_operation_background,
        triggered_by=user.username,
        requested_model_type=body.model_type,
        min_pairs=body.min_pairs if body.min_pairs is not None else DEFAULT_MIN_PAIRS,
        min_unique_employees=(
            body.min_unique_employees if body.min_unique_employees is not None else DEFAULT_MIN_UNIQUE_EMPLOYEES
        ),
        artifact_root=body.artifact_dir,
        note=body.note,
        run_id=run.run_id,
    )
    audit(
        db,
        user,
        "admin_ml_train_async",
        "ml_model",
        {"run_id": run.run_id, "requested_model_type": body.model_type},
    )
    return _run_out(run)


@router.post("/ml/refresh", response_model=MLRunOut)
def refresh_ml_recommendations(
    body: MLRefreshRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    run = execute_refresh_operation(
        db,
        triggered_by=user.username,
        artifact_root=body.artifact_dir,
        note=body.note,
    )
    audit(
        db,
        user,
        "admin_ml_refresh",
        "ml_model",
        {"run_id": run.run_id, "status": run.status, "resulting_model_version": run.resulting_model_version},
    )
    return _run_out(run)


@router.get("/ml/models", response_model=list[MLModelArtifactOut])
def list_ml_models(
    artifact_dir: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    rows = [_artifact_out(item) for item in list_artifacts(artifact_dir)]
    audit(
        db,
        user,
        "admin_ml_models",
        "ml_model",
        {"count": len(rows), "artifact_dir": artifact_dir},
    )
    return rows


@router.get("/ml/runs", response_model=list[MLRunOut])
def list_ml_runs(
    artifact_dir: str | None = None,
    operation_type: str | None = Query(None, pattern="^(train|refresh_recommendations)$"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    rows = [_run_out(run) for run in list_runs(artifact_dir, operation_type=operation_type, limit=limit)]
    audit(
        db,
        user,
        "admin_ml_runs",
        "ml_model",
        {"count": len(rows), "operation_type": operation_type},
    )
    return rows


@router.get("/ml/runs/{run_id}", response_model=MLRunOut)
def get_ml_run(
    run_id: str,
    artifact_dir: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    run = read_run(run_id, artifact_dir)
    if run is None:
        raise HTTPException(status_code=404, detail="ML run not found")
    audit(db, user, "admin_ml_run_detail", "ml_model", {"run_id": run_id})
    return _run_out(run)


@router.post("/ml/promote", response_model=MLPromoteResultOut)
def promote_ml_model(
    body: MLPromoteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    status = read_artifact_status(body.artifact_dir)
    current_version = status.active_model_version
    artifact = find_artifact_by_model_version(body.model_version, body.artifact_dir)
    if artifact is None or artifact.load_status != "ok" or artifact.model_type is None:
        raise HTTPException(status_code=404, detail="Model artifact not found")
    manifest = write_active_manifest(
        model_version=artifact.model_version or body.model_version,
        model_type=artifact.model_type,
        artifact_path_value=artifact.artifact_path,
        promoted_by=user.username,
        note=body.note,
        previous_model_version=current_version,
        override=body.artifact_dir,
    )
    audit(
        db,
        user,
        "admin_ml_promote",
        "ml_model",
        {
            "active_model_version": manifest.active_model_version,
            "previous_model_version": manifest.previous_model_version,
            "artifact_path": manifest.artifact_path,
        },
    )
    return MLPromoteResultOut(
        status="promoted",
        active_model_version=manifest.active_model_version,
        previous_model_version=manifest.previous_model_version,
        artifact_path=manifest.artifact_path,
        promoted_at=manifest.promoted_at,
        note=manifest.note,
    )


@router.get("/ml/status", response_model=MLStatusOut)
def ml_status(
    artifact_dir: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    status = read_artifact_status(artifact_dir)
    last_train = latest_run("train", artifact_dir)
    last_refresh = latest_run("refresh_recommendations", artifact_dir)
    audit(
        db,
        user,
        "admin_ml_status",
        "ml_model",
        {"artifact_exists": status.artifact_exists, "model_version": status.active_model_version},
    )
    return MLStatusOut(
        artifact_exists=status.artifact_exists,
        active_model_version=status.active_model_version,
        model_type=status.model_type,
        trained_at=status.trained_at,
        artifact_path=status.artifact_path,
        train_rows=status.train_rows,
        unique_employees=status.unique_employees,
        metrics=_metrics_out(status.metrics) if status.metrics is not None else None,
        resolution_source=status.resolution_source,
        manifest_path=status.manifest_path,
        last_status=status.last_status,
        last_reason=status.last_reason,
        last_train_run=_run_out(last_train) if last_train else None,
        last_refresh_run=_run_out(last_refresh) if last_refresh else None,
    )
