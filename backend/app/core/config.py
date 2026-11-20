from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""
    anthropic_api_key: str = ""
    vision_model: str = "claude-sonnet-5-5"
    chat_model: str = "claude-sonnet-5-5"
    usda_api_key: str = ""
    cors_origins: str = "http://localhost:8081"
    rate_limit_default: str = "60/minute"
    rate_limit_ai: str = "10/minute"
    max_upload_mb: int = 8
    allow_dev_tier_switch: bool = False
    # Optional no-login mode: when set, requests without a token act as this Supabase user id.
    # Everyone without a login then shares that one account's data. Leave empty in real production.
    guest_user_id: str = ""

    @property
    def is_prod(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
