import os
import shutil
import tempfile
import uuid
from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user, require_roles
from app.models import Job, JobStatus, Survey, SurveyQuestion, User, UserRole
from app.schemas import JobOut, SurveySubmitRequest, SurveyTemplateQuestion
from app.services.essi import recompute_indices
from app.services.recommendations_engine import generate_rule_based, maybe_train_lightgbm_and_log
from app.tasks import process_survey_import

router = APIRouter(prefix="/surveys", tags=["surveys"])


@router.get("/template", response_model=list[SurveyTemplateQuestion])
def survey_template(db: Session = Depends(get_db)):
    qs = db.query(SurveyQuestion).order_by(SurveyQuestion.block_index, SurveyQuestion.order_in_block).all()
    if not qs:
        # default 5 blocks x 1 placeholder
        for b in range(1, 6):
            db.add(
                SurveyQuestion(
                    block_index=b,
                    order_in_block=1,
                    text=f"Блок {b}: оцените согласие по шкале 1–5",
                )
            )
        db.commit()
        qs = db.query(SurveyQuestion).order_by(SurveyQuestion.block_index, SurveyQuestion.order_in_block).all()
    return [
        SurveyTemplateQuestion(id=q.id, block_index=q.block_index, order_in_block=q.order_in_block, text=q.text)
        for q in qs
    ]


@router.post("", status_code=201)
def submit_survey(
    body: SurveySubmitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    eid = body.employee_id or user.employee_id
    if not eid:
        raise HTTPException(status_code=400, detail="employee_id required")
    if user.role == UserRole.employee and user.employee_id != eid:
        raise HTTPException(status_code=403, detail="Forbidden")
    sdate = body.survey_date or date.today()
    totals = [0.0] * 5
    for block in body.blocks:
        bi = block.block_index - 1
        if bi < 0 or bi > 4:
            raise HTTPException(status_code=400, detail="Invalid block_index")
        totals[bi] += sum(block.scores)
    db.add(
        Survey(
            employee_id=eid,
            survey_date=sdate,
            score_block1=totals[0],
            score_block2=totals[1],
            score_block3=totals[2],
            score_block4=totals[3],
            score_block5=totals[4],
            source="ui",
        )
    )
    db.commit()
    recompute_indices(db, date.today())
    generate_rule_based(db)
    maybe_train_lightgbm_and_log(db)
    audit(db, user, "survey_submit", "survey", {"employee_id": eid})
    return {"status": "ok"}


@router.post("/upload", response_model=JobOut, status_code=202)
async def upload_surveys(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    job = Job(kind="survey_import", status=JobStatus.pending)
    db.add(job)
    db.commit()
    db.refresh(job)
    ext = os.path.splitext(file.filename or "")[1] or ".csv"
    tmp = os.path.join(tempfile.gettempdir(), f"potential_upload_{job.id}_{uuid.uuid4().hex}{ext}")
    with open(tmp, "wb") as f:
        shutil.copyfileobj(file.file, f)
    audit(db, user, "survey_upload", "job", {"job_id": job.id})
    background_tasks.add_task(process_survey_import, job.id, tmp, user.id)
    return JobOut(
        id=job.id,
        kind=job.kind,
        status=job.status.value,
        detail=job.detail,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )
