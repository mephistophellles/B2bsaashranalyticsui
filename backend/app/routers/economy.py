from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user, require_roles
from app.models import OrganizationSettings, User, UserRole
from app.schemas import (
    EconomyDefaultsOut,
    EconomyDraftsPatch,
    EconomyRequest,
    EconomyScenarioRequest,
    EconomyScenarioResponse,
    EconomyResponse,
)
from app.services.economy_bridge import build_economy_scenario, calculate_losses
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
    losses = calculate_losses(
        essi_score=body.essi_score,
        fot=body.fot,
        k=body.k,
        c_replace=body.c_replace,
        departed_count=body.departed_count,
    )
    return EconomyResponse(
        loss_efficiency=losses["loss_efficiency"],
        loss_turnover=losses["loss_turnover"],
        loss_total=losses["loss_total"],
    )


@router.post("/scenario", response_model=EconomyScenarioResponse)
def economy_scenario(
    body: EconomyScenarioRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    payload = build_economy_scenario(
        essi_score=body.essi_score,
        improved_essi=body.improved_essi,
        fot=body.fot,
        k=body.k,
        c_replace=body.c_replace,
        departed_count=body.departed_count,
    )
    return EconomyScenarioResponse.model_validate(payload)


def _org_settings(db: Session) -> OrganizationSettings:
    row = db.query(OrganizationSettings).filter(OrganizationSettings.id == 1).first()
    if not row:
        row = OrganizationSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/defaults", response_model=EconomyDefaultsOut)
def economy_defaults(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    avg = organization_avg_essi(db) or 80.0
    o = _org_settings(db)
    return EconomyDefaultsOut(
        suggested_essi=avg,
        draft_fot=o.default_fot,
        draft_k=o.default_k,
        draft_c_replace=o.default_c_replace,
        draft_departed_count=o.default_departed_count,
    )


@router.patch("/drafts", response_model=EconomyDefaultsOut)
def economy_patch_drafts(
    body: EconomyDraftsPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    o = _org_settings(db)
    if body.default_fot is not None:
        o.default_fot = body.default_fot
    if body.default_k is not None:
        o.default_k = body.default_k
    if body.default_c_replace is not None:
        o.default_c_replace = body.default_c_replace
    if body.default_departed_count is not None:
        o.default_departed_count = body.default_departed_count
    db.commit()
    db.refresh(o)
    audit(db, user, "economy_drafts_update", "organization_settings", {})
    avg = organization_avg_essi(db) or 80.0
    return EconomyDefaultsOut(
        suggested_essi=avg,
        draft_fot=o.default_fot,
        draft_k=o.default_k,
        draft_c_replace=o.default_c_replace,
        draft_departed_count=o.default_departed_count,
    )
