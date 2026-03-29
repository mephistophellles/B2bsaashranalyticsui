from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models import AuditLog, User, UserRole

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs")
def list_logs(
    limit: int = Query(100, ge=1, le=500),
    action: str | None = Query(None, description="Фильтр по полю action (подстрока)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        q = q.filter(AuditLog.action.contains(action))
    rows = q.limit(limit).all()
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "action": r.action,
            "entity": r.entity,
            "meta": r.meta,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
