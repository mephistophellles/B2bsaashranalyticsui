from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Department, Employee, IndexRecord, User, UserRole

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
