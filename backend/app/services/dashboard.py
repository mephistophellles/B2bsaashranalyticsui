from collections import defaultdict
from sqlalchemy.orm import Session

from app.models import Department, Employee, IndexRecord, Recommendation, Survey, User
from app.data.survey_methodology import METHODOLOGY_BLOCK_TITLES
from app.privacy import mask_display_name
from app.services.essi import block_scores_from_survey, essi_from_blocks, organization_avg_essi


MONTHS_RU = {
    1: "Янв",
    2: "Фев",
    3: "Мар",
    4: "Апр",
    5: "Май",
    6: "Июн",
    7: "Июл",
    8: "Авг",
    9: "Сен",
    10: "Окт",
    11: "Ноя",
    12: "Дек",
}


def _block_interpretation(value: float) -> str:
    if value >= 80:
        return "Сильная зона"
    if value >= 60:
        return "Стабильная зона"
    if value >= 40:
        return "Зона внимания"
    return "Критическая зона"


def _block_action_hint(value: float) -> str:
    if value >= 80:
        return "Удерживать практики и масштабировать успешные решения."
    if value >= 60:
        return "Провести точечные улучшения и мониторить динамику."
    if value >= 40:
        return "Запустить корректирующие меры с ответственными и сроками."
    return "Нужен срочный план действий и повторный замер в коротком цикле."


def block_metrics_from_scores(scores: list[float]) -> list[dict]:
    out: list[dict] = []
    for i, raw in enumerate(scores, start=1):
        value = max(0.0, min(100.0, (raw / 25.0) * 100.0))
        out.append(
            {
                "block_index": i,
                "title": METHODOLOGY_BLOCK_TITLES.get(i, f"Блок {i}"),
                "value": round(value, 1),
                "interpretation": _block_interpretation(value),
                "action_hint": _block_action_hint(value),
            }
        )
    return out


def latest_survey_per_employee(db: Session) -> dict[int, Survey]:
    rows = db.query(Survey).order_by(Survey.survey_date.desc(), Survey.id.desc()).all()
    out: dict[int, Survey] = {}
    for row in rows:
        if row.employee_id not in out:
            out[row.employee_id] = row
    return out


def organization_block_metrics(db: Session) -> list[dict]:
    latest = latest_survey_per_employee(db)
    if not latest:
        return []
    sums = [0.0] * 5
    count = 0
    for s in latest.values():
        vals = block_scores_from_survey(s)
        for i in range(5):
            sums[i] += vals[i]
        count += 1
    avg = [x / count for x in sums]
    return block_metrics_from_scores(avg)


def department_block_breakdown(db: Session, department_id: int) -> list[dict]:
    emps = db.query(Employee).filter(Employee.department_id == department_id).all()
    if not emps:
        return []
    latest = latest_survey_per_employee(db)
    sums = [0.0] * 5
    count = 0
    for e in emps:
        s = latest.get(e.id)
        if not s:
            continue
        vals = block_scores_from_survey(s)
        for i in range(5):
            sums[i] += vals[i]
        count += 1
    if count == 0:
        return []
    avg = [x / count for x in sums]
    return block_metrics_from_scores(avg)


def employee_block_breakdown(db: Session, employee_id: int) -> list[dict]:
    s = (
        db.query(Survey)
        .filter(Survey.employee_id == employee_id)
        .order_by(Survey.survey_date.desc(), Survey.id.desc())
        .first()
    )
    if not s:
        return []
    return block_metrics_from_scores(block_scores_from_survey(s))


def monthly_org_essi_series(db: Session, limit: int = 6) -> list[dict]:
    surveys = db.query(Survey).order_by(Survey.survey_date).all()
    by_month: dict[str, list[float]] = defaultdict(list)
    for s in surveys:
        key = s.survey_date.strftime("%Y-%m")
        by_month[key].append(essi_from_blocks(block_scores_from_survey(s)))
    keys = sorted(by_month.keys())[-limit:]
    out = []
    for k in keys:
        y, m = map(int, k.split("-"))
        vals = by_month[k]
        avg = sum(vals) / len(vals)
        out.append(
            {
                "id": k,
                "month": MONTHS_RU.get(m, k),
                "value": round(avg, 1),
            }
        )
    return out


def employee_trend(db: Session, employee_id: int) -> str:
    surveys = (
        db.query(Survey)
        .filter(Survey.employee_id == employee_id)
        .order_by(Survey.survey_date.desc())
        .limit(2)
        .all()
    )
    if len(surveys) < 2:
        return "stable"
    a = essi_from_blocks(block_scores_from_survey(surveys[0]))
    b = essi_from_blocks(block_scores_from_survey(surveys[1]))
    if a > b + 1:
        return "up"
    if a < b - 1:
        return "down"
    return "stable"


def status_from_essi(essi: float) -> str:
    """Шкала интерпретации ИСУР (методика): <40 кризис, 40–60 риск, 60–80 удовл., ≥80 высокая."""
    if essi >= 80:
        return "Высокая устойчивость"
    if essi >= 60:
        return "Удовлетворительно"
    if essi >= 40:
        return "Зона риска"
    return "Кризис"


