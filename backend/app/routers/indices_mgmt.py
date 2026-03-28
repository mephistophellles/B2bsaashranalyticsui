from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, require_roles
from app.models import User, UserRole
from app.tasks import recalculate_indices_task

router = APIRouter(prefix="/indices", tags=["indices"])


@router.post("/recalculate", status_code=202)
def recalculate(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    audit(db, user, "indices_recalculate", "indices", {})
    background_tasks.add_task(recalculate_indices_task)
    return {"status": "scheduled"}
