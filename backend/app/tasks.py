import os
import tempfile
from datetime import date, datetime

import pandas as pd
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Job, JobStatus, ReportExport, Survey
from app.services.essi import recompute_indices
from app.services.recommendations_engine import generate_rule_based, maybe_train_lightgbm_and_log


def _db() -> Session:
    return SessionLocal()


def process_survey_import(job_id: int, file_path: str) -> None:
    db = _db()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return
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

        for _, row in df.iterrows():
            sid = int(row["employee_id"])
            raw_date = row["survey_date"]
            if hasattr(raw_date, "date"):
                sdate = raw_date.date()
            else:
                sdate = pd.to_datetime(raw_date).date()
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
    except Exception as e:
        db.rollback()
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = JobStatus.failed
            job.detail = str(e)
            job.finished_at = datetime.utcnow()
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
            return
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
        else:
            path_pdf = os.path.join(tmpdir, f"report_{report_id}.pdf")
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas

            c = canvas.Canvas(path_pdf, pagesize=A4)
            c.drawString(100, 800, "Потенциал — сводный отчёт")
            c.drawString(100, 780, datetime.utcnow().isoformat())
            c.showPage()
            c.save()
            rep.status = JobStatus.success
            rep.file_path = path_pdf
            rep.detail = "PDF generated"
        db.commit()
    except Exception as e:
        db.rollback()
        rep = db.query(ReportExport).filter(ReportExport.id == report_id).first()
        if rep:
            rep.status = JobStatus.failed
            rep.detail = str(e)
            db.commit()
    finally:
        db.close()


def recalculate_indices_task() -> None:
    db = _db()
    try:
        recompute_indices(db, date.today())
        generate_rule_based(db)
        maybe_train_lightgbm_and_log(db)
        db.commit()
    finally:
        db.close()
