from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "KernelLens AI"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "sqlite+aiosqlite:///./kernellens.db"
    
    # LLM Configuration
    GEMINI_API_KEY: Optional[str] = Field(default=None, validation_alias="GEMINI_API_KEY")
    LLM_MODEL: str = "gemini-1.5-flash"
    
    # Anomaly Classifier Settings
    ANOMALY_THRESHOLD: float = 0.65
    CORRELATION_WINDOW_SECONDS: int = 60
    
    # Storage paths
    MODEL_STORAGE_DIR: str = "./backend/app/ml/saved_models"
    DRAIN3_STATE_FILE: str = "./backend/app/pipeline/drain3_state.bin"

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore"
    }


settings = Settings()
