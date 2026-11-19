from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Zevkar.ai"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    FRONTEND_BASE_URL: str = "http://localhost:3000"
    
    # Environment & Secrets
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "doctor_super_secret_jwt_key_change_in_production_min32chars"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ALGORITHM: str = "HS256"
    
    # Database (PostgreSQL)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/automation_doctor"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    
    # Redis & Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    
    # Gemini AI
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-4-hydrogen"

    # n8n Monitoring, Sync & Safety Settings
    DEFAULT_STUCK_EXECUTION_SECONDS: int = 900
    LONG_RUNNING_EXECUTION_SECONDS: int = 14400
    N8N_SYNC_BATCH_LIMIT: int = 100
    N8N_MAX_SYNC_PAGES: int = 20
    N8N_MAX_RETRIES: int = 3
    N8N_WATERMARK_OVERLAP_SECONDS: int = 300
    N8N_INFLIGHT_REFRESH_LIMIT: int = 25
    RECOVERY_VERIFICATION_TIMEOUT_SECONDS: int = 300
    ALLOW_PRIVATE_INTEGRATION_URLS: bool = False
    INTEGRATION_ENCRYPTION_KEY: Optional[str] = None
    WEBHOOK_SIGNING_SECRET: Optional[str] = None
    ALERT_DELIVERY_TIMEOUT_SECONDS: float = 5.0
    ALERT_DELIVERY_MAX_RETRIES: int = 3
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_USE_TLS: bool = True
    SMTP_FROM_EMAIL: Optional[str] = None
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://zevkar.ai",
        "https://www.zevkar.ai",
        "https://ais-dev-fsp2wofpeljelapitajfxe-828995474733.asia-northeast1.run.app",
    ]
    
    # Observability
    ENABLE_PROMETHEUS: bool = True
    SENTRY_DSN: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
