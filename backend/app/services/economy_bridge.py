from typing import Any


def _clip_essi(essi: float) -> float:
    if essi >= 100:
        return 99.9
    if essi < 0:
        return 0.0
    return essi


def calculate_losses(
    *,
    essi_score: float,
    fot: float,
    k: float,
    c_replace: float,
    departed_count: int,
) -> dict[str, float]:
    safe_essi = _clip_essi(essi_score)
    loss_eff = (100.0 - safe_essi) * fot * k
    loss_turn = departed_count * c_replace
    return {
        "loss_efficiency": round(loss_eff, 2),
        "loss_turnover": round(loss_turn, 2),
        "loss_total": round(loss_eff + loss_turn, 2),
    }


def behavioral_effects_from_essi(essi_score: float) -> list[dict[str, Any]]:
    deficit = max(0.0, 100.0 - essi_score)
    return [
        {
            "code": "strain",
            "label": "Напряжение",
            "intensity": round(min(1.0, deficit / 55.0), 2),
            "what_it_means": "Рост напряжения увеличивает ошибки и риск выгорания.",
        },
        {
            "code": "engagement",
            "label": "Вовлеченность",
            "intensity": round(min(1.0, deficit / 75.0), 2),
            "what_it_means": "Снижение вовлеченности замедляет выполнение инициатив и задач.",
        },
        {
            "code": "focus",
            "label": "Концентрация",
            "intensity": round(min(1.0, deficit / 80.0), 2),
            "what_it_means": "Потеря концентрации влияет на качество и скорость операционной работы.",
        },
    ]


def business_impacts_from_effects(effects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_code = {str(item.get("code")): float(item.get("intensity", 0.0)) for item in effects}
    strain = by_code.get("strain", 0.0)
    engagement = by_code.get("engagement", 0.0)
    focus = by_code.get("focus", 0.0)
    return [
        {
            "metric": "productivity_loss_pct",
            "value": round((focus * 6.5 + strain * 4.5), 2),
            "driver": "Концентрация + напряжение",
        },
        {
            "metric": "attrition_risk_pct",
            "value": round((strain * 5.0 + engagement * 5.5), 2),
            "driver": "Напряжение + вовлеченность",
        },
        {
            "metric": "management_overhead_pct",
            "value": round((strain * 3.0 + engagement * 2.5), 2),
            "driver": "Рост управленческой нагрузки на поддержку процессов",
        },
    ]


def build_economy_scenario(
    *,
    essi_score: float,
    improved_essi: float,
    fot: float,
    k: float,
    c_replace: float,
    departed_count: int,
) -> dict[str, Any]:
    current = calculate_losses(
        essi_score=essi_score,
        fot=fot,
        k=k,
        c_replace=c_replace,
        departed_count=departed_count,
    )
    improved = calculate_losses(
        essi_score=improved_essi,
        fot=fot,
        k=k,
        c_replace=c_replace,
        departed_count=max(0, departed_count - 1),
    )
    effects = behavioral_effects_from_essi(essi_score)
    impacts = business_impacts_from_effects(effects)
    savings = round(current["loss_total"] - improved["loss_total"], 2)
    return {
        "current": current,
        "improved": improved,
        "savings_potential": savings,
        "behavioral_effects": effects,
        "business_impacts": impacts,
    }