def latest_index_record_per_employee(db: Session) -> dict[int, IndexRecord]:
    """Один актуальный снимок индекса на сотрудника (последний по calc_date)."""
    rows = (
        db.query(IndexRecord)
        .order_by(IndexRecord.calc_date.desc(), IndexRecord.id.desc())
        .all()
    )
    out: dict[int, IndexRecord] = {}
    for ir in rows:
        if ir.employee_id not in out:
            out[ir.employee_id] = ir
    return out


def organization_risk_level(at_risk_total: int, indexed: int) -> str:
    """Карточка «Уровень риска»: Низкий / Средний / Высокий / Нет данных."""
    if indexed <= 0:
        return "Нет данных"
    if at_risk_total == 0:
        return "Низкий"
    share = at_risk_total / indexed
    if at_risk_total >= 3 or share >= 0.2:
        return "Высокий"
    return "Средний"


def build_dashboard(
    db: Session,
    viewer: User | None = None,
    *,
    essi_months: int = 6,
) -> dict:
    org = organization_avg_essi(db) or 0.0
    series = monthly_org_essi_series(db, limit=max(1, essi_months))
    prev = series[-2]["value"] if len(series) >= 2 else (series[0]["value"] if series else org)
    curr = series[-1]["value"] if series else org
    essi_delta = round(((curr - prev) / prev * 100) if prev else 0.0, 1)

    latest_idx = latest_index_record_per_employee(db)

    dept_bars = []
    for d in db.query(Department).all():
        emps = db.query(Employee).filter(Employee.department_id == d.id).all()
        if not emps:
            continue
        vals = [latest_idx[e.id].essi for e in emps if e.id in latest_idx]
        if not vals:
            continue
        avg = sum(vals) / len(vals)
        dept_bars.append(
            {"id": f"dept{d.id}", "department": d.name, "essi": round(avg, 1)}
        )

    recent = []
    indices = db.query(IndexRecord).order_by(IndexRecord.calc_date.desc()).limit(20).all()
    seen = set()
    for ir in indices:
        if ir.employee_id in seen:
            continue
        seen.add(ir.employee_id)
        emp = db.query(Employee).filter(Employee.id == ir.employee_id).first()
        if not emp:
            continue
        dept = db.query(Department).filter(Department.id == emp.department_id).first()
        display_name = (
            mask_display_name(emp.id, emp.name, viewer)
            if viewer is not None
            else emp.name
        )
        recent.append(
            {
                "id": str(emp.id),
                "name": display_name,
                "department": dept.name if dept else "",
                "essi": round(ir.essi, 0),
                "trend": employee_trend(db, emp.id),
                "status": status_from_essi(ir.essi),
            }
        )
        if len(recent) >= 5:
            break

    recs = db.query(Recommendation).order_by(Recommendation.created_at.desc()).limit(3).all()
    rec_preview = [
        {
            "id": str(r.id),
            "title": r.title,
            "description": r.text[:200],
            "priority": r.priority,
            "status": r.status,
        }
        for r in recs
    ]

    risk_crisis_count = sum(1 for ir in latest_idx.values() if ir.essi < 40)
    risk_zone_count = sum(1 for ir in latest_idx.values() if 40 <= ir.essi < 60)
    risk_at_risk_total = risk_crisis_count + risk_zone_count
    risk_indexed_employees = len(latest_idx)
    risk_level = organization_risk_level(risk_at_risk_total, risk_indexed_employees)

    eng_curr = round(max(0, curr - 5) if series else max(0, org - 5), 0)
    eng_prev = round(max(0, prev - 5) if series else eng_curr, 0)
    engagement_delta = (
        round(((eng_curr - eng_prev) / eng_prev * 100), 1) if eng_prev else 0.0
    )

    prod_curr = min(100, round((curr if series else org) + 10, 0))
    prod_base = prev if len(series) >= 2 else (curr if series else org)
    prod_prev = min(100, round(prod_base + 10, 0))
    productivity_delta = (
        round(((prod_curr - prod_prev) / prod_prev * 100), 1) if prod_prev else 0.0
    )

    return {
        "essi_index": round(curr if series else org, 0),
        "essi_delta_pct": essi_delta,
        "engagement_pct": eng_curr,
        "engagement_delta_pct": engagement_delta,
        "risk_level": risk_level,
        "risk_crisis_count": risk_crisis_count,
        "risk_zone_count": risk_zone_count,
        "risk_at_risk_total": risk_at_risk_total,
        "risk_indexed_employees": risk_indexed_employees,
        "risk_employees_delta_pct": None,
        "productivity_pct": prod_curr,
        "productivity_delta_pct": productivity_delta,
        "essi_series": series if series else [{"id": "m0", "month": "—", "value": round(org, 1)}],
        "essi_blocks": organization_block_metrics(db),
        "department_bars": dept_bars,
        "recent_employees": recent,
        "recommendations_preview": rec_preview,
    }
