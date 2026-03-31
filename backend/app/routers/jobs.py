from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Job, User
from app.schemas import JobListPage, JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=JobListPage)
def list_jobs(
    kind: str | None = Query(None),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Job)
    if kind:
        q = q.filter(Job.kind == kind)
    total = q.count()
    rows = q.order_by(Job.created_at.desc(), Job.id.desc()).offset(offset).limit(limit).all()
    items = [
        JobOut(
            id=job.id,
            kind=job.kind,
            status=job.status.value,
            detail=job.detail,
            created_at=job.created_at,
            finished_at=job.finished_at,
        )
        for job in rows
    ]
    return JobListPage(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + limit) < total,
    )


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404)
    return JobOut(
        id=job.id,
        kind=job.kind,
        status=job.status.value,
        detail=job.detail,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )
