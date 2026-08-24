"""FastAPI application — inline gateway + control-plane API.

One process serves both surfaces, which is a deployment choice rather than an
architectural one: it keeps the self-host story to a single container (NFR-4, X-8),
and the gateway is stateless so it scales out horizontally (NFR-3).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import __version__
from ..compliance.catalog import load_catalog
from ..config import get_settings
from ..db import init_db
from ..guardrails import all_detectors, available_detectors
from ..providers import all_providers, available_providers
from .deps import current_user, db
from .routes import (
    answerability,
    entitlement,
    escalation,
    evaluation,
    governance,
    inline,
    integrations,
    onboarding,
    policy,
    provenance,
    registry,
    tuning,
)

log = logging.getLogger(__name__)


def _load_demo_fixtures() -> None:
    """Re-register the offline provider's scripted replies when a seeded DB is present.

    Purely a demo affordance, and scoped to exactly that: the scripts live in the
    `echo` provider's process memory, so a server started after `nometria seed` would
    otherwise lose them and the walkthrough would not reproduce over HTTP. Guarded on
    the seeded suite existing so a real deployment never picks up fixture text.
    """
    try:
        from sqlalchemy import select

        from ..db import session_scope
        from ..models import EvalSuite
        from ..seed import register_scripts

        with session_scope() as session:
            if session.scalar(select(EvalSuite).where(EvalSuite.key == "support-quality")):
                register_scripts()
                log.info("demo fixtures detected — offline provider scripts registered")
    except Exception as exc:  # never let a fixture concern break startup
        log.debug("demo fixture load skipped: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _load_demo_fixtures()
    settings = get_settings()
    log.info(
        "Nometria %s starting — provider=%s policy_engine=%s mode=%s egress=%s",
        __version__,
        settings.default_provider,
        settings.policy_engine,
        settings.default_policy_mode,
        settings.allow_egress,
    )
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Nometria Control Plane",
        version=__version__,
        description=(
            "Agent-native, vendor-neutral governance, security and compliance for AI "
            "agents in production. Inline enforcement under /v1, control plane under /api."
        ),
        lifespan=lifespan,
    )

    # The dashboard is a client of this API (X-5). In self-host it is same-origin or
    # localhost; nothing here opens the control plane to the internet by itself.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "X-Nometria-Trace",
            "X-Nometria-Verdict",
            "X-Nometria-Effective-Verdict",
            "X-Nometria-Decision",
            "X-Nometria-Mode",
            "X-Nometria-Latency-Ms",
        ],
    )

    app.include_router(inline.router)
    app.include_router(registry.router)
    app.include_router(policy.router)
    app.include_router(evaluation.router)
    app.include_router(governance.router)
    app.include_router(tuning.router)
    app.include_router(escalation.router)
    app.include_router(answerability.router)
    app.include_router(onboarding.router)
    app.include_router(provenance.router)
    app.include_router(entitlement.router)
    app.include_router(integrations.router)

    @app.get("/api/health", tags=["platform"])
    def health() -> dict[str, Any]:
        return {"status": "ok", "version": __version__}

    @app.get("/api/version", tags=["platform"])
    def version() -> dict[str, Any]:
        """Every version that participates in a decision (X-4 determinism)."""
        settings = get_settings()
        catalog = load_catalog()
        return {
            "code_version": __version__,
            "catalog_version": catalog.get("version"),
            "catalog_review_status": catalog.get("review_status"),
            "policy_engine": settings.policy_engine,
            "default_provider": settings.default_provider,
            "default_policy_mode": settings.default_policy_mode,
            "fail_mode": settings.fail_mode,
            "enforcement_budget_ms": settings.enforcement_budget_ms,
            "detector_versions": {k: d.version for k, d in all_detectors().items()},
            "egress_allowed": settings.allow_egress,
        }

    @app.get("/api/detectors", tags=["platform"])
    def detectors(session: Session = Depends(db), _u=Depends(current_user)) -> dict[str, Any]:
        """P3-11 — which detectors exist, which are live, and how fast they are."""
        from sqlalchemy import func, select

        from ..models import DetectorRun

        stats: dict[str, dict[str, Any]] = {}
        rows = session.execute(
            select(
                DetectorRun.detector_key,
                func.count(),
                func.avg(DetectorRun.duration_ms),
                func.max(DetectorRun.duration_ms),
            ).group_by(DetectorRun.detector_key)
        ).all()
        for key, count, avg_ms, max_ms in rows:
            stats[key] = {
                "runs": int(count),
                "avg_ms": round(float(avg_ms or 0), 3),
                "max_ms": round(float(max_ms or 0), 3),
            }

        available = available_detectors()
        # Why the OSS-wrapped and licence-restricted detectors aren't live here —
        # shown in the UI so "not installed" doesn't read as a bug. The native
        # detectors (injection.heuristic, pii.native, safety.lexicon, schema.json,
        # secrets.native) need none of this and are always available.
        unavailable_reason = {
            "pii.presidio": (
                "Wrapped Microsoft Presidio, pulled in with spaCy and numpy — "
                "~170MB, which doesn't fit this deployment's Vercel serverless "
                "function size budget alongside the rest of the app. Available in "
                "the self-hosted docker-compose deployment: pip install "
                "'nometria[presidio]'."
            ),
            "rails.guardrails_ai": (
                "Wrapped Guardrails AI. Core is Apache-2.0, but individual Guardrails "
                "Hub validators carry their own licences that must be checked before "
                "shipping, so none is enabled by default in any deployment."
            ),
            "rails.nemo": (
                "Wrapped NVIDIA NeMo Guardrails — needs both the nemoguardrails "
                "package and a Colang rails config, neither shipped by default."
            ),
            "safety.granite": (
                "Wrapped IBM Granite Guardian, via transformers — needs the model "
                "weights downloaded ahead of time (never fetched at request time); "
                "not present in this deployment's function image."
            ),
            "safety.restricted": (
                "Meta Llama Guard / Google ShieldGemma — capable, but their licences "
                "aren't OSI-approved (usage restrictions, a MAU clause), so this stays "
                "opt-in only via NOMETRIA_ACCEPT_RESTRICTED_MODEL_LICENSES=1, "
                "regardless of deployment."
            ),
        }
        return {
            "detectors": [
                {
                    "key": key,
                    "version": detector.version,
                    "surfaces": list(detector.surfaces),
                    "available": key in available,
                    "enabled": key in get_settings().enabled_detectors,
                    "unavailable_reason": None if key in available else unavailable_reason.get(key),
                    "stats": stats.get(key, {}),
                }
                for key, detector in sorted(all_detectors().items())
            ],
            "budget_ms": get_settings().enforcement_budget_ms,
            "detector_timeout_ms": get_settings().detector_timeout_ms,
        }

    @app.get("/api/reliability", tags=["platform"])
    def reliability(session: Session = Depends(db), _u=Depends(current_user)) -> dict[str, Any]:
        """P15 — circuit-breaker state and live budget consumption."""
        from sqlalchemy import select

        from ..models import Agent, Budget
        from ..reliability import BREAKER, check_budget

        budgets = []
        for budget in session.scalars(select(Budget).where(Budget.scope_type == "agent")):
            agent = session.get(Agent, budget.scope_id)
            verdict = check_budget(session, "agent", budget.scope_id)
            budgets.append({"agent": agent.slug if agent else budget.scope_id, **verdict.to_json()})
        return {
            "circuit_breakers": BREAKER.snapshot(),
            "budgets": budgets,
            "fallback_chain": get_settings().fallback_chain,
        }

    @app.post("/api/_backfill_scan_copy", tags=["platform"])
    def backfill_scan_copy(session: Session = Depends(db), _u=Depends(current_user)) -> dict[str, Any]:
        """One-off: rewrite pre-existing scan-generated name/description/purpose text
        to the shorter, non-repetitive wording — new scans already produce it, this
        catches rows created before that fix. Idempotent (only touches rows still
        matching the old pattern); safe to remove once run in each environment."""
        import re

        from ..models import Agent, Policy

        name_re = re.compile(r"^Baseline guardrails for (?P<framework>.+) \((?P<repo>.+)\)$")
        purpose_re = re.compile(r"^Detected by scanning (?P<repo>.+) \(\d+ governable site\(s\)\)\.$")

        policies_fixed = 0
        for p in session.scalars(select(Policy).where(Policy.key.like("scan-%"))):
            m = name_re.match(p.name)
            if not m:
                continue
            framework, repo = m.group("framework"), m.group("repo")
            p.name = f"{framework} guardrails"
            p.description = (
                f"Detects {framework} usage in {repo} — prompt injection, PII/secret "
                f"leaks, and unsafe tool actions."
            )
            policies_fixed += 1

        agents_fixed = 0
        for a in session.scalars(select(Agent)):
            if purpose_re.match(a.purpose or ""):
                a.purpose = ""
                agents_fixed += 1

        session.flush()
        return {"policies_fixed": policies_fixed, "agents_fixed": agents_fixed}

    @app.get("/metrics", tags=["platform"], response_class=PlainTextResponse)
    def metrics(session: Session = Depends(db)) -> str:
        """I-7 — Prometheus exposition.

        Unauthenticated on purpose, like every other /metrics endpoint: a scrape job
        that needs a bearer token is a scrape job nobody configures. It exposes counts
        and rates, never content — no prompt, no finding detail, no identifier.
        """
        from ..integrations.prometheus import render_metrics

        return render_metrics(session)

    @app.get("/api/providers", tags=["platform"])
    def providers(_u=Depends(current_user)) -> dict[str, Any]:
        """X-2 — the neutrality surface, made inspectable."""
        available = available_providers()
        return {
            "providers": [
                {
                    "key": key,
                    "available": key in available,
                    "default": key == get_settings().default_provider,
                }
                for key in sorted(all_providers())
            ],
            "note": (
                "Hosted providers report unavailable unless NOMETRIA_ALLOW_EGRESS=1 and "
                "a key is configured. Zero egress is the default (NFR-4)."
            ),
        }

    return app


app = create_app()
