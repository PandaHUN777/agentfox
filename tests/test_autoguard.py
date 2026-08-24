"""The one-liner: `import nometria; nometria.auto()`.

Every other integration asks the developer to change how they call the model. Each ask
is small, and the sum of small asks is why governance tooling sits in a proof-of-
concept for six months — eleven of eleven engineers used LangGraph and not one adopted
a governance product, because a wrapper they wrote is cheaper than a migration they
have to justify.

These tests cover the promise (an untouched app becomes governed) and, more
importantly, the guarantees that make it safe to put in someone's `main.py`: it does
not block by default, it does not fail the caller's request, and it does not lie about
what it patched.
"""

from __future__ import annotations

import sys
import types

import pytest

from nometria.autoguard import (
    AutoState,
    Blocked,
    _messages_from,
    _text_of,
    auto,
    default_agent_slug,
    detect_frameworks,
    off,
    state,
)
from nometria.models import Agent, Decision, DetectionFinding, Trace

# ---------------------------------------------------------------------------
# A fake client library with the real shape
# ---------------------------------------------------------------------------


def _install_fake_openai(reply: str = "hello back", explode: bool = False):
    openai = types.ModuleType("openai")
    openai.__version__ = "1.99.0"
    resources = types.ModuleType("openai.resources")
    chat = types.ModuleType("openai.resources.chat")
    completions = types.ModuleType("openai.resources.chat.completions")

    class _Msg:
        def __init__(self, content):
            self.content = content

    class _Choice:
        def __init__(self, content):
            self.message = _Msg(content)

    class _Resp:
        def __init__(self, content):
            self.choices = [_Choice(content)]

    calls: list[dict] = []

    class Completions:
        def create(self, **kwargs):
            calls.append(kwargs)
            if explode:
                raise RuntimeError("provider is down")
            return _Resp(reply)

    completions.Completions = Completions
    chat.completions = completions
    resources.chat = chat
    openai.resources = resources
    sys.modules.update(
        {
            "openai": openai,
            "openai.resources": resources,
            "openai.resources.chat": chat,
            "openai.resources.chat.completions": completions,
        }
    )
    return Completions, calls


@pytest.fixture
def fake_openai():
    saved = {k: sys.modules.get(k) for k in list(sys.modules) if k.startswith("openai")}
    client, calls = _install_fake_openai()
    yield client, calls
    off()
    for key in [k for k in list(sys.modules) if k.startswith("openai")]:
        del sys.modules[key]
    for key, value in saved.items():
        if value is not None:
            sys.modules[key] = value


def _install_fake_litellm(reply: str = "hello back", explode: bool = False):
    litellm = types.ModuleType("litellm")
    litellm.__version__ = "1.50.0"

    class _Msg:
        def __init__(self, content):
            self.content = content

    class _Choice:
        def __init__(self, content):
            self.message = _Msg(content)

    class _Resp:
        def __init__(self, content):
            self.choices = [_Choice(content)]

    calls: list[dict] = []

    def completion(**kwargs):
        calls.append(kwargs)
        if explode:
            raise RuntimeError("provider is down")
        return _Resp(reply)

    litellm.completion = completion
    sys.modules["litellm"] = litellm
    return litellm, calls


@pytest.fixture
def fake_litellm():
    saved = sys.modules.get("litellm")
    module, calls = _install_fake_litellm()
    yield module, calls
    off()
    del sys.modules["litellm"]
    if saved is not None:
        sys.modules["litellm"] = saved


