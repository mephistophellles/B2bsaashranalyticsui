from app.celery_app import celery_app
from app.tasks import process_survey_import, recalculate_indices_task


@celery_app.task(name="surveys.process_import")
def celery_process_survey_import(
    job_id: int,
    file_path: str,
    notify_user_id: int | None = None,
    campaign_id: int | None = None,
) -> None:
    process_survey_import(job_id, file_path, notify_user_id, campaign_id)


@celery_app.task(name="indices.recalculate")
def celery_recalculate() -> None:
    recalculate_indices_task()
