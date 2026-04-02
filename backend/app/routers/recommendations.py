from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user
from app.models import Recommendation, User, UserRole
from app.schemas import RecommendationOut, RecommendationPatch

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _explainability_fields(r: Recommendation) -> tuple[str, str, str]:
    source = "ml" if (r.model_version and r.model_version != "rules-v2") else "rules"
    sentences = [part.strip() for part in r.text.replace("\n", " ").split(".") if part.strip()]
    rationale = sentences[0] if sentences else r.text[:180]
    expected_effect = (
        "Снижение доли сотрудников в зоне риска и стабилизация ESSI в ближайшие периоды."
        if source == "ml"
        else "Стабилизация динамики ESSI и снижение управленческих рисков по отделу."
    )
    return source, rationale, expected_effect


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
            source=_explainability_fields(r)[0],
            rationale=_explainability_fields(r)[1],
            expected_effect=_explainability_fields(r)[2],
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
    source, rationale, expected_effect = _explainability_fields(r)
    return RecommendationOut(
        id=r.id,
        department_id=r.department_id,
        title=r.title,
        description=r.text,
        priority=r.priority,
        status=r.status,
        created_at=r.created_at,
        model_version=r.model_version,
        source=source,
        rationale=rationale,
        expected_effect=expected_effect,
    )
