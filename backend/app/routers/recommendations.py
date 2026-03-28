from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user
from app.models import Recommendation, User, UserRole
from app.schemas import RecommendationOut, RecommendationPatch

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("", response_model=list[RecommendationOut])
def list_recommendations(
    dept: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    q = db.query(Recommendation)
    if dept is not None:
        q = q.filter(Recommendation.department_id == dept)
    rows = q.order_by(Recommendation.created_at.desc()).all()
    return [
        RecommendationOut(
            id=r.id,
            department_id=r.department_id,
            title=r.title,
            description=r.text,
            priority=r.priority,
            status=r.status,
            created_at=r.created_at,
            model_version=r.model_version,
        )
        for r in rows
    ]


@router.patch("/{rec_id}", response_model=RecommendationOut)
def patch_recommendation(
    rec_id: int,
    body: RecommendationPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    r = db.query(Recommendation).filter(Recommendation.id == rec_id).first()
    if not r:
        raise HTTPException(status_code=404)
    if body.status is not None:
        r.status = body.status
    db.commit()
    audit(db, user, "recommendation_update", "recommendation", {"id": rec_id})
    return RecommendationOut(
        id=r.id,
        department_id=r.department_id,
        title=r.title,
        description=r.text,
        priority=r.priority,
        status=r.status,
        created_at=r.created_at,
        model_version=r.model_version,
    )
