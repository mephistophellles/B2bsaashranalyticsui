from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Department, Employee, IndexRecord, Recommendation, User, UserRole
from app.schemas import RecommendationOut

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
