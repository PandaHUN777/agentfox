"""The one-liner. `import nometria; nometria.auto()` and an existing app is governed.

Every integration surface built so far asks the developer to change how they call the
model: use our SDK, decorate the node, point at the gateway. Each is a small ask, and
the sum of small asks is why governance tooling sits in a proof-of-concept for six
months. The measured version of this: eleven of eleven engineers use LangGraph, and
not one of them adopted a governance product — they hand-rolled a wrapper, because a
wrapper they wrote is cheaper than a migration they have to justify.

So this module patches the client libraries in place. The developer adds one line at
startup and every existing `client.chat.completions.create(...)` in the codebase is
governed, traced and audited without any of them being touched.

What is deliberately *not* done here:

* **No enforcement by default.** `auto()` starts in observe mode. A library that
  silently starts blocking production traffic on an import is indefensible, however
  correct its policy. Enforcement is `auto(mode="enforce")`, typed deliberately.
* **No silent failure.** If patching fails — a version we do not recognise, an SDK
  that moved its internals — we say so and leave the client alone. A governance layer
  that quietly stops governing is the failure mode this product exists to prevent, so
  it must never be one we ship.
* **No re-entrancy.** Patching twice, or governing our own internal model calls, would
  double-count spend and recurse. Guarded explicitly.

Everything is import-guarded: a codebase with only `anthropic` installed never sees an
OpenAI import error, and `auto()` on a machine with neither still succeeds — it simply
reports that there was nothing to patch, which is information rather than failure.
"""

from __future__ import annotations

import atexit
import contextvars
import functools
import logging
import os
import sys
from dataclasses import dataclass, field
from typing import Any

from .config import get_settings
from .db import init_db, session_scope
from .enforcement import Enforcer
from .registry.service import register_agent

log = logging.getLogger(__name__)

#: Guards against governing the model calls the platform makes for itself — an
#: LLM-as-judge call inside an eval would otherwise be traced as agent traffic and
#: charged against the agent's budget.
_IN_NOMETRIA: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "nometria_internal", default=False
)

_STATE: AutoState | None = None


@dataclass
class PatchResult:
    library: str
    patched: bool
    detail: str = ""
    version: str | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "library": self.library,
            "patched": self.patched,
            "detail": self.detail,
            "version": self.version,
        }


@dataclass
class AutoState:
    """What `auto()` did, so a developer can see it rather than trust it."""

    agent: str
    mode: str
    environment: str
    patches: list[PatchResult] = field(default_factory=list)
    frameworks: list[str] = field(default_factory=list)
    calls_governed: int = 0
    started: bool = False
    #: Groups turns into a conversation. Without one every exchange looks like a
    #: separate single-turn conversation, and turn-depth and repeated-failure
    #: conditions can never fire.
    session_id: str | None = None

    @property
    def active(self) -> bool:
        return any(p.patched for p in self.patches)

    def to_json(self) -> dict[str, Any]:
        return {
            "agent": self.agent,
            "mode": self.mode,
            "environment": self.environment,
            "active": self.active,
            "patches": [p.to_json() for p in self.patches],
            "frameworks": self.frameworks,
            "calls_governed": self.calls_governed,
        }

    def summary(self) -> str:
        """One paragraph a developer reads once and never again."""
        patched = [p.library for p in self.patches if p.patched]
        skipped = [p for p in self.patches if not p.patched]
        lines = [
            f"Nometria is governing '{self.agent}' in {self.mode} mode ({self.environment}).",
        ]
        if patched:
            lines.append(f"  Patched: {', '.join(patched)}")
        else:
            lines.append(
                "  Nothing patched — no supported client library was importable. "
                "Install openai or anthropic, or use the SDK directly."
            )
        for result in skipped:
            lines.append(f"  Skipped {result.library}: {result.detail}")
        if self.frameworks:
            lines.append(f"  Detected: {', '.join(self.frameworks)}")
        if self.mode == "observe":
            lines.append(
                "  Observe mode: decisions are recorded, nothing is blocked. "
                "Run `nometria policy enforce baseline` when the findings look right."
            )
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Framework detection
# ---------------------------------------------------------------------------

