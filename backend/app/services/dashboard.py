from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from app.models import Department, Employee, IndexRecord, Recommendation, Survey
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
    if essi >= 85:
        return "Отлично"
    if essi >= 70:
        return "Хорошо"
    return "Риск"


def build_dashboard(db: Session) -> dict:
    org = organization_avg_essi(db) or 0.0
    series = monthly_org_essi_series(db)
    prev = series[-2]["value"] if len(series) >= 2 else (series[0]["value"] if series else org)
    curr = series[-1]["value"] if series else org
    essi_delta = round(((curr - prev) / prev * 100) if prev else 0.0, 1)

    dept_bars = []
    for d in db.query(Department).all():
        emps = db.query(Employee).filter(Employee.department_id == d.id).all()
        if not emps:
            continue
        idxs = db.query(IndexRecord).filter(IndexRecord.employee_id.in_([e.id for e in emps])).all()
        if not idxs:
            continue
        avg = sum(i.essi for i in idxs) / len(idxs)
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
        recent.append(
            {
                "id": str(emp.id),
                "name": emp.name,
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

    risk_count = sum(1 for r in recent if r["status"] == "Риск")
    risk_delta = -12.0  # placeholder trend vs mock UI

    return {
        "essi_index": round(curr if series else org, 0),
        "essi_delta_pct": essi_delta,
        "engagement_pct": round(max(0, curr - 5) if series else 78, 0),
        "engagement_delta_pct": 2.8,
        "risk_level": "Низкий" if risk_count < 2 else "Средний",
        "risk_employees_delta_pct": risk_delta,
        "productivity_pct": min(100, round((curr if series else org) + 10, 0)),
        "productivity_delta_pct": 3.5,
        "essi_series": series if series else [{"id": "m0", "month": "—", "value": round(org, 1)}],
        "department_bars": dept_bars,
        "recent_employees": recent,
        "recommendations_preview": rec_preview,
    }
