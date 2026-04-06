from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user
from app.models import Recommendation, RecommendationFeedback, User, UserRole
from app.schemas import (
    RecommendationFeedbackIn,
    RecommendationFeedbackOut,
    RecommendationOut,
    RecommendationPatch,
)
from app.services.explainability import build_recommendation_explainability

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _feedback_stats(db: Session, rec_id: int) -> tuple[int, str | None]:
    rows = (
        db.query(RecommendationFeedback)
        .filter(RecommendationFeedback.recommendation_id == rec_id)
        .order_by(RecommendationFeedback.created_at.desc(), RecommendationFeedback.id.desc())
        .all()
    )
    return len(rows), (rows[0].result if rows else None)


def _to_out(db: Session, r: Recommendation) -> RecommendationOut:
    count, last_result = _feedback_stats(db, r.id)
    return RecommendationOut(
        id=r.id,
        department_id=r.department_id,
        title=r.title,
        description=r.text,
        priority=r.priority,
        status=r.status,
        created_at=r.created_at,
        model_version=r.model_version,
        feedback_count=count,
        last_feedback_result=last_result,
        **build_recommendation_explainability(r, audience="manager"),
    )


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
    return [_to_out(db, r) for r in rows]


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
    return _to_out(db, r)


@router.get("/{rec_id}/feedback", response_model=list[RecommendationFeedbackOut])
def list_recommendation_feedback(
    rec_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    rec = db.query(Recommendation).filter(Recommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404)
    rows = (
        db.query(RecommendationFeedback)
        .filter(RecommendationFeedback.recommendation_id == rec_id)
        .order_by(RecommendationFeedback.created_at.desc(), RecommendationFeedback.id.desc())
        .all()
    )
    return [RecommendationFeedbackOut.model_validate(row) for row in rows]


@router.post("/{rec_id}/feedback", response_model=RecommendationFeedbackOut, status_code=201)
def create_recommendation_feedback(
    rec_id: int,
    body: RecommendationFeedbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    rec = db.query(Recommendation).filter(Recommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404)
    row = RecommendationFeedback(
        recommendation_id=rec_id,
        user_id=user.id,
        status=body.status or rec.status or "Новая",
        result=body.result,
        comment=(body.comment or "").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    audit(
        db,
        user,
        "recommendation_feedback_create",
        "recommendation_feedback",
        {"id": row.id, "recommendation_id": rec_id},
    )
    return RecommendationFeedbackOut.model_validate(row)
