from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user, require_roles
from app.models import Department, Employee, IndexRecord, Survey, User, UserRole
from app.privacy import mask_employee_list_item, privacy_active_for
from app.schemas import (
    EmployeeCreate,
    EmployeeDetailOut,
    EmployeeListItem,
    EmployeePatch,
    EmployeeSurveyRow,
    EmployeeIndexOut,
)
from app.services.dashboard import employee_trend, status_from_essi

router = APIRouter(prefix="/employees", tags=["employees"])


def _build_list_item(db: Session, emp: Employee) -> EmployeeListItem:
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
    return EmployeeListItem(
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


@router.get("", response_model=list[EmployeeListItem])
def list_employees(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    out = [_build_list_item(db, emp) for emp in db.query(Employee).all()]
    return [mask_employee_list_item(x, user) for x in out]


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


@router.get("/{employee_id}", response_model=EmployeeDetailOut)
def employee_detail(
    employee_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Not found")
    base = mask_employee_list_item(_build_list_item(db, emp), user)
    surveys = (
        db.query(Survey)
        .filter(Survey.employee_id == employee_id)
        .order_by(Survey.survey_date.desc())
        .limit(50)
        .all()
    )
    srows = [
        EmployeeSurveyRow(
            id=s.id,
            survey_date=s.survey_date,
            source=s.source,
            score_block1=s.score_block1,
            score_block2=s.score_block2,
            score_block3=s.score_block3,
            score_block4=s.score_block4,
            score_block5=s.score_block5,
        )
        for s in surveys
    ]
    return EmployeeDetailOut(
        **base.model_dump(),
        surveys=srows,
        redacted=privacy_active_for(user),
    )


@router.post("", response_model=EmployeeListItem, status_code=status.HTTP_201_CREATED)
def create_employee(
    body: EmployeeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    dept = db.query(Department).filter(Department.id == body.department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    emp = Employee(
        name=body.name,
        email=body.email,
        phone=body.phone,
        position=body.position,
        department_id=body.department_id,
        hire_date=body.hire_date,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    audit(db, user, "employee_create", "employee", {"id": emp.id})
    return mask_employee_list_item(_build_list_item(db, emp), user)


@router.patch("/{employee_id}", response_model=EmployeeListItem)
def patch_employee(
    employee_id: int,
    body: EmployeePatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Not found")
    if privacy_active_for(user) and user.role == UserRole.manager:
        if body.department_id is not None:
            dept = db.query(Department).filter(Department.id == body.department_id).first()
            if not dept:
                raise HTTPException(status_code=404, detail="Department not found")
            emp.department_id = body.department_id
        db.commit()
        db.refresh(emp)
        audit(db, user, "employee_update", "employee", {"id": employee_id, "privacy": True})
        return mask_employee_list_item(_build_list_item(db, emp), user)
    if body.name is not None:
        emp.name = body.name
    if body.email is not None:
        emp.email = body.email
    if body.phone is not None:
        emp.phone = body.phone
    if body.position is not None:
        emp.position = body.position
    if body.hire_date is not None:
        emp.hire_date = body.hire_date
    if body.department_id is not None:
        dept = db.query(Department).filter(Department.id == body.department_id).first()
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found")
        emp.department_id = body.department_id
    db.commit()
    db.refresh(emp)
    audit(db, user, "employee_update", "employee", {"id": employee_id})
    return mask_employee_list_item(_build_list_item(db, emp), user)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Not found")
    if db.query(Survey).filter(Survey.employee_id == employee_id).first():
        raise HTTPException(
            status_code=409,
            detail="Нельзя удалить: есть записи опросов",
        )
    if db.query(User).filter(User.employee_id == employee_id).first():
        raise HTTPException(
            status_code=409,
            detail="Нельзя удалить: к сотруднику привязана учётная запись",
        )
    db.delete(emp)
    db.commit()
    audit(db, user, "employee_delete", "employee", {"id": employee_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
