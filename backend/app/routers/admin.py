from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import get_db
from app.dependencies import audit, require_roles
from app.models import User, UserRole
from app.schemas import (
    UserAdminListPage,
    UserAdminOut,
    UserAdminPatch,
    UserAdminResetPassword,
    UserCreateRequest,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=UserAdminListPage)
def list_users(
    q: str | None = Query(None, description="Поиск по username"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_roles(UserRole.admin)),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        query = query.filter(User.username.contains(q.strip()))
    total = query.count()
    rows = query.order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(limit).all()
    items = [UserAdminOut.model_validate(row) for row in rows]
    return UserAdminListPage(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + limit) < total,
    )


@router.post("/users", status_code=201)
def create_user(
    body: UserCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    u = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        employee_id=body.employee_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    audit(db, user, "admin_create_user", "user", {"username": body.username})
    return {"id": u.id, "username": u.username}


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def patch_user(
    user_id: int,
    body: UserAdminPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        target.role = body.role
    if body.employee_id is not None or body.role == UserRole.employee:
        target.employee_id = body.employee_id
    if body.role is not None and body.role != UserRole.employee:
        target.employee_id = None
    db.commit()
    db.refresh(target)
    audit(
        db,
        user,
        "admin_update_user",
        "user",
        {"id": user_id, "role": target.role.value, "employee_id": target.employee_id},
    )
    return UserAdminOut.model_validate(target)


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    body: UserAdminResetPassword,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.password_hash = hash_password(body.new_password)
    db.commit()
    audit(db, user, "admin_reset_password", "user", {"id": user_id})
    return {"ok": True}