#: Modules whose presence in `sys.modules` tells us what the app is built on. Reading
#: `sys.modules` rather than importing keeps detection free of side effects — we learn
#: what the app already loaded, not what it *could* load.
_FRAMEWORK_MODULES = {
    "langgraph": "langgraph",
    "langchain": "langchain",
    "llama_index": "llamaindex",
    "crewai": "crewai",
    "autogen": "autogen",
    "fastapi": "fastapi",
    "flask": "flask",
    "django": "django",
    "mcp": "mcp",
    "ragas": "ragas",
    "litellm": "litellm",
}


def detect_frameworks() -> list[str]:
    return sorted({name for module, name in _FRAMEWORK_MODULES.items() if module in sys.modules})


def default_agent_slug() -> str:
    """Guess a sensible agent name so `auto()` needs no arguments at all.

    Order: explicit env var, then the service name conventions used by most
    deployments, then the entry-point script. A wrong-but-stable guess is far better
    than a required argument — the developer can rename the agent in the registry
    later, and until then their traffic is at least attributed to *something*.
    """
    for var in ("NOMETRIA_AGENT", "OTEL_SERVICE_NAME", "SERVICE_NAME", "APP_NAME", "K_SERVICE"):
        value = os.environ.get(var)
        if value:
            return value
    entry = os.path.basename(sys.argv[0] or "")
    if entry and entry not in ("python", "python3", "-c", "pytest"):
        return os.path.splitext(entry)[0]
    return "default-agent"


# ---------------------------------------------------------------------------
# The governed call
# ---------------------------------------------------------------------------


