import os
import shutil
import tempfile
import uuid
from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
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
from app.services.campaign_survey import CampaignSurveyValidationError, validate_campaign_survey_row
from app.services.essi import recompute_indices, validate_block_sum
from app.services.recommendations_engine import generate_rule_based, maybe_train_lightgbm_and_log
from app.tasks import parse_and_validate_survey_import_file, process_survey_import

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
    data = body.model_dump(exclude_unset=True)
    dates_change = False
    if "starts_at" in data and data["starts_at"] != c.starts_at:
        dates_change = True
    if "ends_at" in data and data["ends_at"] != c.ends_at:
        dates_change = True
    if dates_change:
        answered = (
            db.query(Survey).filter(Survey.campaign_id == campaign_id).count()
        )
        if answered > 0:
            raise HTTPException(
                status_code=409,
                detail="Нельзя менять даты кампании: уже есть ответы по ней",
            )
    if body.status is not None:
        if body.status not in ("active", "closed"):
            raise HTTPException(status_code=400, detail="status must be active or closed")
        c.status = body.status
    if "name" in data and data["name"] is not None:
        c.name = str(data["name"]).strip()
    if "starts_at" in data:
        c.starts_at = data["starts_at"]
    if "ends_at" in data:
        c.ends_at = data["ends_at"]
    if c.starts_at is not None and c.ends_at is not None and c.starts_at > c.ends_at:
        raise HTTPException(status_code=400, detail="starts_at не может быть позже ends_at")
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
    try:
        validate_campaign_survey_row(
            db,
            camp_id,
            sdate,
            eid,
            enforce_duplicate_check=(user.role == UserRole.employee),
        )
    except CampaignSurveyValidationError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    totals = [0.0] * 5
    for block in body.blocks:
        bi = block.block_index - 1
        totals[bi] += sum(block.scores)
    try:
        totals = [validate_block_sum(total, block_index=idx + 1) for idx, total in enumerate(totals)]
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
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
    campaign_id: int | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    if campaign_id is not None:
        camp = db.query(SurveyCampaign).filter(SurveyCampaign.id == campaign_id).first()
        if not camp or camp.status != "active":
            raise HTTPException(status_code=422, detail="Кампания не найдена или закрыта")
    ext = os.path.splitext(file.filename or "")[1] or ".csv"
    tmp = os.path.join(tempfile.gettempdir(), f"potential_upload_{uuid.uuid4().hex}{ext}")
    with open(tmp, "wb") as f:
        shutil.copyfileobj(file.file, f)
    try:
        parse_and_validate_survey_import_file(tmp, db=db, campaign_id=campaign_id)
    except (ValueError, CampaignSurveyValidationError) as err:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise HTTPException(status_code=422, detail=str(err)) from err
    job = Job(kind="survey_import", status=JobStatus.pending)
    db.add(job)
    db.commit()
    db.refresh(job)
    audit(db, user, "survey_upload", "job", {"job_id": job.id, "campaign_id": campaign_id})
    background_tasks.add_task(process_survey_import, job.id, tmp, user.id, campaign_id)
    return JobOut(
        id=job.id,
        kind=job.kind,
        status=job.status.value,
        detail=job.detail,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )
