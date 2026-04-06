import re
from typing import Any

from app.models import Recommendation

EXPLAINABILITY_DICTIONARY_VERSION = "v1.0.0"

INTERPRETATION_DICTIONARY: dict[str, Any] = {
    "version": EXPLAINABILITY_DICTIONARY_VERSION,
    "framework": "what-why-action",
    "sources": {
        "rule": "Правила на основе текста, блоков ESSI и статических сигналов",
        "ml": "ML-сигналы паттернов динамики и факторов риска",
    },
    "block_thresholds": {
        "critical_lt": 40,
        "risk_lt": 60,
        "stable_lt": 80,
        "strong_ge": 80,
    },
    "behavioral_effects": [
        {"code": "strain", "label": "Напряжение и риск выгорания"},
        {"code": "engagement", "label": "Вовлеченность и инициативность"},
        {"code": "focus", "label": "Концентрация и стабильность выполнения"},
    ],
}


def recommendation_source(model_version: str | None) -> str:
    return "ml" if (model_version and model_version != "rules-v2") else "rules"


def recommendation_rationale(text: str) -> str:
    cleaned = text.replace("\n", " ").strip()
    if not cleaned:
        return ""
    sentences = [part.strip() for part in cleaned.split(".") if part.strip()]
    return sentences[0] if sentences else cleaned[:180]


def recommendation_expected_effect(source: str, audience: str = "manager") -> str:
    if audience == "employee":
        if source == "ml":
            return "Более устойчивый рабочий ритм и снижение персонального стресса в команде."
        return "Более понятная организация работы и снижение факторов выгорания."
    if source == "ml":
        return "Снижение доли сотрудников в зоне риска и стабилизация ESSI в ближайшие периоды."
    return "Стабилизация динамики ESSI и снижение управленческих рисков по отделу."


def explainability_dictionary() -> dict[str, Any]:
    return INTERPRETATION_DICTIONARY


def _problem_cause_action(
    *,
    text: str,
    reasons: list[dict[str, Any]],
    source: str,
    audience: str,
) -> dict[str, str]:
    top_reason = reasons[0]["label"] if reasons else "снижение устойчивости в блоках ESSI"
    top_detail = reasons[0]["detail"] if reasons else "факторы риска требуют уточнения на повторном замере"
    problem = (
        "Наблюдается риск снижения устойчивости команды."
        if audience == "manager"
        else "Есть признаки, что условия работы могут быть менее устойчивыми."
    )
    if "криз" in text.lower():
        problem = "Выраженная зона риска требует приоритетного управленческого внимания."
    cause = f"Ключевой фактор: {top_reason}. {top_detail}"
    if source == "ml":
        action = (
            "Запустить приоритетный план действий на 2-4 недели, закрепить ответственного и проверить динамику."
        )
    else:
        action = "Согласовать точечные изменения в процессах/нагрузке и выполнить контрольный замер."
    return {"problem": problem, "cause": cause, "action": action}


def _reason(
    *,
    code: str,
    label: str,
    detail: str,
    weight: float,
    source_type: str,
) -> dict[str, Any]:
    return {
        "code": code,
        "label": label,
        "detail": detail,
        "weight": max(0.0, min(1.0, round(weight, 2))),
        "source_type": source_type,
    }


def collect_rule_drivers(text: str) -> list[dict[str, Any]]:
    base_text = text.lower()
    drivers: list[dict[str, Any]] = []
    keyword_map = [
        ("выгора", "burnout", "Признаки выгорания", 0.84),
        ("нагруз", "load", "Перегрузка и ритм работы", 0.82),
        ("коммуник", "communication", "Коммуникация в команде", 0.78),
        ("конфликт", "conflict", "Конфликтные взаимодействия", 0.77),
        ("адаптац", "adaptation", "Адаптация в процессах", 0.74),
        ("лояльн", "loyalty", "Риск снижения лояльности", 0.73),
    ]
    for marker, code, label, weight in keyword_map:
        if marker in base_text:
            drivers.append(
                _reason(
                    code=f"rule_{code}",
                    label=label,
                    detail="Выявлено по правилу на основе текста рекомендации.",
                    weight=weight,
                    source_type="rule",
                )
            )
    if not drivers:
        drivers.append(
            _reason(
                code="rule_general",
                label="Падение устойчивости в одном или нескольких блоках ESSI",
                detail="Rule fallback при недостатке уточняющих факторов.",
                weight=0.7,
                source_type="rule",
            )
        )
    return drivers


