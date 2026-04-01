from __future__ import annotations

from collections import defaultdict

from app.data.survey_methodology import METHODOLOGY_BLOCK_TITLES
from app.ml.types import DepartmentRiskSummary, InferenceEmployeeResult, RecommendationDraft


def _priority(high_risk_share: float, avg_predicted_delta: float) -> str:
    if high_risk_share >= 0.35 or avg_predicted_delta <= -8.0:
        return "high"
    if high_risk_share >= 0.15 or avg_predicted_delta < -3.0:
        return "medium"
    return "low"


def aggregate_department_risks(
    employee_results: list[InferenceEmployeeResult],
    department_names: dict[int, str],
) -> list[DepartmentRiskSummary]:
    grouped: dict[int, list[InferenceEmployeeResult]] = defaultdict(list)
    for row in employee_results:
        grouped[row.department_id].append(row)

    summaries: list[DepartmentRiskSummary] = []
    for department_id, rows in sorted(grouped.items()):
        employee_count = len(rows)
        high_risk_count = sum(1 for row in rows if row.risk_band == "high")
        medium_risk_count = sum(1 for row in rows if row.risk_band == "medium")
        low_risk_count = sum(1 for row in rows if row.risk_band == "low")
        avg_predicted_delta = round(
            sum(row.predicted_delta_next_essi for row in rows) / employee_count,
            2,
        )
        high_risk_share = round(high_risk_count / employee_count, 4) if employee_count else 0.0

        avg_block_pcts = {
            1: sum(row.block1_pct for row in rows) / employee_count,
            2: sum(row.block2_pct for row in rows) / employee_count,
            3: sum(row.block3_pct for row in rows) / employee_count,
            4: sum(row.block4_pct for row in rows) / employee_count,
            5: sum(row.block5_pct for row in rows) / employee_count,
        }
        weakest_block_indices = tuple(
            block_index
            for block_index, _ in sorted(avg_block_pcts.items(), key=lambda item: (item[1], item[0]))[:2]
        )
        summaries.append(
            DepartmentRiskSummary(
                department_id=department_id,
                department_name=department_names.get(department_id, f"Отдел {department_id}"),
                employee_count=employee_count,
                high_risk_count=high_risk_count,
                medium_risk_count=medium_risk_count,
                low_risk_count=low_risk_count,
                high_risk_share=high_risk_share,
                avg_predicted_delta=avg_predicted_delta,
                weakest_block_indices=weakest_block_indices,
            )
        )
    return summaries


def _weakest_blocks_text(block_indices: tuple[int, ...]) -> str:
    if not block_indices:
        return "без явно выраженного слабого блока"
    names = [METHODOLOGY_BLOCK_TITLES[idx] for idx in block_indices]
    return ", ".join(names)


def _manager_text(summary: DepartmentRiskSummary) -> str:
    weakest = _weakest_blocks_text(summary.weakest_block_indices)
    high_share_pct = round(summary.high_risk_share * 100, 1)
    priority = _priority(summary.high_risk_share, summary.avg_predicted_delta)
    if priority == "high":
        return (
            f"ML-модель прогнозирует повышенный риск снижения ESSI по отделу «{summary.department_name}».\n"
            f"Ожидаемое среднее изменение ESSI на следующий период: {summary.avg_predicted_delta:.2f} п.п.\n"
            f"Сотрудников в high-risk: {summary.high_risk_count} из {summary.employee_count} ({high_share_pct}%).\n"
            f"Наиболее слабые блоки по отделу: {weakest}.\n\n"
            "Рекомендуемые действия на ближайшие 2–4 недели:\n"
            "• Приоритизировать short-list сотрудников из high-risk для коротких 1:1 и проверки нагрузки.\n"
            "• Сфокусировать управленческие действия на двух самых слабых блоках отдела.\n"
            "• Зафиксировать ответственных и повторно оценить динамику после следующего цикла опроса."
        )
    if priority == "medium":
        return (
            f"ML-модель видит умеренный риск снижения ESSI по отделу «{summary.department_name}».\n"
            f"Ожидаемое среднее изменение ESSI на следующий период: {summary.avg_predicted_delta:.2f} п.п.\n"
            f"High-risk сотрудников: {summary.high_risk_count} из {summary.employee_count}.\n"
            f"Зоны внимания по блокам: {weakest}.\n\n"
            "Рекомендуемые действия:\n"
            "• Усилить регулярную обратную связь и убрать явные организационные фрикции.\n"
            "• Проверить, где именно проседают два weakest blocks, и обсудить это на встрече отдела.\n"
            "• Повторно сверить динамику после следующего периода."
        )
    return (
        f"ML-модель не показывает существенного риска ухудшения ESSI по отделу «{summary.department_name}».\n"
        f"Ожидаемое среднее изменение ESSI на следующий период: {summary.avg_predicted_delta:.2f} п.п.\n"
        f"Наиболее слабые блоки для профилактического внимания: {weakest}.\n\n"
        "Рекомендуемые действия:\n"
        "• Сохранить текущие практики поддержки команды.\n"
        "• Точечно мониторить weakest blocks без лишнего давления на команду.\n"
        "• Использовать следующий цикл опроса как контроль устойчивости."
    )


def _employee_text(summary: DepartmentRiskSummary) -> str:
    weakest = _weakest_blocks_text(summary.weakest_block_indices)
    priority = _priority(summary.high_risk_share, summary.avg_predicted_delta)
    if priority == "high":
        return (
            f"По отделу «{summary.department_name}» модель видит риск ухудшения общего ESSI в следующем периоде. "
            f"Это не личная оценка сотрудника, а командный сигнал внимания.\n\n"
            f"Что важно сейчас: слабые зоны команды — {weakest}. "
            "Если мешают перегрузка, неясные ожидания или нехватка поддержки, это стоит проговорить."
        )
    if priority == "medium":
        return (
            f"По отделу «{summary.department_name}» есть умеренный риск снижения ESSI в следующем периоде.\n\n"
            f"Командные зоны внимания: {weakest}. "
            "Полезно заранее синхронизировать ожидания, нагрузку и обратную связь."
        )
    return (
        f"По отделу «{summary.department_name}» существенного риска ухудшения ESSI модель не видит.\n\n"
        f"Для профилактики стоит держать в фокусе блоки: {weakest}."
    )


def build_recommendation_drafts(
    summaries: list[DepartmentRiskSummary],
    *,
    model_version: str,
) -> list[RecommendationDraft]:
    drafts: list[RecommendationDraft] = []
    for summary in summaries:
        priority = _priority(summary.high_risk_share, summary.avg_predicted_delta)
        risk_label = {
            "high": "высокий риск снижения ESSI",
            "medium": "умеренный риск снижения ESSI",
            "low": "низкий риск снижения ESSI",
        }[priority]
        drafts.append(
            RecommendationDraft(
                department_id=summary.department_id,
                title=f"ML-прогноз: {risk_label} в «{summary.department_name}»",
                text=_manager_text(summary),
                text_employee=_employee_text(summary),
                priority=priority,
                model_version=model_version,
            )
        )
    return drafts