def _install_fake_langchain(reply: str = "hello back", explode: bool = False):
    langchain_core = types.ModuleType("langchain_core")
    langchain_core.__version__ = "0.3.0"
    language_models = types.ModuleType("langchain_core.language_models")
    chat_models = types.ModuleType("langchain_core.language_models.chat_models")
    messages_mod = types.ModuleType("langchain_core.messages")

    class BaseMessage:
        def __init__(self, content, type_="human"):
            self.content = content
            self.type = type_

    class HumanMessage(BaseMessage):
        def __init__(self, content):
            super().__init__(content, "human")

    class SystemMessage(BaseMessage):
        def __init__(self, content):
            super().__init__(content, "system")

    class AIMessage(BaseMessage):
        def __init__(self, content):
            super().__init__(content, "ai")

    calls: list[dict] = []

    class BaseChatModel:
        model_name = "fake-model"

        def invoke(self, chat_input, config=None, *, stop=None, **kwargs):
            calls.append({"input": chat_input, "config": config, "stop": stop, **kwargs})
            if explode:
                raise RuntimeError("provider is down")
            return AIMessage(reply)

    messages_mod.BaseMessage = BaseMessage
    messages_mod.HumanMessage = HumanMessage
    messages_mod.SystemMessage = SystemMessage
    messages_mod.AIMessage = AIMessage
    chat_models.BaseChatModel = BaseChatModel
    language_models.chat_models = chat_models
    langchain_core.language_models = language_models
    langchain_core.messages = messages_mod

    sys.modules.update(
        {
            "langchain_core": langchain_core,
            "langchain_core.language_models": language_models,
            "langchain_core.language_models.chat_models": chat_models,
            "langchain_core.messages": messages_mod,
        }
    )
    return messages_mod, calls


@pytest.fixture
def fake_langchain():
    saved = {k: sys.modules.get(k) for k in list(sys.modules) if k.startswith("langchain_core")}
    messages_mod, calls = _install_fake_langchain()
    yield messages_mod, calls
    off()
    for key in [k for k in list(sys.modules) if k.startswith("langchain_core")]:
        del sys.modules[key]
    for key, value in saved.items():
        if value is not None:
            sys.modules[key] = value


@pytest.fixture
def app_db(isolated_db):
    """Seeded and closed.

    `auto()` opens its own session per call, exactly as it does in a real app. Holding
    the `seeded` fixture's session open alongside it deadlocks SQLite's single writer,
    which is a property of the test harness rather than of the product.
    """
    from nometria.db import session_scope
    from nometria.seed import seed

    with session_scope() as session:
        seed(session)
    yield


@pytest.fixture(autouse=True)
def _reset():
    yield
    off()


# ---------------------------------------------------------------------------
# The promise
# ---------------------------------------------------------------------------


def test_an_untouched_app_becomes_governed(app_db, fake_openai, capsys):
    """The whole product from a developer's point of view: one line, no other change."""
    client, _calls = fake_openai
    auto(agent="support-triage", quiet=True)

    response = client().create(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])
    assert response.choices[0].message.content == "hello back"
    assert state().calls_governed == 1


def test_the_governed_call_leaves_a_trace_and_decisions(app_db, fake_openai):
    client, _calls = fake_openai
    auto(agent="support-triage", quiet=True)
    client().create(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])

    from nometria.db import session_scope

    with session_scope() as session:
        assert session.query(Trace).count() >= 1
        assert session.query(Decision).count() >= 2, "one per surface"


def test_reserved_evidence_kwargs_record_disclosure_and_never_reach_the_provider(
    app_db, fake_openai
):
    """`nometria_principal`/`nometria_chunks` are the SDK's answer to the same gap the
    gateway HTTP path had: `enforcer.evidence` was never populated by real traffic, so
    entitlement checking could never fire for anyone using the one-liner. They must
    also never leak into the real provider call as unrecognised kwargs."""
    from nometria.db import session_scope
    from nometria.entitlement import grant, upsert_principal
    from nometria.models import DisclosureEvent

    with session_scope() as session:
        grant(session, "kb/*", principal="all-staff")
        upsert_principal(session, "alice@acme.com", groups=["all-staff"])

    client, calls = fake_openai
    auto(agent="support-triage", quiet=True)
    client().create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "hi"}],
        nometria_principal={"subject": "alice@acme.com"},
        nometria_chunks=[
            {"source": "kb/faq", "text": "Refunds within 30 days."},
            {"source": "hr/salaries-2026", "text": "Head of Eng: 210,000."},
        ],
    )

    assert "nometria_principal" not in calls[0]
    assert "nometria_chunks" not in calls[0]
    with session_scope() as session:
        event = session.query(DisclosureEvent).one()
    assert event.principal_subject == "alice@acme.com"
    assert event.candidates == 2
    assert event.withheld == 1