def collect_ml_drivers(
    *,
    source: str,
    block_percentages: list[dict[str, Any]] | None = None,
    predicted_delta: float | None = None,
) -> list[dict[str, Any]]:
    if source != "ml":
        return []
    drivers: list[dict[str, Any]] = []
    if block_percentages:
        weakest = sorted(block_percentages, key=lambda item: float(item.get("value", 0)))[:2]
        for item in weakest:
            title = str(item.get("title") or "Блок ESSI")
            value = float(item.get("value", 0))
            drivers.append(
                _reason(
                    code=f"ml_weak_block_{item.get('block_index', 0)}",
                    label=f"Слабый блок: {title}",
                    detail=f"Низкая доля от максимума: {value:.1f}%",
                    weight=0.8,
                    source_type="ml",
                )
            )
    if predicted_delta is not None:
        drivers.append(
            _reason(
                code="ml_predicted_delta",
                label="Прогноз динамики ESSI",
                detail=f"Оценка изменения индекса на горизонте периода: {predicted_delta:+.1f} п.п.",
                weight=0.76,
                source_type="ml",
            )
        )
    if not drivers:
        drivers.append(
            _reason(
                code="ml_signal",
                label="ML-сигнал паттерна риска",
                detail="Модель обнаружила устойчивую комбинацию факторов риска.",
                weight=0.72,
                source_type="ml",
            )
        )
    return drivers


def prioritized_reasons(
    *,
    rule_drivers: list[dict[str, Any]],
    ml_drivers: list[dict[str, Any]],
    limit: int = 4,
    min_items: int = 2,
) -> list[dict[str, Any]]:
    merged = sorted([*ml_drivers, *rule_drivers], key=lambda item: float(item.get("weight", 0)), reverse=True)
    out = merged[: max(min_items, limit)]
    if len(out) < min_items:
        out.extend(rule_drivers[: max(0, min_items - len(out))])
    return out[:limit]


def recommendation_text_for_audience(recommendation: Recommendation, audience: str = "manager") -> str:
    if audience == "employee":
        return recommendation.text_employee if recommendation.text_employee else recommendation.text
    return recommendation.text


def build_recommendation_explainability(
    recommendation: Recommendation,
    *,
    audience: str = "manager",
    block_percentages: list[dict[str, Any]] | None = None,
    predicted_delta: float | None = None,
) -> dict[str, Any]:
    source = recommendation_source(recommendation.model_version)
    description = recommendation_text_for_audience(recommendation, audience=audience)
    rationale = recommendation_rationale(description)
    rule_drivers = collect_rule_drivers(description)
    ml_drivers = collect_ml_drivers(
        source=source,
        block_percentages=block_percentages,
        predicted_delta=predicted_delta,
    )
    structured = prioritized_reasons(rule_drivers=rule_drivers, ml_drivers=ml_drivers)
    pca = _problem_cause_action(
        text=description,
        reasons=structured,
        source=source,
        audience=audience,
    )
    return {
        "source": source,
        "rationale": rationale,
        "expected_effect": recommendation_expected_effect(source, audience=audience),
        "problem": pca["problem"],
        "cause": pca["cause"],
        "action": pca["action"],
        "rule_drivers": rule_drivers,
        "ml_drivers": ml_drivers,
        "structured_reasons": structured,
    }


def infer_predicted_delta_from_text(text: str) -> float | None:
    match = re.search(r"([+-]?\d+(?:[.,]\d+)?)\s*п\.п", text)
    if not match:
        return None
    raw = match.group(1).replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None
