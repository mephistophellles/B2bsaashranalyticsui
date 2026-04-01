"""Recommendations orchestration: ML-backed when available, rule-based fallback otherwise."""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.ml.predict import run_inference
from app.ml.recommendations import aggregate_department_risks, build_recommendation_drafts
from app.models import Department, Employee, IndexRecord, Recommendation


@dataclass(frozen=True, slots=True)
class RecommendationGenerationResult:
    created_count: int
    strategy: str  # ml | rules
    model_version: str | None
    artifact_path: str | None
    fallback_used: bool
    fallback_reason: str | None
    resolution_source: str
    reason: str


def _detail_text_high(
    dept_name: str,
    avg: float,
    n_emp: int,
    n_crisis: int,
    n_risk: int,
    n_low: int,
) -> str:
    share_low = round(100 * n_low / n_emp, 1) if n_emp else 0.0
    return (
        f"По отделу «{dept_name}» средний ИСУР (ESSI) сейчас {avg:.1f} при {n_emp} сотрудниках с актуальным индексом.\n"
        f"В зоне кризиса (<40): {n_crisis} чел., в зоне риска (40–60): {n_risk} чел. "
        f"Доля сотрудников с ESSI ниже 60: {share_low}%.\n\n"
        "Рекомендуемые шаги в ближайшие 2–4 недели:\n"
        "• Провести серию коротких 1:1 с теми, у кого индекс ниже 60; зафиксировать нагрузку, поддержку и ожидания.\n"
        "• Пересмотреть распределение задач и дедлайны; исключить хронический переработ у наиболее нагруженных.\n"
        "• Согласовать с HR единый формат обратной связи и признания результатов (публично и индивидуально).\n"
        "• Назначить ответственного за контроль динамики ESSI и повторную диагностику через 1–2 месяца."
    )


def _detail_text_medium(dept_name: str, avg: float, n_emp: int, n_low: int) -> str:
    return (
        f"Отдел «{dept_name}»: средний ESSI {avg:.1f}, в выборке {n_emp} сотрудников. "
        f"Ниже 60 баллов — {n_low} чел.\n\n"
        "Рекомендации:\n"
        "• Усилить регулярную обратную связь (не реже раза в две недели по ключевым ролям).\n"
        "• Ввести или обновить простые ритуалы признания успехов команды.\n"
        "• Обсудить на отделной встрече ожидания и связь личных целей с целями подразделения без давления «сверху вниз».\n"
        "• При стабильной динамике — закрепить практики и повторить опрос по графику методики."
    )


def _employee_text_high(dept_name: str, avg: float) -> str:
    return (
        f"По отделу «{dept_name}» сейчас непростая общая картина по показателю устойчивости (ESSI ≈ {avg:.0f}). "
        "Это оценка динамики команды, а не ваша личная «оценка».\n\n"
        "Что может помочь:\n"
        "• Если нагрузка, неясные ожидания или стресс мешают — честно скажите об этом руководителю.\n"
        "• Следите за отдыхом и границами рабочего времени; усталость сказывается на всех.\n"
        "• Если в компании есть поддержка (HR, программы wellbeing) — это нормальный шаг, уточните, как к ней обратиться.\n"
        "• Участие в опросах помогает команде увидеть общую картину и действовать осмысленно."
    )


def _employee_text_medium(dept_name: str, avg: float) -> str:
    return (
        f"В отделе «{dept_name}» средний ESSI около {avg:.0f} — есть запас, но и зоны внимания.\n\n"
        "Что можно сделать:\n"
        "• Регулярно синхронизируйтесь с руководителем по задачам и обратной связи.\n"
        "• Отмечайте небольшие успехи — это поддерживает мотивацию в команде.\n"
        "• Если что-то смущает в процессах, обсудите это на встрече или в личном сообщении руководителю."
    )


