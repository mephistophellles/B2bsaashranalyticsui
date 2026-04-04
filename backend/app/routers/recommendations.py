from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user
from app.models import Recommendation, User, UserRole
from app.schemas import RecommendationOut, RecommendationPatch
from app.services.explainability import build_recommendation_explainability

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("", response_model=list[RecommendationOut])
def list_recommendations(
    dept: int | None = None,
    status: str | None = None,
    priority: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    query = db.query(Recommendation)
    if dept is not None:
        query = query.filter(Recommendation.department_id == dept)
    if status:
        query = query.filter(Recommendation.status == status)
    if priority:
        query = query.filter(Recommendation.priority == priority)
    if q:
        query = query.filter(
            Recommendation.title.contains(q) | Recommendation.text.contains(q)
        )
    rows = query.order_by(Recommendation.created_at.desc(), Recommendation.id.desc()).all()
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
            **build_recommendation_explainability(r, audience="manager"),
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
        **build_recommendation_explainability(r, audience="manager"),
    )
