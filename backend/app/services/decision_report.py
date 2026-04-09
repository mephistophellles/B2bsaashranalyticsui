from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Employee, IndexRecord, OrganizationSettings, Recommendation
from app.schemas import DecisionReportPayload
from app.services.dashboard import build_dashboard
from app.services.economy_bridge import (
    behavioral_effects_from_essi,
    build_economy_scenario,
    business_impacts_from_effects,
    calculate_losses,
)
from app.services.explainability import (
    build_recommendation_explainability,
    infer_predicted_delta_from_text,
)


def _org_settings(db: Session) -> OrganizationSettings:
    row = db.query(OrganizationSettings).filter(OrganizationSettings.id == 1).first()
    if not row:
        row = OrganizationSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _safe_economy(
    *,
    essi_score: float,
    fot: float | None,
    k: float | None,
    c_replace: float | None,
    departed_count: int | None,
) -> dict[str, Any]:
    if fot is None or k is None or c_replace is None or departed_count is None:
        return {
            "loss_efficiency": None,
            "loss_turnover": None,
            "loss_total": None,
        }
    return calculate_losses(
        essi_score=essi_score,
        fot=fot,
        k=k,
        c_replace=c_replace,
        departed_count=departed_count,
    )


def _top_risk_employees(db: Session, limit: int = 5) -> list[dict[str, Any]]:
    latest_rows = (
        db.query(IndexRecord)
        .order_by(IndexRecord.calc_date.desc(), IndexRecord.id.desc())
        .all()
    )
    by_employee: dict[int, IndexRecord] = {}
    for row in latest_rows:
        if row.employee_id not in by_employee:
            by_employee[row.employee_id] = row
    ordered = sorted(by_employee.values(), key=lambda row: row.essi)[:limit]
    out: list[dict[str, Any]] = []
    for row in ordered:
        emp = db.query(Employee).filter(Employee.id == row.employee_id).first()
        if not emp:
            continue
        out.append(
            {
                "id": str(emp.id),
                "name": emp.name,
                "department": emp.department.name if emp.department else "",
                "essi": round(row.essi, 1),
                "status": (
                    "Кризис"
                    if row.essi < 40
                    else "Зона риска"
                    if row.essi < 60
                    else "Удовлетворительно"
                    if row.essi < 80
                    else "Высокая устойчивость"
                ),
                "what_it_means": (
                    "Требуется срочное управленческое вмешательство."
                    if row.essi < 40
                    else "Требует управленческого внимания."
                    if row.essi < 60
                    else "Состояние приемлемое, но требует мониторинга."
                ),
                "reason_text": (
                    "Наблюдается негативная динамика по интегральному индексу."
                    if row.essi < 40
                    else "Снижение показателя связано с текущими изменениями условий."
                    if row.essi < 60
                    else "Наблюдается устойчивый профиль; влияние факторов умеренное."
                ),
                "actions": (
                    "При отсутствии действий возможен рост рисков; согласовать план поддержки и контрольный замер."
                    if row.essi < 60
                    else "Сохранить практики и провести контрольный замер."
                ),
            }
        )
    return out


