import logging
import os
import tempfile
from datetime import date, datetime

import pandas as pd
from sqlalchemy.orm import Session

from app.data.survey_methodology import METHODOLOGY_BLOCK_TITLES
from app.database import SessionLocal
from app.models import Job, JobStatus, Notification, ReportExport, Survey
from app.services.campaign_survey import (
    ALREADY_DONE,
    CampaignSurveyValidationError,
    validate_campaign_survey_row,
)
from app.services.essi import block_percentage, recompute_indices, validate_block_sum
from app.services.recommendations_engine import generate_recommendations

log = logging.getLogger(__name__)

IMPORT_ALIASES = {
    "date": "survey_date",
    "block_o": "score_block1",
    "block_s": "score_block2",
    "block_m": "score_block3",
    "block_j": "score_block4",
    "block_w": "score_block5",
}
REQUIRED_IMPORT_COLUMNS = [
    "employee_id",
    "survey_date",
    "score_block1",
    "score_block2",
    "score_block3",
    "score_block4",
    "score_block5",
]


def _db() -> Session:
    return SessionLocal()


def _read_import_df(file_path: str) -> pd.DataFrame:
    ext = os.path.splitext(file_path)[1].lower()
    if ext in (".xlsx", ".xls"):
        return pd.read_excel(file_path)
    return pd.read_csv(file_path)


def _normalize_import_df(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy()
    for alias, canonical in IMPORT_ALIASES.items():
        if alias not in work.columns:
            continue
        if canonical in work.columns:
            left = work[canonical]
            right = work[alias]
            if canonical == "survey_date":
                left_cmp = pd.to_datetime(left, errors="coerce")
                right_cmp = pd.to_datetime(right, errors="coerce")
            else:
                left_cmp = pd.to_numeric(left, errors="coerce")
                right_cmp = pd.to_numeric(right, errors="coerce")
            mismatch = (left_cmp != right_cmp) & ~(left_cmp.isna() & right_cmp.isna())
            if mismatch.any():
                raise ValueError(f"Конфликт колонок: {canonical} и {alias} содержат разные значения")
        else:
            work[canonical] = work[alias]

    for column in REQUIRED_IMPORT_COLUMNS:
        if column not in work.columns:
            raise ValueError(f"Отсутствует колонка: {column}")

    normalized = work[REQUIRED_IMPORT_COLUMNS].copy()
    normalized["employee_id"] = pd.to_numeric(normalized["employee_id"], errors="coerce")
    normalized["survey_date"] = pd.to_datetime(normalized["survey_date"], errors="coerce")
    for column in REQUIRED_IMPORT_COLUMNS[2:]:
        normalized[column] = pd.to_numeric(normalized[column], errors="coerce")

    for idx, row in normalized.iterrows():
        row_no = idx + 2
        if pd.isna(row["employee_id"]):
            raise ValueError(f"Строка {row_no}: employee_id должен быть целым числом")
        if int(row["employee_id"]) != float(row["employee_id"]):
            raise ValueError(f"Строка {row_no}: employee_id должен быть целым числом")
        if pd.isna(row["survey_date"]):
            raise ValueError(f"Строка {row_no}: survey_date содержит некорректную дату")
        for block_idx, column in enumerate(REQUIRED_IMPORT_COLUMNS[2:], start=1):
            value = row[column]
            if pd.isna(value):
                raise ValueError(f"Строка {row_no}: {column} должен быть числом в диапазоне 5..25")
            try:
                validate_block_sum(float(value), block_index=block_idx)
            except ValueError as exc:
                raise ValueError(f"Строка {row_no}: {exc}") from exc

    normalized["employee_id"] = normalized["employee_id"].astype(int)
    normalized["survey_date"] = normalized["survey_date"].dt.date
    return normalized


def parse_and_validate_survey_import_file(
    file_path: str,
    *,
    db: Session | None = None,
    campaign_id: int | None = None,
) -> pd.DataFrame:
    normalized = _normalize_import_df(_read_import_df(file_path))
    if db is None:
        return normalized

    seen_campaign_pairs: set[tuple[int, int]] = set()
    for idx, row in normalized.iterrows():
        sid = int(row["employee_id"])
        sdate = row["survey_date"]
        if campaign_id is not None:
            pair = (sid, campaign_id)
            if pair in seen_campaign_pairs:
                raise CampaignSurveyValidationError(
                    f"Строка {idx + 2}, employee_id={sid}, survey_date={sdate}: {ALREADY_DONE}"
                )
            seen_campaign_pairs.add(pair)
        try:
            validate_campaign_survey_row(
                db,
                campaign_id,
                sdate,
                sid,
                enforce_duplicate_check=(campaign_id is not None),
            )
        except CampaignSurveyValidationError as exc:
            raise CampaignSurveyValidationError(
                f"Строка {idx + 2}, employee_id={sid}, survey_date={sdate}: {exc}"
            ) from exc
    return normalized


def _register_pdf_font() -> str:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    font_name = "PotenkorCyr"
    font_candidates = [
        os.getenv("REPORT_FONT_PATH"),
        r"C:\Windows\Fonts\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    ]
    font_path = next((p for p in font_candidates if p and os.path.isfile(p)), None)
    if not font_path:
        raise RuntimeError(
            "Не найден шрифт с поддержкой кириллицы для PDF. "
            "Укажите REPORT_FONT_PATH или установите DejaVuSans/Arial."
        )
    if font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font_name, font_path))
    return font_name


