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

        if rep.kind in ("summary_excel", "excel"):
            from app.services.dashboard import organization_block_percentages
            from app.services.essi import organization_avg_essi

            path_xlsx = os.path.join(tmpdir, f"report_{report_id}.xlsx")
            avg = organization_avg_essi(db)
            rows = [
                {
                    "Показатель": "Средний ESSI организации",
                    "Значение": avg if avg is not None else "",
                    "Комментарий": "Процент от максимума по методике",
                }
            ]
            for block in organization_block_percentages(db):
                rows.append(
                    {
                        "Показатель": f"{block['title']}",
                        "Значение": block["value"],
                        "Комментарий": "Процент от максимума по блоку (score_blockX / 25 × 100)",
                    }
                )
            rows.append(
                {
                    "Показатель": "Сформировано",
                    "Значение": datetime.utcnow().isoformat(),
                    "Комментарий": "",
                }
            )
            pd.DataFrame(rows).to_excel(path_xlsx, index=False)
            rep.status = JobStatus.success
            rep.file_path = path_xlsx
            rep.detail = "Excel generated"
            log.info("report_export report_id=%s success format=xlsx", report_id)
        else:
            path_pdf = os.path.join(tmpdir, f"report_{report_id}.pdf")
            from app.services.dashboard import organization_block_percentages
            from app.services.essi import organization_avg_essi
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas

            c = canvas.Canvas(path_pdf, pagesize=A4)
            c.drawString(100, 800, "Потенциал — сводный отчёт")
            c.drawString(
                100,
                780,
                "ESSI: сумма score_block1..5 / 125 × 100, процент от максимума по методике.",
            )
            avg = organization_avg_essi(db)
            c.drawString(100, 760, f"Средний ESSI организации: {avg if avg is not None else '—'}")
            y = 740
            for block in organization_block_percentages(db):
                c.drawString(100, y, f"{METHODOLOGY_BLOCK_TITLES[block['block_index']]}: {block['value']}%")
                y -= 20
            c.drawString(100, y - 10, datetime.utcnow().isoformat())
            c.showPage()
            c.save()
            rep.status = JobStatus.success
            rep.file_path = path_pdf
            rep.detail = "PDF generated"
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
