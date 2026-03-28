from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, UserRole
from app.schemas import OrganizationIndexOut
from app.services.essi import organization_avg_essi

router = APIRouter(prefix="/organization", tags=["organization"])


@router.get("/index", response_model=OrganizationIndexOut)
def org_index(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    avg = organization_avg_essi(db)
    if avg is None:
        raise HTTPException(status_code=404, detail="No data")
    return OrganizationIndexOut(avg_essi=avg)
