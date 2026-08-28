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
    # Was 100 — raised after benchmarking `injection.classifier`/`injection.similarity`
    # under real dataset load found this *pipeline*-level cap silently overriding
    # each detector's own, higher `timeout_ms`: `allowance = min(own_timeout_ms,
    # remaining_ms)` in pipeline.py means a detector's declared budget is a lie if
    # the shared pipeline ceiling is lower than it. Measured real-world cost for
    # the two model-backed detectors together: ~24ms typical, up to ~133ms on the
    # longest real documents in `deepset/prompt-injections` — 100ms was clipping
    # even ordinary-length inputs into silent, undisclosed degradation. 200ms
    # covers the measured worst case with margin, while staying under
    # `request_budget_ms` below.
    enforcement_budget_ms: int = 200
    detector_timeout_ms: int = 40
    # P3-13: the *request*-level ceiling across every surface a single governed call
    # touches. The per-call budget alone is a comfortable lie — one completion
    # evaluates several messages, the output and every tool call.
    request_budget_ms: int = 250
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
    # MIT, ~86M params, no licence gate — but a real CPU forward pass still
    # costs tens of ms per call versus a regex scan's fractions of one, and every
    # concurrent request pays it independently (P3-6's budget is per-request, not a
    # shared inference queue). Opt-in via `enabled_detectors`, same reasoning as
    # Granite Guardian: a customer must choose the latency/recall trade-off, not
    # inherit it from a default. leolee99/PIGuard, not the more commonly cited
    # protectai/deberta model — see PromptInjectionClassifierDetector's docstring
    # for the benchmarked reason (better recall AND far fewer false positives).
    prompt_injection_classifier_model: str = "leolee99/PIGuard"
    # Apache-2.0, ~22M params — embeds text locally for cosine-similarity matching
    # against `guardrails/data/injection_corpus.json`. Same opt-in reasoning as the
    # classifier above; unlike the classifier, this one improves by editing that
    # corpus file, no retraining required.
    embedding_similarity_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # --- Entitlement (P10) -----------------------------------------------
    # native | openfga. The seam exists because no winner does: customers running
    # OpenFGA or Cedar keep them, and the much larger group who express permissions as
    # "this group can read this folder" get a control they can actually switch on.
    entitlement_engine: str = "native"
    openfga_url: str | None = None
    openfga_store_id: str | None = None
    k_anonymity_threshold: int = 5

    # --- Authentication --------------------------------------------------
    # auto | development | token | oidc
    #
    # `auto` follows `environment`: the unverified identity header is accepted in
    # development and refused everywhere else, including in any environment name we do
    # not recognise. A typo in a deployment variable must not silently open the door.
    auth_mode: str = "auto"

    # --- GitHub connect flow (dashboard "Sign in with GitHub" + repo scan) -----
    # The dashboard's OAuth callback runs the one privileged "find-or-create user and
    # mint a token" call before any user token exists — it authenticates with this
    # shared secret instead. Must match the dashboard's own copy of the same value.
    service_auth_secret: str = "dev-insecure-service-secret"
    # Fernet key encrypting stored GitHub access tokens at rest. `None` means "not
    # configured" — connecting a repo fails closed rather than storing a raw token.
    token_encryption_key: str | None = None

    # --- Action assurance (P9) -------------------------------------------
    # The dialect artefacts are parsed against. Wrong dialect means wrong parse, and
    # a wrong parse fails closed rather than passing through.
    sql_dialect: str = "postgres"
    # P9-7: how fresh a state read must be to authorise an irreversible act.
    verified_state_max_age_seconds: int = 300

    # --- Memory write governance (P14, NOM-RTG-13) -----------------------
    # How long an unverified memory entry survives before it decays — the
    # default-closed counterpart to Suppression's default-open `expires_at`.
    memory_unverified_ttl_seconds: int = 86_400

    # --- Inter-agent message security (P17, NOM-IAM-08) -------------------
    # A signature/nonce older than this is rejected even if it verifies.
    agent_message_validity_seconds: int = 300

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

    # I-11: the providers enterprises actually deploy on. 6 of 11 engineers run Azure
    # OpenAI, 4 Bedrock, 3 Vertex — a governance product that only speaks to
    # api.openai.com is unusable at exactly the companies that need governance.
    azure_openai_endpoint: str | None = None
    azure_openai_api_key: str | None = None
    azure_openai_api_version: str = "2024-10-21"
    azure_openai_deployment: str | None = None
    aws_region: str | None = None
    bedrock_model: str = "anthropic.claude-sonnet-4-20250514-v1:0"
    vertex_project: str | None = None
    vertex_location: str = "us-central1"
    vertex_model: str = "gemini-2.0-flash"
    # I-10: govern through the routing layer teams already run, rather than compete.
    litellm_base_url: str | None = None
    litellm_api_key: str | None = None

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

    # --- Content paths -----------------------------------------------------
    # Packaged *inside* nometria/ (not at the repo root) so `packages =
    # ["src/nometria"]` in pyproject.toml bundles them into the wheel automatically —
    # a repo-root-relative path resolves fine from a source checkout but silently
    # finds nothing once installed (e.g. the Vercel deployment installs from the
    # vendored wheel, not the source tree), which is why the control catalog and
    # baseline policy pack were empty in production despite syncing without error.
    compliance_dir: Path = Path(__file__).resolve().parent / "compliance_data"
    policies_dir: Path = Path(__file__).resolve().parent / "policies_data"

    @property
    def restricted_models_allowed(self) -> bool:
        return self.accept_restricted_model_licenses


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    """Test hook — settings are cached for the process lifetime otherwise."""
    get_settings.cache_clear()