def build_decision_report(db: Session, *, months: int = 6) -> dict[str, Any]:
    dashboard = build_dashboard(db, viewer=None, essi_months=max(3, months))
    block_percentages = dashboard.get("block_percentages", [])
    strongest = sorted(block_percentages, key=lambda item: item.get("value", 0), reverse=True)[:3]

    rec_rows = (
        db.query(Recommendation)
        .order_by(Recommendation.created_at.desc(), Recommendation.id.desc())
        .limit(8)
        .all()
    )
    cause_rows: list[dict[str, Any]] = []
    recommendation_rows: list[dict[str, Any]] = []
    for rec in rec_rows:
        explain = build_recommendation_explainability(
            rec,
            audience="manager",
            block_percentages=block_percentages,
            predicted_delta=infer_predicted_delta_from_text(rec.text),
        )
        cause_rows.append(
            {
                "title": rec.title,
                "source": explain["source"],
                "reasons": explain["structured_reasons"][:4],
                "what_it_means": "Система выявляет факторы, которые оказывают наибольшее влияние на результат.",
                "reason_text": (
                    explain["structured_reasons"][0]["detail"]
                    if explain["structured_reasons"]
                    else "Недостаточно факторов, использован rule fallback."
                ),
                "actions": "Рекомендуется выполнить действия, направленные на стабилизацию состояния и снижение рисков.",
            }
        )
        recommendation_rows.append(
            {
                "id": rec.id,
                "title": rec.title,
                "description": rec.text,
                "priority": rec.priority,
                "status": rec.status,
                "source": explain["source"],
                "expected_effect": explain["expected_effect"],
                "structured_reasons": explain["structured_reasons"][:4],
                "what_it_means": "Рекомендации направлены на улучшение состояния.",
                "reason_text": (
                    explain["structured_reasons"][0]["detail"]
                    if explain["structured_reasons"]
                    else "Рекомендация основана на базовых правилах."
                ),
                "actions": "Назначить ответственного, срок и метрику проверки; результат оценить через повторную диагностику.",
            }
        )

    org = _org_settings(db)
    essi_score = float(dashboard.get("essi_index", 0.0))
    economy = _safe_economy(
        essi_score=essi_score,
        fot=org.default_fot,
        k=org.default_k,
        c_replace=org.default_c_replace,
        departed_count=org.default_departed_count,
    )
    assumptions = [
        "Потери эффективности = ФОТ × k × (100 - ESSI).",
        "Потери текучести = C_replace × число ушедших.",
        "Итог = потери эффективности + потери текучести.",
    ]
    if economy["loss_total"] is None:
        assumptions.append(
            "Для расчета итогов нужны черновики ФОТ, k, C_replace и ушедшие (страница Отчеты)."
        )

    series = dashboard.get("essi_series", [])
    latest = float(series[-1]["value"]) if series else float(essi_score)
    previous = float(series[-2]["value"]) if len(series) >= 2 else latest
    behavioral_effects = behavioral_effects_from_essi(essi_score)
    business_impacts = business_impacts_from_effects(behavioral_effects)
    scenario = None
    if (
        org.default_fot is not None
        and org.default_k is not None
        and org.default_c_replace is not None
        and org.default_departed_count is not None
    ):
        scenario = build_economy_scenario(
            essi_score=essi_score,
            improved_essi=min(100.0, essi_score + 7.5),
            fot=org.default_fot,
            k=org.default_k,
            c_replace=org.default_c_replace,
            departed_count=org.default_departed_count,
        )
    payload = {
        "generated_at": datetime.utcnow(),
        "months": max(3, months),
        "overview": {
            "essi_index": essi_score,
            "essi_delta_pct": float(dashboard.get("essi_delta_pct", 0.0)),
            "engagement_pct": float(dashboard.get("engagement_pct", 0.0)),
            "productivity_pct": float(dashboard.get("productivity_pct", 0.0)),
            "risk_level": dashboard.get("risk_level", "Нет данных"),
            "risk_at_risk_total": int(dashboard.get("risk_at_risk_total", 0)),
            "risk_indexed_employees": int(dashboard.get("risk_indexed_employees", 0)),
            "summary": [
                f"Текущий ESSI: {essi_score:.1f}. Выводы основаны на совокупности факторов и анализе динамики.",
                f"В зоне риска по методике: {int(dashboard.get('risk_at_risk_total', 0))} сотрудников.",
                "Выявлены зоны, требующие внимания; рекомендуется стабилизация состояния и приоритетные действия.",
            ],
        },
        "dynamics": {
            "months": max(3, months),
            "essi_series": series,
            "latest_value": latest,
            "previous_value": previous,
            "delta_pct": float(dashboard.get("essi_delta_pct", 0.0)),
        },
        "strengths": [
            {
                "block_index": int(item.get("block_index", 0)),
                "title": str(item.get("title", "")),
                "value": float(item.get("value", 0.0)),
                "note": "Сильные стороны поддерживают устойчивость команды.",
                "what_it_means": "Сильные стороны создают устойчивую основу для работы и поддерживают стабильность.",
                "reason_text": "Стабильные показатели создают основу для эффективной работы.",
                "actions": "Эти факторы можно использовать как точки опоры для дальнейшего развития.",
            }
            for item in strongest
        ],
        "risk_zones": _top_risk_employees(db, limit=5),
        "causes": cause_rows[:6],
        "recommendations": recommendation_rows[:6],
        "economic_effect": {
            "essi_score": essi_score,
            "fot": org.default_fot,
            "k": org.default_k,
            "c_replace": org.default_c_replace,
            "departed_count": org.default_departed_count,
            "loss_efficiency": economy["loss_efficiency"],
            "loss_turnover": economy["loss_turnover"],
            "loss_total": economy["loss_total"],
            "behavioral_effects": behavioral_effects,
            "business_impacts": business_impacts,
            "scenario": scenario,
            "assumptions": assumptions,
        },
    }
    return DecisionReportPayload.model_validate(payload).model_dump(mode="json")
