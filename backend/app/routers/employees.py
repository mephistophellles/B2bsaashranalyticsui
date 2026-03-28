from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Department, Employee, IndexRecord, Survey, User, UserRole
from app.schemas import EmployeeIndexOut, EmployeeListItem
from app.services.dashboard import employee_trend, status_from_essi
router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeListItem])
def list_employees(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    out: list[EmployeeListItem] = []
    for emp in db.query(Employee).all():
        dept = db.query(Department).filter(Department.id == emp.department_id).first()
        idx = (
            db.query(IndexRecord)
            .filter(IndexRecord.employee_id == emp.id)
            .order_by(IndexRecord.calc_date.desc())
            .first()
        )
        essi = idx.essi if idx else 0.0
        surv = (
            db.query(Survey)
            .filter(Survey.employee_id == emp.id)
            .order_by(Survey.survey_date.desc())
            .first()
        )
        engagement = essi - 5 if surv else 0.0
        productivity = min(100.0, essi + 10.0)
        jd = emp.hire_date.strftime("%b %Y") if emp.hire_date else None
        out.append(
            EmployeeListItem(
                id=emp.id,
                name=emp.name,
                email=emp.email,
                phone=emp.phone,
                department=dept.name if dept else "",
                position=emp.position,
                essi=round(essi, 0),
                engagement=round(engagement, 0),
                productivity=round(productivity, 0),
                trend=employee_trend(db, emp.id),
                status=status_from_essi(essi),
                join_date=jd,
            )
        )
    return out


@router.get("/{employee_id}/index", response_model=EmployeeIndexOut)
def employee_index(
    employee_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee and user.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    row = (
        db.query(IndexRecord)
        .filter(IndexRecord.employee_id == employee_id)
        .order_by(IndexRecord.calc_date.desc())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Index not found")
    return EmployeeIndexOut(employee_id=employee_id, essi=row.essi)
