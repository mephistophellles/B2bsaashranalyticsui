from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Department, Employee, IndexRecord, User, UserRole
from app.schemas import DepartmentIndexOut, DepartmentListItem
from app.services.essi import department_avg_essi

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("/{department_id}/index", response_model=DepartmentIndexOut)
def department_index(
    department_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    avg = department_avg_essi(db, department_id)
    if avg is None:
        raise HTTPException(status_code=404, detail="No data")
    return DepartmentIndexOut(department_id=department_id, avg_essi=avg)


@router.get("", response_model=list[DepartmentListItem])
def list_departments(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    out = []
    for d in db.query(Department).all():
        emps = db.query(Employee).filter(Employee.department_id == d.id).all()
        cnt = len(emps)
        avg = department_avg_essi(db, d.id) or 0.0
        out.append(
            DepartmentListItem(id=d.id, name=d.name, employee_count=cnt, avg_essi=avg)
        )
    return out
