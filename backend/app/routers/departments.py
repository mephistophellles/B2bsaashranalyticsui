from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user, require_roles
from app.models import Department, Employee, IndexRecord, User, UserRole
from app.schemas import (
    DepartmentBasic,
    DepartmentCreate,
    DepartmentIndexOut,
    DepartmentListItem,
    DepartmentPatch,
)
from app.services.essi import department_avg_essi

router = APIRouter(prefix="/departments", tags=["departments"])


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


@router.post("", response_model=DepartmentListItem, status_code=status.HTTP_201_CREATED)
def create_department(
    body: DepartmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    d = Department(name=body.name.strip())
    db.add(d)
    db.commit()
    db.refresh(d)
    audit(db, user, "department_create", "department", {"id": d.id})
    return DepartmentListItem(id=d.id, name=d.name, employee_count=0, avg_essi=0.0)


@router.get("/{department_id}", response_model=DepartmentBasic)
def get_department(
    department_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    d = db.query(Department).filter(Department.id == department_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return DepartmentBasic(id=d.id, name=d.name)


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


@router.patch("/{department_id}", response_model=DepartmentListItem)
def patch_department(
    department_id: int,
    body: DepartmentPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    d = db.query(Department).filter(Department.id == department_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    if body.name is not None:
        d.name = body.name.strip()
    db.commit()
    db.refresh(d)
    emps = db.query(Employee).filter(Employee.department_id == d.id).all()
    cnt = len(emps)
    avg = department_avg_essi(db, d.id) or 0.0
    audit(db, user, "department_update", "department", {"id": department_id})
    return DepartmentListItem(id=d.id, name=d.name, employee_count=cnt, avg_essi=avg)


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    d = db.query(Department).filter(Department.id == department_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    if db.query(Employee).filter(Employee.department_id == department_id).first():
        raise HTTPException(
            status_code=409,
            detail="Нельзя удалить: в отделе есть сотрудники",
        )
    db.delete(d)
    db.commit()
    audit(db, user, "department_delete", "department", {"id": department_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