def generate_rule_based(db: Session) -> int:
    """Обновить рекомендации по правилам; строки «Выполнено» не удаляем."""
    _clear_active_recommendations(db)
    created = 0
    departments = db.query(Department).all()
    for dept in departments:
        emps = [e.id for e in db.query(Employee).filter(Employee.department_id == dept.id).all()]
        if not emps:
            continue
        rows = db.query(IndexRecord).filter(IndexRecord.employee_id.in_(emps)).all()
        if not rows:
            continue
        latest_by_eid: dict[int, IndexRecord] = {}
        for r in sorted(rows, key=lambda x: (x.calc_date, x.id), reverse=True):
            if r.employee_id not in latest_by_eid:
                latest_by_eid[r.employee_id] = r
        vals = list(latest_by_eid.values())
        n_emp = len(vals)
        avg = sum(r.essi for r in vals) / n_emp
        n_crisis = sum(1 for r in vals if r.essi < 40)
        n_zone = sum(1 for r in vals if 40 <= r.essi < 60)
        n_low = sum(1 for r in vals if r.essi < 60)
        if avg < 65 or n_low >= max(1, n_emp // 4):
            db.add(
                Recommendation(
                    department_id=dept.id,
                    title=f"Поддержка отдела «{dept.name}» (низкий средний ESSI)",
                    text=_detail_text_high(dept.name, avg, n_emp, n_crisis, n_zone, n_low),
                    text_employee=_employee_text_high(dept.name, avg),
                    priority="high",
                    status="Новая",
                    model_version="rules-v2",
                )
            )
            created += 1
        elif avg < 75:
            db.add(
                Recommendation(
                    department_id=dept.id,
                    title=f"Развитие и укрепление «{dept.name}»",
                    text=_detail_text_medium(dept.name, avg, n_emp, n_low),
                    text_employee=_employee_text_medium(dept.name, avg),
                    priority="medium",
                    status="Новая",
                    model_version="rules-v2",
                )
            )
            created += 1
    db.flush()
    _dedup_active_recommendations(db)
    db.commit()
    return created


def generate_recommendations(
    db: Session,
    *,
    artifact_root: str | None = None,
) -> int:
    return generate_recommendations_with_status(db, artifact_root=artifact_root).created_count


def generate_recommendations_with_status(
    db: Session,
    *,
    artifact_root: str | None = None,
) -> RecommendationGenerationResult:
    """
    Try ML-backed recommendations first.
    If artifact is missing, broken, or inference fails, fallback to existing rule-based generation.
    """
    inference = run_inference(db, artifact_root=artifact_root)
    if inference.status == "success" and inference.employee_results:
        departments = {dept.id: dept.name for dept in db.query(Department).all()}
        summaries = aggregate_department_risks(inference.employee_results, departments)
        if summaries:
            _clear_active_recommendations(db)
            for draft in build_recommendation_drafts(
                summaries,
                model_version=inference.model_version or "ml-unknown",
            ):
                db.add(
                    Recommendation(
                        department_id=draft.department_id,
                        title=draft.title,
                        text=draft.text,
                        text_employee=draft.text_employee,
                        priority=draft.priority,
                        status="Новая",
                        model_version=draft.model_version,
                    )
                )
            db.flush()
            _dedup_active_recommendations(db)
            db.commit()
            return RecommendationGenerationResult(
                created_count=len(summaries),
                strategy="ml",
                model_version=inference.model_version,
                artifact_path=inference.artifact_path,
                fallback_used=False,
                fallback_reason=None,
                resolution_source=inference.resolution_source,
                reason="ml-backed recommendations generated",
            )
    created = generate_rule_based(db)
    return RecommendationGenerationResult(
        created_count=created,
        strategy="rules",
        model_version="rules-v2",
        artifact_path=inference.artifact_path,
        fallback_used=True,
        fallback_reason=inference.reason,
        resolution_source=inference.resolution_source,
        reason="rule-based recommendations generated via fallback",
    )


def _clear_active_recommendations(db: Session) -> None:
    db.query(Recommendation).filter(Recommendation.status != "Выполнено").delete(
        synchronize_session=False
    )


def _dedup_active_recommendations(db: Session) -> None:
    """Оставляем одну активную запись на (department_id, priority, model_version)."""
    rows = (
        db.query(Recommendation)
        .filter(Recommendation.status != "Выполнено")
        .order_by(Recommendation.id.desc())
        .all()
    )
    seen: set[tuple[int, str, str]] = set()
    for r in rows:
        key = (r.department_id, r.priority, r.model_version or "")
        if key in seen:
            db.delete(r)
        else:
            seen.add(key)


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
        X_list.append([r.essi, r.essi**2])
        y_list.append(min(100.0, r.essi + 5.0))

    X = np.array(X_list)
    y = np.array(y_list)
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)
    model = LGBMRegressor(n_estimators=20, random_state=42)
    model.fit(X_train, y_train)

    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    with mlflow.start_run(run_name=f"lgbm-{datetime.now(UTC).isoformat()}"):
        mlflow.log_param("n_estimators", 20)
        mlflow.lightgbm.log_model(model, artifact_path="model")
        run = mlflow.active_run()
        vid = run.info.run_id if run else "local"
    return f"lgbm-{vid[:8]}"
