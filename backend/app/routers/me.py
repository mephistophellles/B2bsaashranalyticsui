from datetime import datetime

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
    User,
    UserRole,
)
from app.schemas import MySurveyRow, NotificationOut, RecommendationOut

router = APIRouter(prefix="/me", tags=["me"])


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
            description=r.text,
            priority=r.priority,
            status=r.status,
            created_at=r.created_at,
            model_version=r.model_version,
        )
        for r in rows
    ]


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
    return [
        MySurveyRow(
            id=s.id,
            survey_date=s.survey_date,
            source=s.source,
            score_block1=s.score_block1,
            score_block2=s.score_block2,
            score_block3=s.score_block3,
            score_block4=s.score_block4,
            score_block5=s.score_block5,
        )
        for s in rows
    ]


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
