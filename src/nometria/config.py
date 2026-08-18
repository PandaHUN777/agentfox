"""Runtime configuration.

Defaults are deliberately offline-first (X-3 / NFR-9): no API key, no downloaded
weights, no network egress. Every upgrade to a hosted model or a wrapped OSS
classifier is configuration, never a rewrite.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NOMETRIA_", extra="ignore")

    # --- Persistence -----------------------------------------------------
    database_url: str = f"sqlite:///{REPO_ROOT / 'nometria.db'}"
    sql_echo: bool = False

    # --- Deployment ------------------------------------------------------
    org_id: str = "org_default"
    environment: str = "development"
    # NFR-4: zero egress by default. Nothing leaves the customer boundary unless
    # this is explicitly turned on.
    allow_egress: bool = False

    # --- Enforcement (Pillar 3) -----------------------------------------
    # NFR-1: hard budget for the whole pre-flight pipeline, and per detector.
    enforcement_budget_ms: int = 100
    detector_timeout_ms: int = 40
    # R3: observe-by-default. Enforcement is something a customer turns on
    # deliberately, after simulating it (P2-7).
    default_policy_mode: str = "observe"  # observe | enforce
    # P3-7: what happens when a detector errors or blows its budget.
    fail_mode: str = "open"  # open | closed

    # --- Cost & reliability (P15) ----------------------------------------
    # Degradation ladder, preferred-first. Empty means no fallback: fail rather than
    # silently serve from a model the agent was never evaluated against.
    fallback_chain: list[str] = []
    breaker_failure_threshold: int = 5
    breaker_recovery_seconds: float = 30.0

    # --- Streaming (PL-1) ------------------------------------------------
    # `buffered` enforces output identically to the non-streaming path at the cost of
    # first-token latency. `windowed` preserves latency but cannot recall content it
    # has already forwarded. Buffered is the default deliberately.
    streaming_mode: str = "buffered"  # buffered | windowed
    stream_window_chars: int = 200

    # --- Detectors -------------------------------------------------------
    enabled_detectors: list[str] = [
        "injection.heuristic",
        "pii.native",
        "secrets.native",
        "safety.lexicon",
        "schema.json",
    ]
    # Appendix A.4: restricted-licence model adapters refuse to load without this.
    accept_restricted_model_licenses: bool = False
    granite_guardian_model: str = "ibm-granite/granite-guardian-3.0-2b"

    # --- Policy engine (Pillar 6) ---------------------------------------
    policy_engine: str = "native"  # native | opa
    opa_url: str = "http://localhost:8181"

    # --- Providers (X-2) -------------------------------------------------
    # `echo` is the offline provider: deterministic, no network, no key. It is what
    # makes the whole system demonstrable with `docker compose up` and nothing else.
    default_provider: str = "echo"
    openai_base_url: str = "https://api.openai.com"
    anthropic_base_url: str = "https://api.anthropic.com"
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None

    # --- Observability correlation (I-4 / I-6) ---------------------------
    # Correlation itself needs none of these: the join key travels in-band on a
    # traceparent or vendor header, so a team gets the link with zero configuration.
    # These only govern the optional write-back of our verdict onto their run.
    correlation_push: bool = False
    correlation_timeout_seconds: float = 2.0
    langsmith_api_url: str = "https://api.smith.langchain.com"
    langsmith_ui_url: str = "https://smith.langchain.com"
    langsmith_api_key: str | None = None
    langsmith_project: str | None = None
    langfuse_host: str = "https://cloud.langfuse.com"
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_project: str | None = None

    # --- Evaluation (Pillar 4) ------------------------------------------
    eval_runner: str = "native"  # native | promptfoo
    promptfoo_bin: str = "promptfoo"
    online_eval_sample_rate: float = 0.25
    drift_psi_threshold: float = 0.2

    # --- Audit (Pillar 5) ------------------------------------------------
    audit_signing_key: str = "dev-insecure-checkpoint-key"
    audit_checkpoint_interval: int = 100
    # P5-5 / R8: the audit log must not become a new PII liability.
    redact_at_capture: bool = True
    evidence_dir: Path = REPO_ROOT / "var" / "evidence"

    # --- Content paths ---------------------------------------------------
    compliance_dir: Path = REPO_ROOT / "compliance"
    policies_dir: Path = REPO_ROOT / "policies"

    @property
    def restricted_models_allowed(self) -> bool:
        return self.accept_restricted_model_licenses


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    """Test hook — settings are cached for the process lifetime otherwise."""
    get_settings.cache_clear()
