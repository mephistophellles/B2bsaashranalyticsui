from datetime import datetime
import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models import AuditLog, User, UserRole

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs")
def list_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None, description="Фильтр по полю action (подстрока)"),
    date_from: datetime | None = Query(None, description="UTC ISO datetime start"),
    date_to: datetime | None = Query(None, description="UTC ISO datetime end"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        q = q.filter(AuditLog.action.contains(action))
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)
    batch = q.offset(offset).limit(limit + 1).all()
    has_more = len(batch) > limit
    rows = batch[:limit]
    items = [
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
    return {
        "items": items,
        "has_more": has_more,
        "offset": offset,
        "limit": limit,
    }


@router.get("/logs/export")
def export_logs_csv(
    action: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        q = q.filter(AuditLog.action.contains(action))
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)
    rows = q.limit(5000).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at", "user_id", "action", "entity", "meta"])
    for r in rows:
        writer.writerow(
            [
                r.id,
                r.created_at.isoformat(),
                r.user_id if r.user_id is not None else "",
                r.action,
                r.entity or "",
                r.meta if r.meta is not None else "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit_logs.csv"'},
    )