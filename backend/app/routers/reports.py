import os
import tempfile
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import audit, get_current_user, require_roles
from app.models import JobStatus, ManagementEvent, ReportExport, User, UserRole
from app.schemas import (
    DashboardResponse,
    ManagementEventCreate,
    ManagementEventOut,
    ManagementEventPatch,
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


@router.get("/events", response_model=list[ManagementEventOut])
def list_management_events(
    months: int = Query(6, ge=1, le=36),
    event_type: str | None = Query(None),
    level: str | None = Query(None, pattern="^(organization|department)$"),
    department_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    q = db.query(ManagementEvent)
    if event_type:
        q = q.filter(ManagementEvent.event_type == event_type)
    if level:
        q = q.filter(ManagementEvent.level == level)
    if department_id is not None:
        q = q.filter(ManagementEvent.department_id == department_id)
    rows = q.order_by(ManagementEvent.event_date.desc(), ManagementEvent.id.desc()).limit(months * 10).all()
    return [ManagementEventOut.model_validate(r) for r in rows]


@router.post("/events", response_model=ManagementEventOut, status_code=201)
def create_management_event(
    body: ManagementEventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    if body.level == "department" and body.department_id is None:
        raise HTTPException(status_code=400, detail="department_id required for department level")
    row = ManagementEvent(
        event_date=body.event_date,
        event_type=body.event_type,
        title=body.title.strip(),
        description=body.description,
        level=body.level,
        department_id=body.department_id,
        created_by_user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    audit(db, user, "management_event_create", "management_event", {"id": row.id})
    return ManagementEventOut.model_validate(row)


@router.patch("/events/{event_id}", response_model=ManagementEventOut)
def patch_management_event(
    event_id: int,
    body: ManagementEventPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    row = db.query(ManagementEvent).filter(ManagementEvent.id == event_id).first()
    if not row:
        raise HTTPException(status_code=404)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    if row.level == "department" and row.department_id is None:
        raise HTTPException(status_code=400, detail="department_id required for department level")
    db.commit()
    db.refresh(row)
    audit(db, user, "management_event_update", "management_event", {"id": row.id})
    return ManagementEventOut.model_validate(row)


@router.delete("/events/{event_id}", status_code=204)
def delete_management_event(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    row = db.query(ManagementEvent).filter(ManagementEvent.id == event_id).first()
    if not row:
        raise HTTPException(status_code=404)
    db.delete(row)
    db.commit()
    audit(db, user, "management_event_delete", "management_event", {"id": event_id})
    return None


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


@router.get("/demo-template")
def download_demo_template(
    user: User = Depends(require_roles(UserRole.manager, UserRole.admin)),
):
    rows = [
        {
            "employee_id": 1,
            "survey_date": datetime.utcnow().date().isoformat(),
            "score_block1": 18,
            "score_block2": 16,
            "score_block3": 14,
            "score_block4": 17,
            "score_block5": 19,
        },
        {
            "employee_id": 2,
            "survey_date": datetime.utcnow().date().isoformat(),
            "score_block1": 22,
            "score_block2": 21,
            "score_block3": 20,
            "score_block4": 23,
            "score_block5": 22,
        },
        {
            "employee_id": 3,
            "survey_date": datetime.utcnow().date().isoformat(),
            "score_block1": 12,
            "score_block2": 10,
            "score_block3": 11,
            "score_block4": 13,
            "score_block5": 12,
        },
    ]
    tmpdir = os.path.join(tempfile.gettempdir(), "potential_reports")
    os.makedirs(tmpdir, exist_ok=True)
    filename = f"survey_import_template_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    path = os.path.join(tmpdir, filename)
    pd.DataFrame(rows).to_excel(path, index=False)
    return FileResponse(
        path,
        filename="survey_import_template.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


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
