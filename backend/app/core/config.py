"""Application configuration.

Values come from environment variables (and an optional ``.env`` file).
Secrets are never hard-coded: ``SECRET_KEY`` must be supplied in production.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_name: str = "Family Finance Manager"
    environment: str = "development"
    api_prefix: str = "/api/v1"

    # Security
    secret_key: str = "dev-only-insecure-secret-key-change-me-please-123456"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    max_login_attempts: int = 5
    login_lockout_minutes: int = 15
    password_min_length: int = 8

    # Database. PostgreSQL in Docker Compose; the SQLite fallback exists only so
    # the app can be started for local evaluation without PostgreSQL installed.
    database_url: str = "sqlite:///./family_finance_dev.db"
    sql_echo: bool = False

    # Files
    upload_dir: str = str(Path(__file__).resolve().parents[3] / "backups" / "uploads")
    max_upload_mb: int = 10
    allowed_upload_types: tuple[str, ...] = (
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
    )

    # CORS (frontend is normally served same-origin by nginx, but the Vite dev
    # server needs explicit origins).
    backend_cors_origins: str = (
        "http://localhost:8080,http://localhost:5173,http://127.0.0.1:5173"
    )

    @field_validator("secret_key")
    @classmethod
    def _reject_short_secret(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
