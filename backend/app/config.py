from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Потенциал API"
    debug: bool = False
    secret_key: str = "change-me-in-production-use-env"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # Override with PostgreSQL in production / Docker: postgresql+psycopg2://user:pass@host:5432/potential
    database_url: str = "sqlite:///./potential.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    redis_url: str = "redis://localhost:6379/0"

    mlflow_tracking_uri: str = "file:./mlruns"
    max_essi_points: float = 25.0
    num_survey_blocks: int = 5


settings = Settings()
