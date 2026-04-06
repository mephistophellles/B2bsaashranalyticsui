from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Department,
    Employee,
    IndexRecord,
    Notification,
    Recommendation,
    RecommendationFeedback,
    Survey,
    SurveyCampaign,
    User,
    UserRole,
)
from app.schemas import EmployeeCampaignOut, MySurveyRow, NotificationOut, RecommendationOut
from app.services.campaign_survey import campaign_visible_for_date
from app.services.essi import block_percentages, essi_from_blocks
from app.services.explainability import (
    build_recommendation_explainability,
    recommendation_text_for_audience,
)

router = APIRouter(prefix="/me", tags=["me"])


def _feedback_stats(db: Session, rec_id: int) -> tuple[int, str | None]:
    rows = (
        db.query(RecommendationFeedback)
        .filter(RecommendationFeedback.recommendation_id == rec_id)
        .order_by(RecommendationFeedback.created_at.desc(), RecommendationFeedback.id.desc())
        .all()
    )
    return len(rows), (rows[0].result if rows else None)


def _recommendation_out(db: Session, r: Recommendation, *, audience: str) -> RecommendationOut:
    feedback_count, last_feedback_result = _feedback_stats(db, r.id)
    return RecommendationOut(
        id=r.id,
        department_id=r.department_id,
        title=r.title,
        description=recommendation_text_for_audience(r, audience=audience),
        priority=r.priority,
        status=r.status,
        created_at=r.created_at,
        model_version=r.model_version,
        feedback_count=feedback_count,
        last_feedback_result=last_feedback_result,
        **build_recommendation_explainability(r, audience=audience),
    )


def _survey_to_row(s: Survey) -> MySurveyRow:
    scores = [
        s.score_block1,
        s.score_block2,
        s.score_block3,
        s.score_block4,
        s.score_block5,
    ]
    return MySurveyRow(
        id=s.id,
        survey_date=s.survey_date,
        source=s.source,
        score_block1=scores[0],
        score_block2=scores[1],
        score_block3=scores[2],
        score_block4=scores[3],
        score_block5=scores[4],
        essi=essi_from_blocks(scores),
        block_percentages=block_percentages(scores),
    )


@router.get("/summary")
def my_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRole.employee or not user.employee_id:
        raise HTTPException(status_code=403, detail="Employee only")
    emp = db.query(Employee).filter(Employee.id == user.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404)
    dept = db.query(Department).filter(Department.id == emp.department_id).first()
    idx = (
        db.query(IndexRecord)
        .filter(IndexRecord.employee_id == emp.id)
        .order_by(IndexRecord.calc_date.desc())
        .first()
    )
    return {
        "name": emp.name,
        "department": dept.name if dept else "",
        "essi": idx.essi if idx else 0.0,
        "position": emp.position,
    }


@router.get("/recommendations", response_model=list[RecommendationOut])
def my_recommendations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Рекомендации по отделу сотрудника (только чтение)."""
    if user.role != UserRole.employee or not user.employee_id:
        raise HTTPException(status_code=403, detail="Employee only")
    emp = db.query(Employee).filter(Employee.id == user.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404)
    rows = (
        db.query(Recommendation)
        .filter(Recommendation.department_id == emp.department_id)
        .order_by(Recommendation.created_at.desc())
        .all()
    )
    return [_recommendation_out(db, r, audience="employee") for r in rows]


@router.get("/recommendations/{rec_id}", response_model=RecommendationOut)
def my_recommendation_detail(
    rec_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Одна рекомендация отдела сотрудника (для прямых ссылок и клиентов)."""
    if user.role != UserRole.employee or not user.employee_id:
        raise HTTPException(status_code=403, detail="Employee only")
    emp = db.query(Employee).filter(Employee.id == user.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404)
    r = db.query(Recommendation).filter(Recommendation.id == rec_id).first()
    if not r or r.department_id != emp.department_id:
        raise HTTPException(status_code=404, detail="Not found")
    return _recommendation_out(db, r, audience="employee")


@router.get("/campaigns", response_model=list[EmployeeCampaignOut])
def my_campaigns(
    include_closed: bool = Query(
        False,
        description="Включить закрытые кампании (архив) после активных",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Активные кампании и флаг «уже прошёл» для текущего сотрудника."""
    if user.role != UserRole.employee or not user.employee_id:
        raise HTTPException(status_code=403, detail="Employee only")
    today = date.today()
    out: list[EmployeeCampaignOut] = []

    active_rows = (
        db.query(SurveyCampaign)
        .filter(SurveyCampaign.status == "active")
        .order_by(SurveyCampaign.created_at.desc())
        .all()
    )
    for c in active_rows:
        if not campaign_visible_for_date(c, today):
            continue
        done = (
            db.query(Survey)
            .filter(Survey.employee_id == user.employee_id, Survey.campaign_id == c.id)
            .first()
            is not None
        )
        out.append(
            EmployeeCampaignOut(
                id=c.id,
                name=c.name,
                status=c.status,
                starts_at=c.starts_at,
                ends_at=c.ends_at,
                completed=done,
            )
        )

    if include_closed:
        closed_rows = (
            db.query(SurveyCampaign)
            .filter(SurveyCampaign.status == "closed")
            .order_by(SurveyCampaign.created_at.desc())
            .all()
        )
        for c in closed_rows:
            done = (
                db.query(Survey)
                .filter(Survey.employee_id == user.employee_id, Survey.campaign_id == c.id)
                .first()
                is not None
            )
            out.append(
                EmployeeCampaignOut(
                    id=c.id,
                    name=c.name,
                    status=c.status,
                    starts_at=c.starts_at,
                    ends_at=c.ends_at,
                    completed=done,
                )
            )
    return out


@router.get("/surveys/{survey_id}", response_model=MySurveyRow)
def my_survey_detail(
    survey_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRole.employee or not user.employee_id:
        raise HTTPException(status_code=403, detail="Employee only")
    s = db.query(Survey).filter(Survey.id == survey_id).first()
    if not s or s.employee_id != user.employee_id:
        raise HTTPException(status_code=404, detail="Not found")
    return _survey_to_row(s)


@router.get("/surveys", response_model=list[MySurveyRow])
def my_surveys(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRole.employee or not user.employee_id:
        raise HTTPException(status_code=403, detail="Employee only")
    rows = (
        db.query(Survey)
        .filter(Survey.employee_id == user.employee_id)
        .order_by(Survey.survey_date.desc())
        .limit(100)
        .all()
    )
    return [_survey_to_row(s) for s in rows]


@router.get("/notifications", response_model=list[NotificationOut])
def my_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [NotificationOut.model_validate(n) for n in rows]


@router.patch("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    n = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user.id)
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="Not found")
    n.read_at = datetime.utcnow()
    db.commit()
    db.refresh(n)
    return NotificationOut.model_validate(n)
