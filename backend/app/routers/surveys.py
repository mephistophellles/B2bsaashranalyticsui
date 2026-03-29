import os
import shutil
import tempfile
import uuid
from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user, require_roles
from app.data.survey_methodology import (
    METHODOLOGY_BLOCK_TITLES,
    ensure_methodology_questions,
)
from app.models import Job, JobStatus, Survey, SurveyCampaign, SurveyQuestion, User, UserRole
from app.schemas import (
    JobOut,
    SurveyBlockTitleOut,
    SurveyCampaignCreate,
    SurveyCampaignOut,
    SurveyCampaignPatch,
    SurveySubmitRequest,
    SurveyTemplateQuestion,
    SurveyTemplateResponse,
)
from app.services.essi import recompute_indices
from app.services.recommendations_engine import generate_rule_based, maybe_train_lightgbm_and_log
from app.tasks import process_survey_import

router = APIRouter(prefix="/surveys", tags=["surveys"])


@router.get("/template", response_model=SurveyTemplateResponse)
def survey_template(db: Session = Depends(get_db)):
    ensure_methodology_questions(db)
    qs = db.query(SurveyQuestion).order_by(SurveyQuestion.block_index, SurveyQuestion.order_in_block).all()
    questions = [
        SurveyTemplateQuestion(id=q.id, block_index=q.block_index, order_in_block=q.order_in_block, text=q.text)
        for q in qs
    ]
    block_titles = [
        SurveyBlockTitleOut(block_index=i, title=METHODOLOGY_BLOCK_TITLES[i]) for i in range(1, 6)
    ]
    return SurveyTemplateResponse(questions=questions, block_titles=block_titles)


@router.get("/campaigns", response_model=list[SurveyCampaignOut])
def list_campaigns(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    rows = db.query(SurveyCampaign).order_by(SurveyCampaign.created_at.desc()).all()
    return [SurveyCampaignOut.model_validate(r) for r in rows]


@router.post("/campaigns", response_model=SurveyCampaignOut, status_code=201)
def create_campaign(
    body: SurveyCampaignCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    c = SurveyCampaign(
        name=body.name.strip(),
        status="active",
        starts_at=body.starts_at,
        ends_at=body.ends_at,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    audit(db, user, "survey_campaign_create", "survey_campaign", {"id": c.id})
    return SurveyCampaignOut.model_validate(c)


@router.patch("/campaigns/{campaign_id}", response_model=SurveyCampaignOut)
def patch_campaign(
    campaign_id: int,
    body: SurveyCampaignPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    c = db.query(SurveyCampaign).filter(SurveyCampaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    if body.status is not None:
        if body.status not in ("active", "closed"):
            raise HTTPException(status_code=400, detail="status must be active or closed")
        c.status = body.status
    db.commit()
    db.refresh(c)
    audit(db, user, "survey_campaign_update", "survey_campaign", {"id": c.id})
    return SurveyCampaignOut.model_validate(c)


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
    camp_id = body.campaign_id
    if camp_id is not None:
        camp = db.query(SurveyCampaign).filter(SurveyCampaign.id == camp_id).first()
        if not camp or camp.status != "active":
            raise HTTPException(status_code=400, detail="Кампания не найдена или закрыта")
        if camp.starts_at is not None and sdate < camp.starts_at:
            raise HTTPException(
                status_code=400,
                detail="Дата опроса раньше даты начала кампании",
            )
        if camp.ends_at is not None and sdate > camp.ends_at:
            raise HTTPException(
                status_code=400,
                detail="Дата опроса позже даты окончания кампании",
            )
        if user.role == UserRole.employee:
            dup = (
                db.query(Survey)
                .filter(Survey.employee_id == eid, Survey.campaign_id == camp_id)
                .first()
            )
            if dup:
                raise HTTPException(status_code=400, detail="Опрос по этой кампании уже пройден")
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
            campaign_id=camp_id,
        )
    )
    db.commit()
    recompute_indices(db, date.today())
    generate_rule_based(db)
    maybe_train_lightgbm_and_log(db)
    audit(db, user, "survey_submit", "survey", {"employee_id": eid, "campaign_id": camp_id})
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
