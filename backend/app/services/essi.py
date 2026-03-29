"""ESSI / ИСУР: сумма score_block1..5 (суммы баллов по блокам) / 125 × 100 (методика, 5×5 Лайкерт)."""

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Department, Employee, IndexRecord, Survey


def block_scores_from_survey(s: Survey) -> list[float]:
    return [
        s.score_block1,
        s.score_block2,
        s.score_block3,
        s.score_block4,
        s.score_block5,
    ]


def essi_from_blocks(block_scores: list[float]) -> float:
    total = sum(block_scores)
    return round(total / settings.max_essi_points * 100.0, 2)


def block_scores_for_target_essi(target: float) -> list[float]:
    """Пять сумм по блокам (каждая 5–25), в сумме дают целевой ИСУР 0–100 на шкале методики."""
    t = max(0.0, min(100.0, target))
    total_points = t / 100.0 * settings.max_essi_points
    base = total_points / 5.0
    raw = [min(25.0, max(5.0, base + (j - 2) * 1.1)) for j in range(5)]
    s = sum(raw)
    if s <= 0:
        return [25.0, 25.0, 25.0, 25.0, 25.0]
    scale = total_points / s
    return [round(min(25.0, max(5.0, x * scale)), 2) for x in raw]


def latest_survey_per_employee(db: Session) -> dict[int, Survey]:
    surveys = db.query(Survey).order_by(Survey.survey_date.desc(), Survey.id.desc()).all()
    latest: dict[int, Survey] = {}
    for s in surveys:
        if s.employee_id not in latest:
            latest[s.employee_id] = s
    return latest


def recompute_indices(db: Session, calc_date) -> None:
    """Replace current snapshot indices (one row per employee) for latest survey."""
    latest = latest_survey_per_employee(db)
    eids = list(latest.keys())
    if eids:
        db.query(IndexRecord).filter(IndexRecord.employee_id.in_(eids)).delete(synchronize_session=False)
    for eid, surv in latest.items():
        essi = essi_from_blocks(block_scores_from_survey(surv))
        db.add(IndexRecord(employee_id=eid, essi=essi, calc_date=calc_date))
    db.commit()


def department_avg_essi(db: Session, department_id: int) -> float | None:
    emps = db.query(Employee).filter(Employee.department_id == department_id).all()
    if not emps:
        return None
    eids = [e.id for e in emps]
    rows = db.query(IndexRecord).filter(IndexRecord.employee_id.in_(eids)).all()
    if not rows:
        return None
    return round(sum(r.essi for r in rows) / len(rows), 2)


def organization_avg_essi(db: Session) -> float | None:
    depts = db.query(Department).all()
    if not depts:
        return None
    avgs = []
    for d in depts:
        v = department_avg_essi(db, d.id)
        if v is not None:
            avgs.append(v)
    if not avgs:
        return None
    return round(sum(avgs) / len(avgs), 2)
