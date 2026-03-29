from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Совпадает со значением по умолчанию secret_key — для проверки «не забыли ли секрет в проде».
INSECURE_DEFAULT_SECRET_KEY = "change-me-in-production-use-env"


def _default_sqlite_url() -> str:
    """Файл всегда в каталоге backend/, не зависит от cwd процесса (иначе seed и uvicorn видят разные БД)."""
    backend_dir = Path(__file__).resolve().parent.parent
    db_path = (backend_dir / "potential.db").resolve()
    return f"sqlite:///{db_path.as_posix()}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Потенциал API"
    debug: bool = False
    secret_key: str = INSECURE_DEFAULT_SECRET_KEY
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # PostgreSQL в Docker/проде: DATABASE_URL в .env. Без переменной — SQLite в backend/potential.db
    database_url: str = Field(default_factory=_default_sqlite_url)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    redis_url: str = "redis://localhost:6379/0"

    mlflow_tracking_uri: str = "file:./mlruns"
    # ИСУР по методике: сумма 25 ответов (5 блоков × 5), макс. 125 баллов → индекс 0–100.
    max_essi_points: float = 125.0
    num_survey_blocks: int = 5

    # True: руководитель не видит ФИО/email/телефон в списках и дашборде (псевдонимы).
    privacy_hide_names_for_managers: bool = False

    # Только для dev: разрешить старт с дефолтным SECRET_KEY при Postgres / POTENTIAL_ENV=production.
    allow_insecure_secret: bool = False


settings = Settings()
