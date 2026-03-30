import logging
import os
import tempfile
from datetime import date, datetime

import pandas as pd
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Job, JobStatus, Notification, ReportExport, Survey
from app.services.campaign_survey import (
    ALREADY_DONE,
    CampaignSurveyValidationError,
    validate_campaign_survey_row,
)
from app.services.essi import recompute_indices
from app.services.recommendations_engine import generate_rule_based, maybe_train_lightgbm_and_log

log = logging.getLogger(__name__)


def _db() -> Session:
    return SessionLocal()


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

        ext = os.path.splitext(file_path)[1].lower()
        if ext in (".xlsx", ".xls"):
            df = pd.read_excel(file_path)
        else:
            df = pd.read_csv(file_path)

        required = [
            "employee_id",
            "survey_date",
            "score_block1",
            "score_block2",
            "score_block3",
            "score_block4",
            "score_block5",
        ]
        for c in required:
            if c not in df.columns:
                raise ValueError(f"Missing column: {c}")

        seen_campaign_pairs: set[tuple[int, int]] = set()
        for _, row in df.iterrows():
            sid = int(row["employee_id"])
            raw_date = row["survey_date"]
            if hasattr(raw_date, "date"):
                sdate = raw_date.date()
            else:
                sdate = pd.to_datetime(raw_date).date()
            if campaign_id is not None:
                pair = (sid, campaign_id)
                if pair in seen_campaign_pairs:
                    raise CampaignSurveyValidationError(ALREADY_DONE)
                seen_campaign_pairs.add(pair)
            try:
                validate_campaign_survey_row(
                    db,
                    campaign_id,
                    sdate,
                    sid,
                    enforce_duplicate_check=(campaign_id is not None),
                )
            except CampaignSurveyValidationError as e:
                raise CampaignSurveyValidationError(
                    f"Строка employee_id={sid}, survey_date={sdate}: {e}"
                ) from e
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
        generate_rule_based(db)
        maybe_train_lightgbm_and_log(db)

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
            from app.services.essi import organization_avg_essi

            path_xlsx = os.path.join(tmpdir, f"report_{report_id}.xlsx")
            avg = organization_avg_essi(db)
            pd.DataFrame(
                [
                    {"Показатель": "Средний ESSI организации", "Значение": avg if avg is not None else ""},
                    {"Показатель": "Сформировано", "Значение": datetime.utcnow().isoformat()},
                ]
            ).to_excel(path_xlsx, index=False)
            rep.status = JobStatus.success
            rep.file_path = path_xlsx
            rep.detail = "Excel generated"
            log.info("report_export report_id=%s success format=xlsx", report_id)
        else:
            path_pdf = os.path.join(tmpdir, f"report_{report_id}.pdf")
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas

            c = canvas.Canvas(path_pdf, pagesize=A4)
            c.drawString(100, 800, "Потенциал — сводный отчёт")
            c.drawString(
                100,
                780,
                "ИСУР (ESSI): 5 блоков × 5 утверждений, шкала Лайкерта 1–5 (3 — затрудняюсь ответить).",
            )
            c.drawString(100, 760, datetime.utcnow().isoformat())
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
        generate_rule_based(db)
        maybe_train_lightgbm_and_log(db)
        db.commit()
        log.info("recalculate_indices_task finished")
    except Exception:
        log.exception("recalculate_indices_task failed")
    finally:
        db.close()
