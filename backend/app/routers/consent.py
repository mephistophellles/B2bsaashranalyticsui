from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user
from app.models import ConsentRecord, User
from app.schemas import ConsentRequest, ConsentStatusOut

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


@router.get("/status", response_model=ConsentStatusOut)
def consent_status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    latest = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.employee_id == user.employee_id)
        .order_by(ConsentRecord.created_at.desc(), ConsentRecord.id.desc())
        .first()
    )
    if not latest:
        return ConsentStatusOut(accepted=False, accepted_at=None)
    return ConsentStatusOut(accepted=bool(latest.accepted), accepted_at=latest.created_at)
