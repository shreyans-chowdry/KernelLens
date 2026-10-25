import os
from typing import List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings

# backend/app — used to locate bundled files no matter which directory uvicorn is started from
_APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Settings(BaseSettings):
    PROJECT_NAME: str = "KernelLens AI"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "postgresql+asyncpg://shreyanschowdry@localhost:5432/kernellens"

    # LLM Configuration (the key is read from the environment / .env only; never commit it)
    GEMINI_API_KEY: Optional[str] = Field(default=None, validation_alias="GEMINI_API_KEY")
    LLM_MODEL: str = "gemini-3.5-flash"
    # Max LLM analyses per minute across the whole server, so a public deployment
    # cannot be used to burn through the Gemini quota. 0 disables the limit.
    ANALYZE_RATE_LIMIT_PER_MIN: int = 6

    # Comma-separated list of browser origins allowed to call the API, e.g.
    # "https://kernellens.vercel.app,http://localhost:3000". "*" allows any origin.
    CORS_ORIGINS: str = "*"

    # Anomaly Classifier Settings
    ANOMALY_THRESHOLD: float = 0.65
    CORRELATION_WINDOW_SECONDS: int = 60

    # Storage paths
    MODEL_STORAGE_DIR: str = os.path.join(_APP_DIR, "ml", "saved_models")
    DRAIN3_STATE_FILE: str = os.path.join(_APP_DIR, "pipeline", "drain3_state.bin")

    model_config = {
        "env_file": [".env", "backend/.env"],
        "case_sensitive": True,
        "extra": "ignore",
    }

    @field_validator("DATABASE_URL")
    @classmethod
    def _async_driver(cls, v: str) -> str:
        """
        Hosting providers (Render, Neon, Supabase, Railway) hand out plain
        postgres:// URLs, often with ?sslmode=require. SQLAlchemy's async engine
        needs the asyncpg driver, and asyncpg spells the SSL option `ssl`.
        """
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        if v.startswith("postgresql+asyncpg://"):
            v = v.replace("sslmode=", "ssl=").replace("&channel_binding=require", "").replace("channel_binding=require&", "")
        return v

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()] or ["*"]


settings = Settings()