def test_detections_in_the_response_are_recorded(app_db):
    saved = {k: sys.modules.get(k) for k in list(sys.modules) if k.startswith("openai")}
    client, _calls = _install_fake_openai("Contact jane.doe@example.com, SSN 123-45-6789.")
    try:
        auto(agent="support-triage", quiet=True)
        client().create(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])

        from nometria.db import session_scope

        with session_scope() as session:
            entities = {f.entity_type for f in session.query(DetectionFinding).all()}
        assert any(e.startswith("PII") for e in entities), entities
    finally:
        off()
        for key in [k for k in list(sys.modules) if k.startswith("openai")]:
            del sys.modules[key]
        for key, value in saved.items():
            if value is not None:
                sys.modules[key] = value


def test_the_agent_is_registered_automatically(app_db, fake_openai):
    auto(agent="brand-new-agent", quiet=True)
    from nometria.db import session_scope

    with session_scope() as session:
        agent = session.query(Agent).filter_by(slug="brand-new-agent").one()
        assert "auto" in agent.purpose


# ---------------------------------------------------------------------------
# The guarantees that make it safe to put in main.py
# ---------------------------------------------------------------------------


def test_observe_is_the_default(app_db, fake_openai):
    """A library that starts refusing production traffic because someone added an
    import is indefensible, however correct its policy."""
    assert auto(agent="support-triage", quiet=True).mode == "observe"


def test_observe_mode_does_not_block_even_on_a_violation(app_db):
    saved = {k: sys.modules.get(k) for k in list(sys.modules) if k.startswith("openai")}
    client, _calls = _install_fake_openai("SSN 123-45-6789 and card 4111 1111 1111 1111")
    try:
        auto(agent="support-triage", quiet=True)
        response = client().create(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])
        assert response.choices[0].message.content
    finally:
        off()
        for key in [k for k in list(sys.modules) if k.startswith("openai")]:
            del sys.modules[key]
        for key, value in saved.items():
            if value is not None:
                sys.modules[key] = value


def test_enforce_must_be_asked_for_explicitly(app_db, fake_openai):
    assert auto(agent="support-triage", mode="enforce", quiet=True).mode == "enforce"


def test_an_unknown_mode_is_rejected(app_db, fake_openai):
    with pytest.raises(ValueError, match="observe"):
        auto(agent="x", mode="whatever", quiet=True)


def test_a_provider_error_still_reaches_the_caller(app_db):
    """Governance must not swallow, mask or rewrite the caller's own failures."""
    saved = {k: sys.modules.get(k) for k in list(sys.modules) if k.startswith("openai")}
    client, _calls = _install_fake_openai(explode=True)
    try:
        auto(agent="support-triage", quiet=True)
        with pytest.raises(RuntimeError, match="provider is down"):
            client().create(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])
    finally:
        off()
        for key in [k for k in list(sys.modules) if k.startswith("openai")]:
            del sys.modules[key]
        for key, value in saved.items():
            if value is not None:
                sys.modules[key] = value


def test_a_governance_failure_does_not_take_the_request_down(app_db, fake_openai, monkeypatch):
    """The caller's request is not ours to fail. A broken governance layer degrades to
    ungoverned-but-working, loudly."""
    import nometria.autoguard as autoguard

    client, _calls = fake_openai
    auto(agent="support-triage", quiet=True)

    def explode(*args, **kwargs):
        raise RuntimeError("database on fire")

    monkeypatch.setattr(autoguard, "session_scope", explode)
    response = client().create(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])
    assert response.choices[0].message.content == "hello back"


def test_patching_twice_is_not_double_patching(app_db, fake_openai):
    """Double-patching would double-count spend and recurse."""
    client, calls = fake_openai
    auto(agent="support-triage", quiet=True)
    auto(agent="support-triage", quiet=True)
    client().create(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])
    assert len(calls) == 1, "the provider must be called exactly once"


def test_our_own_calls_are_not_governed_recursively(app_db, fake_openai):
    """An LLM-as-judge call inside an eval would otherwise be traced as agent traffic
    and charged against the agent's budget."""
    from nometria.autoguard import _IN_NOMETRIA

    client, calls = fake_openai
    auto(agent="support-triage", quiet=True)
    token = _IN_NOMETRIA.set(True)
    try:
        client().create(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])
    finally:
        _IN_NOMETRIA.reset(token)
    assert state().calls_governed == 0


