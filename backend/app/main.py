import logging
import os
import sys
import uuid
import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from app.bootstrap import ensure_local_demo_accounts, ensure_organization_settings_row
from app.config import INSECURE_DEFAULT_SECRET_KEY, settings
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
    search,
    surveys,
)


def _should_warn_insecure_secret() -> bool:
    if settings.secret_key != INSECURE_DEFAULT_SECRET_KEY:
        return False
    url = settings.database_url.lower()
    if "postgresql" in url or "postgres" in url:
        return True
    return os.environ.get("POTENTIAL_ENV", "").lower() == "production"


def _abort_if_insecure_secret_in_prod() -> None:
    if settings.secret_key != INSECURE_DEFAULT_SECRET_KEY:
        return
    if settings.allow_insecure_secret:
        return
    url = settings.database_url.lower()
    prodish = (
        "postgresql" in url
        or "postgres" in url
        or os.environ.get("POTENTIAL_ENV", "").lower() == "production"
    )
    if not prodish:
        return
    logging.getLogger("uvicorn.error").error(
        "Отказ запуска: дефолтный SECRET_KEY при PostgreSQL или POTENTIAL_ENV=production. "
        "Задайте SECRET_KEY или (только для разработки) ALLOW_INSECURE_SECRET=true."
    )
    sys.exit(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _abort_if_insecure_secret_in_prod()
    if settings.run_create_all:
        Base.metadata.create_all(bind=engine)
    ensure_organization_settings_row()
    ensure_local_demo_accounts()
    if _should_warn_insecure_secret():
        warnings.warn(
            "SECRET_KEY не задан: задайте переменную окружения SECRET_KEY для продакшена.",
            stacklevel=1,
        )
        logging.getLogger("uvicorn.error").warning(
            "SECRET_KEY default — задайте SECRET_KEY в окружении."
        )
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

_req_log = logging.getLogger("api.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:12]
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        uid = getattr(request.state, "user_id", None)
        _req_log.info(
            "%s %s -> %s user_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            uid,
            extra={"request_id": rid, "user_id": uid},
        )
        return response


app.add_middleware(RequestContextMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    messages: list[str] = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", []) if part != "body")
        msg = str(err.get("msg", "Некорректный запрос"))
        messages.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse(status_code=422, content={"detail": "; ".join(messages)})

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
app.include_router(search.router, prefix="/api")

# Middleware must be registered before the app starts (not inside on_event startup).
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/health")
def health():
    return {"status": "ok"}
