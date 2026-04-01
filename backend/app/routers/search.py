from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Department, Employee, User, UserRole
from app.privacy import mask_display_name
from app.schemas import SearchResultItem

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=list[SearchResultItem])
def global_search(
    q: str = Query("", min_length=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    term = q.strip()
    if len(term) < 1:
        return []
    like = f"%{term}%"
    out: list[SearchResultItem] = []
    for d in (
        db.query(Department).filter(Department.name.ilike(like)).order_by(Department.name).limit(10).all()
    ):
        out.append(SearchResultItem(kind="department", id=d.id, label=d.name))
    for emp in (
        db.query(Employee)
        .filter(
            or_(
                Employee.name.ilike(like),
                Employee.email.ilike(like),
                Employee.position.ilike(like),
            )
        )
        .order_by(Employee.name)
        .limit(15)
        .all()
    ):
        label = mask_display_name(emp.id, emp.name, user)
        out.append(SearchResultItem(kind="employee", id=emp.id, label=label))
    return out
