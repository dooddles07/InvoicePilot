from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration.

    Everything here comes from the environment. No secret has a default that
    would work in production -- a missing ``SECRET_KEY`` should stop the
    process, not silently fall back to something guessable.
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    environment: Literal["local", "staging", "production"] = "local"
    debug: bool = False

    # Signing key for access tokens. Required; there is deliberately no default.
    # HS256 derives its strength from key length: below 32 bytes the signature
    # is brute-forceable, so a short key fails at startup rather than warning
    # on every request in production.
    secret_key: str = Field(min_length=32)
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 14

    database_url: PostgresDsn
    redis_url: RedisDsn

    # (cors_origins removed: decision 7 -- FastAPI is private.)

    # Per-identity request ceiling, applied before authentication so an
    # unauthenticated flood cannot exhaust the pool.
    rate_limit_per_minute: int = 120

    # The AI layer is a service, not a dependency of the request path: if the
    # provider is unset the product still works, minus recommendations.
    ai_provider: Literal["anthropic", "openai", "disabled"] = "disabled"
    ai_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Settings are read once per process and cached."""
    return Settings()  # type: ignore[call-arg]
