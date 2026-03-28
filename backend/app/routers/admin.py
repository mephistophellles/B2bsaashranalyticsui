from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import get_db
from app.dependencies import audit, require_roles
from app.models import User, UserRole
from app.schemas import UserCreateRequest

router = APIRouter(prefix="/admin", tags=["admin"])


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
