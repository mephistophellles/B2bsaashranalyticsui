from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models import AuditLog, User, UserRole

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs")
def list_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
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