def _render_decision_pdf(path_pdf: str, decision: dict) -> None:
    from xml.sax.saxutils import escape

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    font_name = _register_pdf_font()
    doc = SimpleDocTemplate(
        path_pdf,
        pagesize=A4,
        leftMargin=34,
        rightMargin=34,
        topMargin=40,
        bottomMargin=38,
        title="Потенкор Decision-report",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ExecTitle",
        parent=styles["Title"],
        fontName=font_name,
        fontSize=20,
        leading=24,
        spaceAfter=10,
    )
    subtitle_style = ParagraphStyle(
        "ExecSubTitle",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#475569"),
    )
    section_style = ParagraphStyle(
        "ExecSection",
        parent=styles["Heading2"],
        fontName=font_name,
        fontSize=13,
        leading=16,
        spaceBefore=8,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "ExecBody",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=10,
        leading=13,
    )
    header_cell_style = ParagraphStyle(
        "ExecHeaderCell",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0F172A"),
        wordWrap="CJK",
    )
    body_cell_style = ParagraphStyle(
        "ExecBodyCell",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#1F2937"),
        wordWrap="CJK",
    )

    def key_value_table(rows: list[list[object]], col_widths: list[int] | None = None) -> Table:
        styled_rows: list[list[object]] = []
        for ridx, row in enumerate(rows):
            row_cells: list[object] = []
            for cell in row:
                safe_text = escape("—" if cell is None or cell == "" else str(cell))
                row_cells.append(
                    Paragraph(
                        safe_text,
                        header_cell_style if ridx == 0 else body_cell_style,
                    )
                )
            styled_rows.append(row_cells)
        table = Table(
            styled_rows,
            colWidths=col_widths,
            repeatRows=1,
            hAlign="LEFT",
            splitByRow=1,
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                    ("ALIGN", (0, 0), (-1, 0), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        return table

    def as_text(value: object) -> str:
        return "—" if value is None or value == "" else str(value)

    story = [
        Paragraph("ПОТЕНКОР", title_style),
        Paragraph("Decision-report для управленческих решений", subtitle_style),
        Spacer(1, 12),
        Paragraph(f"Сформировано: {as_text(decision.get('generated_at'))}", body_style),
        Paragraph(f"Период анализа: {as_text(decision.get('months'))} мес.", body_style),
        Spacer(1, 10),
        Paragraph("Executive summary", section_style),
    ]
    for item in decision.get("overview", {}).get("summary", []):
        story.append(Paragraph(f"- {item}", body_style))
    story.append(PageBreak())

    story.append(Paragraph("Оглавление", section_style))
    toc_items = [
        "1. Общая ситуация",
        "2. Динамика",
        "3. Сильные стороны",
        "4. Зоны риска",
        "5. Причины",
        "6. Рекомендации",
        "7. Экономический эффект",
    ]
    for item in toc_items:
        story.append(Paragraph(item, body_style))
    story.append(PageBreak())

    overview = decision.get("overview", {})
    story.append(Paragraph("1) Общая ситуация", section_style))
    story.append(
        key_value_table(
            [
                ["Метрика", "Значение"],
                ["ESSI", as_text(overview.get("essi_index"))],
                ["Дельта ESSI, %", as_text(overview.get("essi_delta_pct"))],
                ["Вовлеченность, %", as_text(overview.get("engagement_pct"))],
                ["Продуктивность, %", as_text(overview.get("productivity_pct"))],
                ["Уровень риска", as_text(overview.get("risk_level"))],
                ["Сотрудников в зоне риска", as_text(overview.get("risk_at_risk_total"))],
            ],
            col_widths=[220, 280],
        )
    )
    story.append(Spacer(1, 8))

    dynamics = decision.get("dynamics", {})
    story.append(Paragraph("2) Динамика", section_style))
    story.append(
        Paragraph(
            (
                f"Период: {as_text(dynamics.get('months'))} мес.; "
                f"текущее значение: {as_text(dynamics.get('latest_value'))}; "
                f"предыдущее: {as_text(dynamics.get('previous_value'))}; "
                f"дельта: {as_text(dynamics.get('delta_pct'))}%."
            ),
            body_style,
        )
    )
    series_rows = [["Месяц", "ESSI"]]
    for point in dynamics.get("essi_series", []):
        series_rows.append([as_text(point.get("month")), as_text(point.get("value"))])
    story.append(Spacer(1, 5))
    story.append(key_value_table(series_rows, col_widths=[240, 120]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("3) Сильные стороны", section_style))
    strengths_rows = [["Блок", "Значение", "Что означает", "Причина", "Действия"]]
    for row in decision.get("strengths", []):
        strengths_rows.append(
            [
                as_text(row.get("title")),
                as_text(row.get("value")),
                as_text(row.get("what_it_means")),
                as_text(row.get("reason_text")),
                as_text(row.get("actions")),
            ]
        )
    story.append(key_value_table(strengths_rows, col_widths=[95, 52, 118, 118, 117]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("4) Зоны риска", section_style))
    risk_rows = [["Сотрудник", "Отдел", "ESSI", "Статус", "Что означает", "Причина", "Действия"]]
    for row in decision.get("risk_zones", []):
        risk_rows.append(
            [
                as_text(row.get("name")),
                as_text(row.get("department")),
                as_text(row.get("essi")),
                as_text(row.get("status")),
                as_text(row.get("what_it_means")),
                as_text(row.get("reason_text")),
                as_text(row.get("actions")),
            ]
        )
    story.append(key_value_table(risk_rows, col_widths=[65, 60, 35, 50, 94, 94, 102]))
    story.append(PageBreak())

    story.append(Paragraph("5) Причины", section_style))
    cause_rows = [["Кейс", "Источник", "Фактор", "Что означает", "Причина", "Действия"]]
    for item in decision.get("causes", [])[:6]:
        reasons = item.get("reasons", [])[:3]
        if not reasons:
            cause_rows.append(
                [
                    as_text(item.get("title")),
                    as_text(item.get("source")),
                    "—",
                    as_text(item.get("what_it_means")),
                    as_text(item.get("reason_text")),
                    as_text(item.get("actions")),
                ]
            )
            continue
        for idx, reason in enumerate(reasons):
            cause_rows.append(
                [
                    as_text(item.get("title")) if idx == 0 else "",
                    as_text(item.get("source")) if idx == 0 else "",
                    as_text(reason.get("label")),
                    as_text(item.get("what_it_means")) if idx == 0 else "",
                    as_text(item.get("reason_text")) if idx == 0 else "",
                    as_text(item.get("actions")) if idx == 0 else "",
                ]
            )
    story.append(key_value_table(cause_rows, col_widths=[90, 45, 70, 95, 95, 111]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("6) Рекомендации", section_style))
    rec_rows = [["Рекомендация", "Приоритет", "Статус", "Что означает", "Причина", "Действия"]]
    for row in decision.get("recommendations", [])[:8]:
        rec_rows.append(
            [
                as_text(row.get("title")),
                as_text(row.get("priority")),
                as_text(row.get("status")),
                as_text(row.get("what_it_means")),
                as_text(row.get("reason_text")),
                as_text(row.get("actions")),
            ]
        )
    story.append(key_value_table(rec_rows, col_widths=[95, 50, 50, 96, 96, 119]))
    story.append(Spacer(1, 8))

    eco = decision.get("economic_effect", {})
    story.append(Paragraph("7) Экономический эффект", section_style))
    story.append(
        key_value_table(
            [
                ["Метрика", "Значение"],
                ["ESSI", as_text(eco.get("essi_score"))],
                ["ФОТ", as_text(eco.get("fot"))],
                ["k", as_text(eco.get("k"))],
                ["C_replace", as_text(eco.get("c_replace"))],
                ["Ушедших", as_text(eco.get("departed_count"))],
                ["Потери эффективности", as_text(eco.get("loss_efficiency"))],
                ["Потери текучести", as_text(eco.get("loss_turnover"))],
                ["Итого потерь", as_text(eco.get("loss_total"))],
            ],
            col_widths=[220, 280],
        )
    )
    story.append(Spacer(1, 6))
    scenario = eco.get("scenario") or {}
    if scenario:
        story.append(
            Paragraph(
                "Сценарий current vs improved: "
                f"текущие потери {as_text((scenario.get('current') or {}).get('loss_total'))}, "
                f"улучшенный сценарий {as_text((scenario.get('improved') or {}).get('loss_total'))}, "
                f"потенциал экономии {as_text(scenario.get('savings_potential'))}.",
                body_style,
            )
        )
        story.append(Spacer(1, 4))
    effects = eco.get("behavioral_effects", [])
    if effects:
        effect_rows = [["Поведенческий эффект", "Интенсивность", "Что означает"]]
        for item in effects:
            effect_rows.append(
                [
                    as_text(item.get("label")),
                    as_text(item.get("intensity")),
                    as_text(item.get("what_it_means")),
                ]
            )
        story.append(key_value_table(effect_rows, col_widths=[140, 80, 280]))
        story.append(Spacer(1, 4))
    impacts = eco.get("business_impacts", [])
    if impacts:
        impact_rows = [["Метрика бизнеса", "Влияние", "Драйвер"]]
        for item in impacts:
            impact_rows.append(
                [
                    as_text(item.get("metric")),
                    as_text(item.get("value")),
                    as_text(item.get("driver")),
                ]
            )
        story.append(key_value_table(impact_rows, col_widths=[140, 80, 280]))
        story.append(Spacer(1, 4))
    for item in eco.get("assumptions", []):
        story.append(Paragraph(f"- {item}", body_style))

    def draw_footer(canvas_obj, doc_obj) -> None:
        canvas_obj.saveState()
        canvas_obj.setFont(font_name, 8)
        canvas_obj.setFillColor(colors.HexColor("#64748B"))
        canvas_obj.drawString(34, 20, "ПОТЕНКОР · Decision-report")
        canvas_obj.drawRightString(A4[0] - 34, 20, f"Стр. {doc_obj.page}")
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)


def process_survey_import(
    job_id: int,
    file_path: str,
    notify_user_id: int | None = None,
    campaign_id: int | None = None,
) -> None:
    db = _db()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            log.warning("survey_import job_id=%s: job not found", job_id)
            return
        log.info(
            "survey_import job_id=%s started campaign_id=%s",
            job_id,
            campaign_id,
        )
        job.status = JobStatus.running
        db.commit()

        df = parse_and_validate_survey_import_file(file_path, db=db, campaign_id=campaign_id)

        for _, row in df.iterrows():
            sid = int(row["employee_id"])
            sdate = row["survey_date"]
            db.add(
                Survey(
                    employee_id=sid,
                    survey_date=sdate,
                    score_block1=float(row["score_block1"]),
                    score_block2=float(row["score_block2"]),
                    score_block3=float(row["score_block3"]),
                    score_block4=float(row["score_block4"]),
                    score_block5=float(row["score_block5"]),
                    source="import",
                    campaign_id=campaign_id,
                )
            )
        db.commit()

        recompute_indices(db, date.today())
        generate_recommendations(db)

        job.status = JobStatus.success
        job.detail = f"Imported {len(df)} rows"
        job.finished_at = datetime.utcnow()
        db.commit()
        log.info("survey_import job_id=%s success detail=%s", job_id, job.detail)
        if notify_user_id:
            db.add(
                Notification(
                    user_id=notify_user_id,
                    title="Импорт опросов завершён",
                    body=job.detail,
                )
            )
            db.commit()
    except Exception as e:
        log.exception("survey_import job_id=%s failed", job_id)
        db.rollback()
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = JobStatus.failed
            job.detail = str(e)
            job.finished_at = datetime.utcnow()
            db.commit()
        if notify_user_id:
            db.add(
                Notification(
                    user_id=notify_user_id,
                    title="Ошибка импорта опросов",
                    body=str(e)[:500],
                )
            )
            db.commit()
    finally:
        db.close()
        if os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass


def run_report_export(report_id: int) -> None:
    db = _db()
    try:
        rep = db.query(ReportExport).filter(ReportExport.id == report_id).first()
        if not rep:
            log.warning("report_export report_id=%s: not found", report_id)
            return
        log.info(
            "report_export report_id=%s kind=%s started",
            report_id,
            rep.kind,
        )
        rep.status = JobStatus.running
        db.commit()

        tmpdir = os.path.join(tempfile.gettempdir(), "potential_reports")
        os.makedirs(tmpdir, exist_ok=True)

        from app.services.decision_report import build_decision_report

        decision = build_decision_report(db, months=6)
        kind = rep.kind or "summary"
        want_excel = kind in ("summary_excel", "excel", "decision_excel")
        if want_excel:
            path_xlsx = os.path.join(tmpdir, f"report_{report_id}.xlsx")
            with pd.ExcelWriter(path_xlsx, engine="openpyxl") as writer:
                pd.DataFrame(
                    [
                        {"Показатель": "ESSI", "Значение": decision["overview"]["essi_index"]},
                        {"Показатель": "Дельта ESSI, %", "Значение": decision["overview"]["essi_delta_pct"]},
                        {"Показатель": "Уровень риска", "Значение": decision["overview"]["risk_level"]},
                        {"Показатель": "В зоне риска", "Значение": decision["overview"]["risk_at_risk_total"]},
                    ]
                ).to_excel(writer, sheet_name="Overview", index=False)
                pd.DataFrame(decision["dynamics"]["essi_series"]).to_excel(
                    writer, sheet_name="Dynamics", index=False
                )
                pd.DataFrame(decision["strengths"]).to_excel(writer, sheet_name="Strengths", index=False)
                pd.DataFrame(decision["risk_zones"]).to_excel(writer, sheet_name="RiskZones", index=False)
                cause_rows = []
                for item in decision["causes"]:
                    for reason in item.get("reasons", []):
                        cause_rows.append(
                            {
                                "Причина для": item["title"],
                                "Источник": item["source"],
                                "Фактор": reason.get("label"),
                                "Деталь": reason.get("detail"),
                                "Вес": reason.get("weight"),
                                "Что означает": item.get("what_it_means") or "—",
                                "Причина": item.get("reason_text") or "—",
                                "Действия": item.get("actions") or "—",
                            }
                        )
                    if not item.get("reasons"):
                        cause_rows.append(
                            {
                                "Причина для": item["title"],
                                "Источник": item["source"],
                                "Фактор": "—",
                                "Деталь": "—",
                                "Вес": "—",
                                "Что означает": item.get("what_it_means") or "—",
                                "Причина": item.get("reason_text") or "—",
                                "Действия": item.get("actions") or "—",
                            }
                        )
                pd.DataFrame(cause_rows).to_excel(writer, sheet_name="Causes", index=False)
                rec_rows = []
                for item in decision["recommendations"]:
                    rec_rows.append(
                        {
                            "ID": item["id"],
                            "Рекомендация": item["title"],
                            "Приоритет": item["priority"],
                            "Статус": item["status"],
                            "Источник": item.get("source"),
                            "Ожидаемый эффект": item.get("expected_effect"),
                            "Что означает": item.get("what_it_means") or "—",
                            "Причина": item.get("reason_text") or "—",
                            "Действия": item.get("actions") or "—",
                        }
                    )
                pd.DataFrame(rec_rows).to_excel(writer, sheet_name="Recommendations", index=False)
                pd.DataFrame(
                    [
                        {
                            "ESSI": decision["economic_effect"]["essi_score"],
                            "ФОТ": decision["economic_effect"]["fot"],
                            "k": decision["economic_effect"]["k"],
                            "C_replace": decision["economic_effect"]["c_replace"],
                            "Ушедших": decision["economic_effect"]["departed_count"],
                            "Потери эффективности": decision["economic_effect"]["loss_efficiency"],
                            "Потери текучести": decision["economic_effect"]["loss_turnover"],
                            "Итого потерь": decision["economic_effect"]["loss_total"],
                        }
                    ]
                ).to_excel(writer, sheet_name="EconomicEffect", index=False)
                pd.DataFrame(decision["economic_effect"].get("behavioral_effects", [])).to_excel(
                    writer, sheet_name="BehavioralEffects", index=False
                )
                pd.DataFrame(decision["economic_effect"].get("business_impacts", [])).to_excel(
                    writer, sheet_name="BusinessImpacts", index=False
                )
                scenario_row = decision["economic_effect"].get("scenario") or {}
                pd.DataFrame(
                    [
                        {
                            "current_loss_total": (scenario_row.get("current") or {}).get("loss_total"),
                            "improved_loss_total": (scenario_row.get("improved") or {}).get("loss_total"),
                            "savings_potential": scenario_row.get("savings_potential"),
                        }
                    ]
                ).to_excel(writer, sheet_name="Scenario", index=False)
            rep.status = JobStatus.success
            rep.file_path = path_xlsx
            rep.detail = "Decision Excel generated"
            log.info("report_export report_id=%s success format=xlsx", report_id)
        else:
            path_pdf = os.path.join(tmpdir, f"report_{report_id}.pdf")
            _render_decision_pdf(path_pdf, decision)
            rep.status = JobStatus.success
            rep.file_path = path_pdf
            rep.detail = "Decision PDF generated"
            log.info("report_export report_id=%s success format=pdf", report_id)
        db.commit()
    except Exception as e:
        log.exception("report_export report_id=%s failed", report_id)
        db.rollback()
        rep = db.query(ReportExport).filter(ReportExport.id == report_id).first()
        if rep:
            rep.status = JobStatus.failed
            rep.detail = str(e)
            db.commit()
    finally:
        db.close()


def recalculate_indices_task() -> None:
    log.info("recalculate_indices_task started")
    db = _db()
    try:
        recompute_indices(db, date.today())
        generate_recommendations(db)
        db.commit()
        log.info("recalculate_indices_task finished")
    except Exception:
        log.exception("recalculate_indices_task failed")
    finally:
        db.close()
