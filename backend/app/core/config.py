from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://jpeclearner:jpeclearner@db:5432/jpeclearner"

    jwt_secret_key: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    image_storage_path: str = "/data/images"
    max_image_size_bytes: int = 8 * 1024 * 1024

    cors_origins: str = "http://localhost:5173"

    # Symmetric secret used to encrypt user-supplied LLM API keys at rest
    # (see app/core/crypto.py). Must be set to a stable, private value in
    # production -- rotating it makes previously stored keys undecryptable.
    llm_key_secret: str = "dev-llm-secret-change-me"

    # Self-hosted OCR microservice (see ocr_service/), reached over the
    # docker-compose network.
    ocr_service_url: str = "http://ocr:8090"

    # Cloudflare R2 (S3-compatible) bucket that OCR source photos are
    # uploaded to, kept separate from the local-disk card/lesson image
    # storage above.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "jpeclearner-ocr-scans"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def r2_endpoint_url(self) -> str:
        return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"


settings = Settings()
