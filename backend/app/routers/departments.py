from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user, require_roles
from app.models import Department, Employee, IndexRecord, User, UserRole
from app.schemas import (
    DepartmentBasic,
    DepartmentBreakdownOut,
    DepartmentCreate,
    DepartmentIndexOut,
    DepartmentListItem,
    DepartmentListPage,
    DepartmentPatch,
)
from app.services.dashboard import department_block_breakdown, status_from_essi
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


@router.get("/page", response_model=DepartmentListPage)
def list_departments_page(
    q: str | None = Query(None, description="Поиск по названию"),
    sort_by: str = Query("name", pattern="^(name|employee_count|avg_essi)$"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")

    rows: list[DepartmentListItem] = []
    for d in db.query(Department).all():
        emps = db.query(Employee).filter(Employee.department_id == d.id).all()
        rows.append(
            DepartmentListItem(
                id=d.id,
                name=d.name,
                employee_count=len(emps),
                avg_essi=department_avg_essi(db, d.id) or 0.0,
            )
        )

    if q:
        needle = q.strip().lower()
        rows = [x for x in rows if needle in x.name.lower()]

    reverse = sort_order == "desc"
    if sort_by == "employee_count":
        rows.sort(
            key=lambda x: (x.employee_count, x.avg_essi, x.name.lower(), x.id),
            reverse=reverse,
        )
    elif sort_by == "avg_essi":
        rows.sort(
            key=lambda x: (x.avg_essi, x.employee_count, x.name.lower(), x.id),
            reverse=reverse,
        )
    else:
        rows.sort(key=lambda x: (x.name.lower(), x.id), reverse=reverse)

    total = len(rows)
    items = rows[offset : offset + limit]
    return DepartmentListPage(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + limit) < total,
    )


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


@router.get("/{department_id}/breakdown", response_model=DepartmentBreakdownOut)
def department_breakdown(
    department_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    dep = db.query(Department).filter(Department.id == department_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Not found")
    emps = db.query(Employee).filter(Employee.department_id == department_id).all()
    contributors = []
    for e in emps:
        idx = (
            db.query(IndexRecord)
            .filter(IndexRecord.employee_id == e.id)
            .order_by(IndexRecord.calc_date.desc(), IndexRecord.id.desc())
            .first()
        )
        if not idx:
            continue
        contributors.append(
            {
                "id": e.id,
                "name": e.name,
                "essi": round(idx.essi, 1),
                "status": status_from_essi(idx.essi),
            }
        )
    contributors.sort(key=lambda x: x["essi"])
    return DepartmentBreakdownOut(
        department_id=department_id,
        blocks=department_block_breakdown(db, department_id),
        risk_contributors=contributors[:10],
    )


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