def test_patching_is_reversible(app_db, fake_openai):
    client, _calls = fake_openai
    auto(agent="support-triage", quiet=True)
    assert "openai" in off()
    assert state() is None


# ---------------------------------------------------------------------------
# Honesty about what happened
# ---------------------------------------------------------------------------


def test_a_missing_library_is_reported_not_hidden(app_db, fake_openai):
    """A governance layer that quietly stops governing is the failure mode this
    product exists to prevent."""
    result = auto(agent="support-triage", quiet=True)
    anthropic = next(p for p in result.patches if p.library == "anthropic")
    assert not anthropic.patched
    assert "not installed" in anthropic.detail


def test_patching_nothing_is_information_not_failure(app_db):
    result = auto(agent="support-triage", quiet=True)
    assert not result.active
    assert "Nothing patched" in result.summary()


def test_the_summary_says_what_it_did(app_db, fake_openai):
    summary = auto(agent="support-triage", quiet=True).summary()
    assert "support-triage" in summary
    assert "observe mode" in summary
    assert "Patched: openai" in summary


def test_the_summary_is_printed_unless_silenced(app_db, fake_openai, capsys):
    auto(agent="support-triage")
    assert "Nometria is governing" in capsys.readouterr().err


def test_state_is_returned_so_it_can_be_asserted_on(app_db, fake_openai):
    """A developer should be able to test that governance is on, not trust it."""
    result = auto(agent="support-triage", quiet=True)
    assert isinstance(result, AutoState)
    assert result.active and result.started
    assert result.to_json()["patches"][0]["library"] == "openai"


# ---------------------------------------------------------------------------
# Zero-argument ergonomics
# ---------------------------------------------------------------------------


def test_the_agent_name_is_guessed_from_the_environment(monkeypatch):
    monkeypatch.setenv("NOMETRIA_AGENT", "billing-copilot")
    assert default_agent_slug() == "billing-copilot"


def test_conventional_service_names_are_honoured(monkeypatch):
    monkeypatch.delenv("NOMETRIA_AGENT", raising=False)
    monkeypatch.setenv("OTEL_SERVICE_NAME", "checkout-agent")
    assert default_agent_slug() == "checkout-agent"


def test_there_is_always_a_fallback_name(monkeypatch):
    """A wrong-but-stable guess beats a required argument: the developer can rename it
    later, and until then their traffic is attributed to something."""
    for var in ("NOMETRIA_AGENT", "OTEL_SERVICE_NAME", "SERVICE_NAME", "APP_NAME", "K_SERVICE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr("sys.argv", ["python"])
    assert default_agent_slug() == "default-agent"


def test_frameworks_are_detected_from_what_is_already_loaded():
    """Reading sys.modules rather than importing keeps detection side-effect free."""
    detected = detect_frameworks()
    assert isinstance(detected, list)
    assert "fastapi" in detected or "fastapi" not in sys.modules


# ---------------------------------------------------------------------------
# Message and response normalisation
# ---------------------------------------------------------------------------


def test_anthropics_system_prompt_is_folded_into_the_messages():
    """An injection in a system prompt must be evaluated on the same surface whichever
    client shape it arrived in."""
    messages = _messages_from(
        {"system": "be terse", "messages": [{"role": "user", "content": "hi"}]}
    )
    assert messages[0] == {"role": "system", "content": "be terse"}


def test_a_block_shaped_system_prompt_is_handled():
    messages = _messages_from({"system": [{"type": "text", "text": "be terse"}], "messages": []})
    assert messages[0]["content"] == "be terse"


def test_both_response_shapes_are_read():
    class _OpenAI:
        class _C:
            class message:
                content = "from openai"

        choices = [_C()]

    class _Block:
        text = "from anthropic"

    class _Anthropic:
        content = [_Block()]

    assert _text_of(_OpenAI()) == "from openai"
    assert _text_of(_Anthropic()) == "from anthropic"
    assert _text_of(object()) == ""


def test_the_package_exposes_the_one_liner():
    import nometria

    assert callable(nometria.auto)
    assert "auto" in dir(nometria)


def test_importing_the_package_has_no_side_effects():
    """Importing nometria must never open a database or touch a client library —
    re-exports are lazy for exactly this reason."""
    import subprocess

    result = subprocess.run(
        [sys.executable, "-c", "import nometria; print(nometria.__version__)"],
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert "0.1.0" in result.stdout


def test_blocked_carries_the_decision():
    class _Result:
        reason = "pii on the output surface"

    error = Blocked(_Result())
    assert "pii" in str(error)
    assert error.result.reason


# ---------------------------------------------------------------------------
# LiteLLM and LangChain: same promise, different client shape
# ---------------------------------------------------------------------------


def test_litellm_completion_is_patched_and_governed(app_db, fake_litellm):
    module, calls = fake_litellm
    auto(agent="support-triage", quiet=True)

    response = module.completion(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])
    assert response.choices[0].message.content == "hello back"
    assert len(calls) == 1
    assert state().calls_governed == 1


def test_litellm_a_provider_error_still_reaches_the_caller(app_db):
    saved = sys.modules.get("litellm")
    module, _calls = _install_fake_litellm(explode=True)
    try:
        auto(agent="support-triage", quiet=True)
        with pytest.raises(RuntimeError, match="provider is down"):
            module.completion(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])
    finally:
        off()
        del sys.modules["litellm"]
        if saved is not None:
            sys.modules["litellm"] = saved


