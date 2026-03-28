from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, UserRole
from app.schemas import EconomyRequest, EconomyResponse
from app.services.essi import organization_avg_essi

router = APIRouter(prefix="/economy", tags=["economy"])


@router.post("/calculate", response_model=EconomyResponse)
def economy_calc(
    body: EconomyRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    essi = body.essi_score
    if essi >= 100:
        essi = 99.9
    loss_eff = (100.0 - essi) * body.fot * body.k
    loss_turn = body.departed_count * body.c_replace
    return EconomyResponse(
        loss_efficiency=round(loss_eff, 2),
        loss_turnover=round(loss_turn, 2),
        loss_total=round(loss_eff + loss_turn, 2),
    )


@router.get("/defaults")
def economy_defaults(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    avg = organization_avg_essi(db) or 80.0
    return {"suggested_essi": avg}
