from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Department,
    Employee,
    IndexRecord,
    Notification,
    Recommendation,
    Survey,
    SurveyCampaign,
    User,
    UserRole,
)
from app.schemas import EmployeeCampaignOut, MySurveyRow, NotificationOut, RecommendationOut

router = APIRouter(prefix="/me", tags=["me"])


def _recommendation_description_for_employee(r: Recommendation) -> str:
    return r.text_employee if r.text_employee else r.text


def _campaign_visible_for_date(c: SurveyCampaign, today: date) -> bool:
    """Кампания без границ дат видна всегда; иначе today должна попадать в [starts_at, ends_at]."""
    if c.starts_at is not None and today < c.starts_at:
        return False
    if c.ends_at is not None and today > c.ends_at:
        return False
    return True


def _survey_to_row(s: Survey) -> MySurveyRow:
    return MySurveyRow(
        id=s.id,
        survey_date=s.survey_date,
        source=s.source,
        score_block1=s.score_block1,
        score_block2=s.score_block2,
        score_block3=s.score_block3,
        score_block4=s.score_block4,
        score_block5=s.score_block5,
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
    return [
        RecommendationOut(
            id=r.id,
            department_id=r.department_id,
            title=r.title,
            description=_recommendation_description_for_employee(r),
            priority=r.priority,
            status=r.status,
            created_at=r.created_at,
            model_version=r.model_version,
        )
        for r in rows
    ]


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
    return RecommendationOut(
        id=r.id,
        department_id=r.department_id,
        title=r.title,
        description=_recommendation_description_for_employee(r),
        priority=r.priority,
        status=r.status,
        created_at=r.created_at,
        model_version=r.model_version,
    )


@router.get("/campaigns", response_model=list[EmployeeCampaignOut])
def my_campaigns(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Активные кампании и флаг «уже прошёл» для текущего сотрудника."""
    if user.role != UserRole.employee or not user.employee_id:
        raise HTTPException(status_code=403, detail="Employee only")
    today = date.today()
    campaigns = (
        db.query(SurveyCampaign)
        .filter(SurveyCampaign.status == "active")
        .order_by(SurveyCampaign.created_at.desc())
        .all()
    )
    out: list[EmployeeCampaignOut] = []
    for c in campaigns:
        if not _campaign_visible_for_date(c, today):
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
