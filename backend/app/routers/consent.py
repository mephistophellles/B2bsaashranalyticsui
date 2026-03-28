from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user
from app.models import ConsentRecord, User
from app.schemas import ConsentRequest

router = APIRouter(prefix="/consent", tags=["consent"])


@router.post("")
def post_consent(
    body: ConsentRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.add(ConsentRecord(employee_id=user.employee_id, accepted=body.accepted))
    db.commit()
    audit(db, user, "consent", "pd", {"accepted": body.accepted})
    return {"ok": True}
