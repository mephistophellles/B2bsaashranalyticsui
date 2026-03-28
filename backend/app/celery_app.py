import os

from celery import Celery

from app.config import settings

redis_url = settings.redis_url
celery_app = Celery(
    "potential",
    broker=redis_url,
    backend=redis_url,
    include=["app.celery_tasks"],
)

celery_app.conf.task_routes = {"app.celery_tasks.*": {"queue": "celery"}}

import app.celery_tasks  # noqa: E402,F401 — register tasks
