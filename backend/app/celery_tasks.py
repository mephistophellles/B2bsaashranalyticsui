from app.celery_app import celery_app
from app.tasks import process_survey_import, recalculate_indices_task


@celery_app.task(name="surveys.process_import")
def celery_process_survey_import(job_id: int, file_path: str) -> None:
    process_survey_import(job_id, file_path)


@celery_app.task(name="indices.recalculate")
def celery_recalculate() -> None:
    recalculate_indices_task()