def _messages_from(kwargs: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalise OpenAI and Anthropic shapes into our message list.

    Anthropic carries the system prompt outside `messages`; folding it back in means
    an injection in a system prompt is evaluated on the same surface either way.
    """
    messages = list(kwargs.get("messages") or [])
    system = kwargs.get("system")
    if system:
        text = (
            system
            if isinstance(system, str)
            else " ".join(str(b.get("text", "")) for b in system if isinstance(b, dict))
        )
        messages = [{"role": "system", "content": text}, *messages]
    return [
        {"role": str(m.get("role", "user")), "content": m.get("content")}
        for m in messages
        if isinstance(m, dict)
    ]


def _text_of(response: Any) -> str:
    """Pull the assistant text out of whichever client shape came back."""
    try:
        choices = getattr(response, "choices", None)
        if choices:
            return getattr(choices[0].message, "content", "") or ""
        content = getattr(response, "content", None)
        if isinstance(content, list):
            return "".join(getattr(block, "text", "") or "" for block in content)
        if isinstance(content, str):  # LangChain's AIMessage.content is a plain string
            return content
    except Exception:  # pragma: no cover - defensive against SDK shape drift
        pass
    return ""


#: LangChain message `.type` -> our role vocabulary.
_LC_ROLES = {"human": "user", "ai": "assistant", "system": "system", "tool": "tool"}


def _lc_messages_from(chat_input: Any) -> list[dict[str, Any]]:
    """Normalise whatever `BaseChatModel.invoke` was given into our message list.

    LangChain accepts a bare string, a `PromptValue`, or a sequence of `BaseMessage`
    (or plain dicts). Whichever shape arrives, the point is the same as
    `_messages_from`: evaluate on the same surface regardless of how the caller built
    the input.
    """
    if isinstance(chat_input, str):
        return [{"role": "user", "content": chat_input}]

    if hasattr(chat_input, "to_messages"):  # a PromptValue
        chat_input = chat_input.to_messages()

    sequence = chat_input if isinstance(chat_input, (list, tuple)) else [chat_input]
    messages: list[dict[str, Any]] = []
    for item in sequence:
        if isinstance(item, dict):
            messages.append({"role": str(item.get("role", "user")), "content": item.get("content")})
            continue
        content = getattr(item, "content", None)
        msg_type = getattr(item, "type", None)
        if content is None and msg_type is None:
            continue
        role = _LC_ROLES.get(str(msg_type), str(msg_type or "user"))
        messages.append({"role": role, "content": content if isinstance(content, str) else str(content)})
    return messages


def _record_turn(
    state: AutoState, messages: list[dict[str, Any]], answer: str, trace_id: str
) -> None:
    """Record one exchange for missed-escalation detection. Never fails the request."""
    try:
        user_text = next(
            (
                str(m.get("content") or "")
                for m in reversed(messages)
                if str(m.get("role")) == "user"
            ),
            "",
        )
        if not user_text:
            return
        from .db import session_scope
        from .escalation import record_turn
        from .models import Agent

        token = _IN_NOMETRIA.set(True)
        try:
            with session_scope() as session:
                from sqlalchemy import select

                agent = session.scalar(select(Agent).where(Agent.slug == state.agent))
                record_turn(
                    session,
                    session_id=state.session_id or trace_id,
                    agent_id=agent.id if agent else None,
                    trace_id=trace_id,
                    user_text=user_text,
                    agent_text=answer,
                )
        finally:
            _IN_NOMETRIA.reset(token)
    except Exception as exc:  # pragma: no cover - observability must not break the call
        log.debug("nometria: turn capture skipped: %s", exc)


class Blocked(RuntimeError):
    """Raised in enforce mode when a governed call is refused."""

    def __init__(self, result: Any) -> None:
        super().__init__(result.reason or "blocked by policy")
        self.result = result


def _govern(state: AutoState, kwargs: dict[str, Any], call: Any) -> Any:
    """Pre-flight, call, post-flight. The whole patch, in one place."""
    # P10 — the caller's end-user identity and retrieved context, if it supplied
    # them. Popped before anything else so they never leak to the real provider
    # call, which sees these as unrecognised kwargs otherwise. A subject that
    # doesn't resolve to a registered principal still gets recorded correctly
    # downstream (as "declared but unregistered" — see entitlement.filter_retrieval),
    # so no lookup happens here.
    principal_ref = kwargs.pop("nometria_principal", None)
    retrieved_chunks = kwargs.pop("nometria_chunks", None)
    purpose = kwargs.pop("nometria_purpose", None)

    if _IN_NOMETRIA.get():
        return call()

    token = _IN_NOMETRIA.set(True)
    try:
        messages = _messages_from(kwargs)
        with session_scope() as session:
            enforcer = Enforcer(session)
            agent, identity, _shadow = enforcer.resolve(state.agent)
            from .audit.trace import start_trace

            trace = start_trace(
                session,
                agent_id=agent.id if agent else None,
                agent_slug=state.agent,
                environment=state.environment,
                model=str(kwargs.get("model") or ""),
            )
            inbound = enforcer.evaluate(
                agent=agent,
                identity=identity,
                content="\n".join(str(m.get("content") or "") for m in messages),
                surface="input",
                trace=trace,
            )
            trace_id = trace.id
            blocked = inbound.blocked
            reason = inbound.reason
    except Exception as exc:  # never take the caller's request down
        log.warning("nometria: pre-flight failed, allowing the call: %s", exc)
        _IN_NOMETRIA.reset(token)
        return call()

    try:
        if blocked and state.mode == "enforce":
            raise Blocked(inbound)
        response = call()
    finally:
        _IN_NOMETRIA.reset(token)

    try:
        text = _text_of(response)
        if text:
            token = _IN_NOMETRIA.set(True)
            try:
                with session_scope() as session:
                    enforcer = Enforcer(session)
                    agent, identity, _shadow = enforcer.resolve(state.agent)
                    from .models import Trace

                    if principal_ref is not None:
                        from sqlalchemy import select

                        from .models import EndUserPrincipal

                        subject = (
                            principal_ref.get("subject")
                            if isinstance(principal_ref, dict)
                            else str(principal_ref)
                        )
                        principal_obj = session.scalar(
                            select(EndUserPrincipal).where(EndUserPrincipal.subject == subject)
                        )
                        enforcer.evidence = {
                            "principal": principal_obj,
                            "chunks": retrieved_chunks or [],
                            "purpose": purpose,
                        }

                    outbound = enforcer.evaluate(
                        agent=agent,
                        identity=identity,
                        content=text,
                        surface="output",
                        trace=session.get(Trace, trace_id),
                    )
                    if outbound.blocked and state.mode == "enforce":
                        raise Blocked(outbound)
            finally:
                _IN_NOMETRIA.reset(token)
    except Blocked:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("nometria: post-flight failed: %s", exc)

    # P11: capture the exchange as a conversation turn. Escalation governance was
    # complete and inert for anyone using the one-liner — the detector reads recorded
    # turns, and nothing was recording them, so the largest failure family was covered
    # in code and uncovered in practice. Session grouping falls back to the trace when
    # the caller has no session concept, which at least keeps single-turn
    # conversations attributable.
    try:
        _record_turn(state, messages, _text_of(response), trace_id)
    except Exception as exc:  # pragma: no cover - defence in depth
        # Guarded here as well as inside, so that a future change to turn capture
        # cannot become a change to whether the caller's request succeeds.
        log.debug("nometria: turn capture failed: %s", exc)

    state.calls_governed += 1
    if blocked and state.mode == "observe":
        log.info("nometria: would have blocked (observe mode) — %s", reason)
    return response


# ---------------------------------------------------------------------------
# Patchers
# ---------------------------------------------------------------------------


def _patch_openai(state: AutoState) -> PatchResult:
    try:
        import openai
        from openai.resources.chat import completions
    except ImportError:
        return PatchResult("openai", False, "not installed")
    except Exception as exc:  # pragma: no cover
        return PatchResult("openai", False, f"import failed: {exc}")

    target = completions.Completions
    if getattr(target.create, "__nometria__", False):
        return PatchResult("openai", True, "already patched", getattr(openai, "__version__", None))
    if not hasattr(target, "create"):  # pragma: no cover - SDK shape drift
        return PatchResult(
            "openai",
            False,
            "this openai version has no Completions.create; leaving it alone rather than guessing",
        )

    original = target.create

    @functools.wraps(original)
    def governed(self, *args: Any, **kwargs: Any) -> Any:
        return _govern(state, kwargs, lambda: original(self, *args, **kwargs))

    governed.__nometria__ = True  # type: ignore[attr-defined]
    governed.__nometria_original__ = original  # type: ignore[attr-defined]
    target.create = governed
    return PatchResult(
        "openai", True, "chat.completions.create", getattr(openai, "__version__", None)
    )


def _patch_anthropic(state: AutoState) -> PatchResult:
    try:
        import anthropic
        from anthropic.resources import messages as messages_module
    except ImportError:
        return PatchResult("anthropic", False, "not installed")
    except Exception as exc:  # pragma: no cover
        return PatchResult("anthropic", False, f"import failed: {exc}")

    target = messages_module.Messages
    if getattr(target.create, "__nometria__", False):
        return PatchResult(
            "anthropic", True, "already patched", getattr(anthropic, "__version__", None)
        )
    original = target.create

    @functools.wraps(original)
    def governed(self, *args: Any, **kwargs: Any) -> Any:
        return _govern(state, kwargs, lambda: original(self, *args, **kwargs))

    governed.__nometria__ = True  # type: ignore[attr-defined]
    governed.__nometria_original__ = original  # type: ignore[attr-defined]
    target.create = governed
    return PatchResult(
        "anthropic", True, "messages.create", getattr(anthropic, "__version__", None)
    )


def _patch_litellm(state: AutoState) -> PatchResult:
    try:
        import litellm
    except ImportError:
        return PatchResult("litellm", False, "not installed")
    except Exception as exc:  # pragma: no cover
        return PatchResult("litellm", False, f"import failed: {exc}")

    if not hasattr(litellm, "completion"):  # pragma: no cover - SDK shape drift
        return PatchResult(
            "litellm",
            False,
            "this litellm version has no top-level completion; leaving it alone rather than guessing",
        )
    if getattr(litellm.completion, "__nometria__", False):
        return PatchResult(
            "litellm", True, "already patched", getattr(litellm, "__version__", None)
        )

    original = litellm.completion

    @functools.wraps(original)
    def governed(*args: Any, **kwargs: Any) -> Any:
        return _govern(state, kwargs, lambda: original(*args, **kwargs))

    governed.__nometria__ = True  # type: ignore[attr-defined]
    governed.__nometria_original__ = original  # type: ignore[attr-defined]
    litellm.completion = governed
    return PatchResult("litellm", True, "litellm.completion", getattr(litellm, "__version__", None))


def _patch_langchain(state: AutoState) -> PatchResult:
    try:
        import langchain_core
        from langchain_core.language_models.chat_models import BaseChatModel
    except ImportError:
        return PatchResult("langchain", False, "not installed")
    except Exception as exc:  # pragma: no cover
        return PatchResult("langchain", False, f"import failed: {exc}")

    target = BaseChatModel
    if not hasattr(target, "invoke"):  # pragma: no cover - SDK shape drift
        return PatchResult(
            "langchain",
            False,
            "this langchain-core version has no BaseChatModel.invoke; leaving it alone "
            "rather than guessing",
        )
    if getattr(target.invoke, "__nometria__", False):
        return PatchResult(
            "langchain", True, "already patched", getattr(langchain_core, "__version__", None)
        )

    original = target.invoke

    @functools.wraps(original)
    def governed(self: Any, chat_input: Any, config: Any = None, *, stop: Any = None, **kwargs: Any) -> Any:
        messages = _lc_messages_from(chat_input)
        model_name = getattr(self, "model_name", None) or getattr(self, "model", None) or ""
        govern_kwargs = {"messages": messages, "model": str(model_name)}

        def call() -> Any:
            if config is not None:
                return original(self, chat_input, config, stop=stop, **kwargs)
            return original(self, chat_input, stop=stop, **kwargs)

        return _govern(state, govern_kwargs, call)

    governed.__nometria__ = True  # type: ignore[attr-defined]
    governed.__nometria_original__ = original  # type: ignore[attr-defined]
    target.invoke = governed
    return PatchResult(
        "langchain", True, "BaseChatModel.invoke", getattr(langchain_core, "__version__", None)
    )


_PATCHERS = (_patch_openai, _patch_anthropic, _patch_litellm, _patch_langchain)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def auto(
    agent: str | None = None,
    *,
    mode: str = "observe",
    environment: str | None = None,
    session_id: str | None = None,
    register: bool = True,
    quiet: bool = False,
) -> AutoState:
    """Govern this process. One line, no code changes anywhere else.

        import nometria
        nometria.auto()

    Starts in **observe** mode: every call is traced, evaluated and audited, and
    nothing is blocked. That default is not timidity — a library that begins refusing
    production traffic because someone added an import is indefensible, and a team
    that gets burned once will never trust the tool again. Turn it up with
    ``auto(mode="enforce")`` once the findings look right.

    Returns the state, so a developer can assert on it in a test rather than trusting
    that it worked.
    """
    global _STATE
    if mode not in ("observe", "enforce"):
        raise ValueError("mode must be 'observe' or 'enforce'")

    settings = get_settings()
    state = AutoState(
        agent=agent or default_agent_slug(),
        mode=mode,
        environment=environment or settings.environment,
        frameworks=detect_frameworks(),
        session_id=session_id,
    )

    try:
        init_db()
        if register:
            with session_scope() as session:
                register_agent(
                    session,
                    state.agent,
                    name=state.agent,
                    environment=state.environment,
                    framework=state.frameworks[0] if state.frameworks else None,
                    purpose="auto-registered by nometria.auto()",
                )
    except Exception as exc:
        # Registration is a convenience; failing it must not stop governance, and
        # hiding the failure would leave the developer wondering why the agent never
        # appeared in the registry.
        log.warning("nometria: could not register agent '%s': %s", state.agent, exc)

    state.patches = [patch(state) for patch in _PATCHERS]
    state.started = True
    _STATE = state

    if not quiet:
        print(state.summary(), file=sys.stderr)  # noqa: T201 - the point is to be seen
    atexit.register(_report_at_exit)
    return state


def _report_at_exit() -> None:  # pragma: no cover - process teardown
    if _STATE and _STATE.calls_governed:
        print(
            f"nometria: governed {_STATE.calls_governed} model call(s). "
            f"Run `nometria findings` to see what it found.",
            file=sys.stderr,
        )


def state() -> AutoState | None:
    """What `auto()` did, or None if it was never called."""
    return _STATE


def off() -> list[str]:
    """Undo the patches. Mostly for tests, and for a developer proving it is reversible."""
    global _STATE
    restored: list[str] = []
    try:
        from openai.resources.chat import completions

        original = getattr(completions.Completions.create, "__nometria_original__", None)
        if original is not None:
            completions.Completions.create = original
            restored.append("openai")
    except Exception:
        pass
    try:
        from anthropic.resources import messages as messages_module

        original = getattr(messages_module.Messages.create, "__nometria_original__", None)
        if original is not None:
            messages_module.Messages.create = original
            restored.append("anthropic")
    except Exception:
        pass
    try:
        import litellm

        original = getattr(litellm.completion, "__nometria_original__", None)
        if original is not None:
            litellm.completion = original
            restored.append("litellm")
    except Exception:
        pass
    try:
        from langchain_core.language_models.chat_models import BaseChatModel

        original = getattr(BaseChatModel.invoke, "__nometria_original__", None)
        if original is not None:
            BaseChatModel.invoke = original
            restored.append("langchain")
    except Exception:
        pass
    _STATE = None
    return restored