def test_langchain_chat_model_with_a_bare_string_is_governed(app_db, fake_langchain):
    messages_mod, calls = fake_langchain
    auto(agent="support-triage", quiet=True)

    model = messages_mod.__dict__  # unused, just to keep the fixture referenced
    from langchain_core.language_models.chat_models import BaseChatModel

    result = BaseChatModel().invoke("hi")
    assert result.content == "hello back"
    assert len(calls) == 1
    assert state().calls_governed == 1


def test_langchain_message_objects_are_normalised(app_db, fake_langchain):
    messages_mod, calls = fake_langchain
    auto(agent="support-triage", quiet=True)

    from langchain_core.language_models.chat_models import BaseChatModel

    chat_input = [
        messages_mod.SystemMessage("be terse"),
        messages_mod.HumanMessage("hi"),
    ]
    BaseChatModel().invoke(chat_input)
    assert calls[0]["input"] == chat_input

    from nometria.db import session_scope
    from nometria.models import Decision

    with session_scope() as session:
        assert session.query(Decision).count() >= 2, "one per surface"


def test_langchain_a_provider_error_still_reaches_the_caller(app_db):
    saved = {k: sys.modules.get(k) for k in list(sys.modules) if k.startswith("langchain_core")}
    _install_fake_langchain(explode=True)
    try:
        auto(agent="support-triage", quiet=True)
        from langchain_core.language_models.chat_models import BaseChatModel

        with pytest.raises(RuntimeError, match="provider is down"):
            BaseChatModel().invoke("hi")
    finally:
        off()
        for key in [k for k in list(sys.modules) if k.startswith("langchain_core")]:
            del sys.modules[key]
        for key, value in saved.items():
            if value is not None:
                sys.modules[key] = value


def test_missing_litellm_and_langchain_are_reported_not_hidden(app_db, fake_openai):
    result = auto(agent="support-triage", quiet=True)
    litellm_result = next(p for p in result.patches if p.library == "litellm")
    langchain_result = next(p for p in result.patches if p.library == "langchain")
    assert not litellm_result.patched and "not installed" in litellm_result.detail
    assert not langchain_result.patched and "not installed" in langchain_result.detail


def test_litellm_and_langchain_patching_is_reversible(app_db, fake_litellm, fake_langchain):
    auto(agent="support-triage", quiet=True)
    restored = off()
    assert "litellm" in restored
    assert "langchain" in restored


def test_lc_messages_from_reads_a_bare_string():
    from nometria.autoguard import _lc_messages_from

    assert _lc_messages_from("hi") == [{"role": "user", "content": "hi"}]


def test_lc_messages_from_maps_message_types_to_roles(fake_langchain):
    from nometria.autoguard import _lc_messages_from

    messages_mod, _calls = fake_langchain
    result = _lc_messages_from(
        [messages_mod.SystemMessage("be terse"), messages_mod.HumanMessage("hi")]
    )
    assert result == [
        {"role": "system", "content": "be terse"},
        {"role": "user", "content": "hi"},
    ]
