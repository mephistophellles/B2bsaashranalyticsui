"""Rule-based recommendations + optional LightGBM hook."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Department, Employee, IndexRecord, Recommendation


def generate_rule_based(db: Session) -> int:
    """Replace recommendations with fresh rule-based set. Returns count created."""
    db.query(Recommendation).delete()
    created = 0
    departments = db.query(Department).all()
    for dept in departments:
        emps = [e.id for e in db.query(Employee).filter(Employee.department_id == dept.id).all()]
        if not emps:
            continue
        rows = db.query(IndexRecord).filter(IndexRecord.employee_id.in_(emps)).all()
        if not rows:
            continue
        avg = sum(r.essi for r in rows) / len(rows)
        low = [r for r in rows if r.essi < 70]
        if avg < 72 or len(low) >= max(1, len(rows) // 4):
            db.add(
                Recommendation(
                    department_id=dept.id,
                    title=f"Поддержка отдела «{dept.name}»",
                    text="Средний ESSI ниже целевого; запланируйте 1:1 и пересмотр нагрузки.",
                    priority="high",
                    status="Новая",
                    model_version="rules-v1",
                )
            )
            created += 1
        elif avg < 80:
            db.add(
                Recommendation(
                    department_id=dept.id,
                    title=f"Развитие «{dept.name}»",
                    text="Укрепите обратную связь и программы признания.",
                    priority="medium",
                    status="Новая",
                    model_version="rules-v1",
                )
            )
            created += 1
    db.commit()
    return created


def maybe_train_lightgbm_and_log(db: Session) -> str | None:
    """
    If enough labeled rows exist, train a small regressor and log to MLflow.
    Returns model version string or None if skipped.
    """
    try:
        import mlflow
        import numpy as np
        from lightgbm import LGBMRegressor
        from sklearn.model_selection import train_test_split
    except ImportError:
        return None

    from app.config import settings

    rows = db.query(IndexRecord).all()
    if len(rows) < 8:
        return None

    X_list = []
    y_list = []
    for r in rows:
        # Synthetic features from essi only for demo pipeline
        X_list.append([r.essi, r.essi**2])
        y_list.append(min(100.0, r.essi + 5.0))

    X = np.array(X_list)
    y = np.array(y_list)
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)
    model = LGBMRegressor(n_estimators=20, random_state=42)
    model.fit(X_train, y_train)

    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    with mlflow.start_run(run_name=f"lgbm-{datetime.utcnow().isoformat()}"):
        mlflow.log_param("n_estimators", 20)
        mlflow.lightgbm.log_model(model, artifact_path="model")
        run = mlflow.active_run()
        vid = run.info.run_id if run else "local"
    return f"lgbm-{vid[:8]}"
