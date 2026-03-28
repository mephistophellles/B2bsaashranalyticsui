from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import settings
from app.database import Base, engine
from app.routers import (
    admin,
    audit,
    auth,
    consent,
    departments,
    economy,
    employees,
    indices_mgmt,
    jobs,
    me,
    organization,
    recommendations,
    reports,
    surveys,
)

app = FastAPI(title=settings.app_name, version="1.0.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(me.router, prefix="/api")
app.include_router(employees.router, prefix="/api")
app.include_router(departments.router, prefix="/api")
app.include_router(organization.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(surveys.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(indices_mgmt.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(economy.router, prefix="/api")
app.include_router(consent.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(audit.router, prefix="/api")

# Middleware must be registered before the app starts (not inside on_event startup).
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}
