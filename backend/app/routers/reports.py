import os
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user, require_roles
from app.models import JobStatus, ReportExport, User, UserRole
from app.schemas import (
    DashboardResponse,
    ReportCreateRequest,
    ReportExportListItem,
    ReportExportListPage,
    ReportExportOut,
)
from app.services.dashboard import build_dashboard

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    months: int = Query(6, ge=3, le=24, description="Число последних месяцев для ряда ESSI"),
):
    if user.role == UserRole.employee:
        raise HTTPException(status_code=403, detail="Forbidden")
    data = build_dashboard(db, viewer=user, essi_months=months)
    return DashboardResponse.model_validate(data)


@router.post("", response_model=ReportExportOut, status_code=202)
def create_report(
    body: ReportCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    rep = ReportExport(kind=body.kind, status=JobStatus.pending)
    db.add(rep)
    db.commit()
    db.refresh(rep)
    from app.tasks import run_report_export

    background_tasks.add_task(run_report_export, rep.id)
    audit(db, user, "report_requested", "report", {"id": rep.id, "kind": body.kind})
    return ReportExportOut(id=rep.id, kind=rep.kind, status=rep.status.value, download_url=None, detail=None)


@router.get("/exports", response_model=ReportExportListPage)
def list_exports(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    q = db.query(ReportExport)
    total = q.count()
    rows = q.order_by(ReportExport.created_at.desc(), ReportExport.id.desc()).offset(offset).limit(limit).all()
    items = [
        ReportExportListItem(
            id=rep.id,
            kind=rep.kind,
            status=rep.status.value,
            download_url=(
                f"/api/reports/{rep.id}/download"
                if rep.status == JobStatus.success and rep.file_path
                else None
            ),
            detail=rep.detail,
            created_at=rep.created_at,
        )
        for rep in rows
    ]
    return ReportExportListPage(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + limit) < total,
    )


@router.post("/{report_id}/retry", response_model=ReportExportOut, status_code=202)
def retry_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    rep = db.query(ReportExport).filter(ReportExport.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404)
    new_rep = ReportExport(kind=rep.kind, status=JobStatus.pending)
    db.add(new_rep)
    db.commit()
    db.refresh(new_rep)
    from app.tasks import run_report_export

    background_tasks.add_task(run_report_export, new_rep.id)
    audit(
        db,
        user,
        "report_retry",
        "report",
        {"id": report_id, "new_id": new_rep.id, "kind": rep.kind},
    )
    return ReportExportOut(
        id=new_rep.id,
        kind=new_rep.kind,
        status=new_rep.status.value,
        download_url=None,
        detail=None,
    )


@router.get("/{report_id}/download")
def download_report(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    rep = db.query(ReportExport).filter(ReportExport.id == report_id).first()
    if not rep or not rep.file_path or not os.path.isfile(rep.file_path):
        raise HTTPException(status_code=404, detail="File not ready")
    return FileResponse(
        rep.file_path,
        filename=os.path.basename(rep.file_path),
        media_type="application/octet-stream",
    )


@router.get("/exports/{report_id}", response_model=ReportExportOut)
def export_status(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    rep = db.query(ReportExport).filter(ReportExport.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404)
    url = f"/api/reports/{rep.id}/download" if rep.status == JobStatus.success and rep.file_path else None
    return ReportExportOut(
        id=rep.id,
        kind=rep.kind,
        status=rep.status.value,
        download_url=url,
        detail=rep.detail,
    )
