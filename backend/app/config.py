"""
app.config
----------
Runtime settings for the Orbit Odyssey NLP backend.

Everything here is overridable through environment variables (or a local
``.env``), but the defaults are the local-development values from
``pr-based-plan/README.md`` -> "Local development setup".
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Origins allowed to call the API / open a WebSocket. The Next.js dev
    # server runs on port 3000.
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    HOST: str = "127.0.0.1"
    PORT: int = 8000


settings = Settings()
