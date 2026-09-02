"""FastAPI wrapper around `agent.py`'s `run_turn()`, for a live-in-the-browser
deployment of this demo (Vercel's Python runtime serves an ASGI app directly, same
pattern as `api/index.py` — see that file's docstring for the reasoning this mirrors).

Chat history is kept **client-side**, not server-side: the browser sends the full
prior turn list with every request, and this handler reconstructs a `SessionState`
from it. That is a deliberate fit for a stateless serverless function — there is no
guarantee two requests in the same conversation land on the same warm instance, so
any server-held-history design would silently lose turns. The governed state that
actually matters (capability grants, taint marks, audit trail, order/customer
records) lives in Postgres via `NOMETRIA_DATABASE_URL`, not in this file.

Local dev:  uvicorn web:app --reload --port 8000
Deployed:   this module's `app` is Vercel's entrypoint (see vercel.json).
"""

from __future__ import annotations

import os

import _env  # noqa: F401  -- must run before anything imports nometria settings

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import seed_demo_agent
from agent import MissingApiKey, SessionState, run_turn
from langchain_core.messages import AIMessage, HumanMessage
from nometria.db import init_db, session_scope

app = FastAPI(title="Nometria red-team live demo (LangChain)")

_seeded = False


def _ensure_seeded() -> None:
    """Idempotent, lazy seeding — safe to call on every cold start. A Postgres-backed
    deployment has no separate `python seed_demo_agent.py` step to run by hand, so
    the first request (any request) does it instead. `seed_demo_agent.main()` is
    genuinely idempotent at the DB level (capability grants are guarded explicitly;
    `policy.store.save_policy` skips creating a new version when the body is
    unchanged — checked directly, not assumed), not just via this in-process flag,
    so a cold start on a fresh instance re-running it is harmless either way. The
    flag just avoids the redundant DB round-trips on a warm instance."""
    global _seeded
    if _seeded:
        return
    seed_demo_agent.main()
    _seeded = True


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    history: list[ChatTurn] = []


@app.on_event("startup")
def _startup() -> None:
    _ensure_seeded()


@app.post("/api/chat")
def chat(req: ChatRequest) -> dict:
    _ensure_seeded()
    state = SessionState(session_id=req.session_id or "web-session")
    for turn in req.history:
        state.history.append(
            HumanMessage(content=turn.content)
            if turn.role == "user"
            else AIMessage(content=turn.content)
        )
    try:
        return run_turn(req.message, state)
    except MissingApiKey as exc:
        return {
            "reply": str(exc),
            "error": "missing_api_key",
            "blocked": False,
            "escalated": False,
            "rules_fired": [],
            "tool_calls": [],
        }
    except Exception as exc:  # noqa: BLE001 — this is the top of the stack for a
        # live demo request; the LLM client's own timeout (agent.py's
        # _LLM_TIMEOUT_S) and the AgentExecutor's max_execution_time both bound how
        # long this can legitimately take, but a live network call can still fail
        # in ways neither anticipates (a rate limit, a transient 5xx from the
        # provider). Surface it as a clean chat-shaped response instead of a bare
        # 500 with no body — found live: an earlier version of this handler let
        # exactly that kind of failure crash the request with nothing useful shown
        # to whoever was watching.
        return {
            "reply": f"The agent hit an error talking to the model provider: {exc}",
            "error": "llm_call_failed",
            "blocked": False,
            "escalated": False,
            "rules_fired": [],
            "tool_calls": [],
        }


@app.post("/api/redteam")
def redteam() -> dict:
    """Runs the same built-in probe suite `nometria redteam run` does, against this
    demo's seeded agent, and returns the campaign summary as JSON."""
    _ensure_seeded()
    from nometria.evaluation.redteam import BUILTIN_PROBES, run_campaign
    from support_tools import AGENT_SLUG

    init_db()
    with session_scope() as session:
        campaign = run_campaign(session, AGENT_SLUG, name="web-demo-run")
        summary = campaign.summary_json
    return {
        "probes_run": summary["probes_run"],
        "attacks_run": summary["attacks_run"],
        "attacks_blocked": summary["attacks_blocked"],
        "attacks_succeeded": summary["attacks_succeeded"],
        "benign_probes_run": summary["benign_probes_run"],
        "benign_false_positives": summary["benign_false_positives"],
        "recall": summary["recall"],
        "precision": summary["precision"],
        "probes": summary["probes"],
        "total_probes_available": len(BUILTIN_PROBES),
    }


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "has_llm_key": bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY")),
    }


@app.get("/api/diag")
def diag() -> dict:
    """Isolates where a hung /api/chat request is actually stuck: raw egress to the
    LLM provider (bypassing LangChain and nometria's BaseChatModel.invoke patch
    entirely) vs. the DB round-trip vs. an actual LangChain+nometria-governed call.
    Each probe gets its own short, explicit timeout so this endpoint itself always
    returns quickly and reports which stage failed rather than hanging."""
    import time

    import httpx

    out = {}

    t0 = time.monotonic()
    try:
        r = httpx.get("https://api.anthropic.com/", timeout=8)
        out["raw_egress_anthropic"] = {"ok": True, "status": r.status_code, "elapsed_s": round(time.monotonic() - t0, 2)}
    except Exception as exc:  # noqa: BLE001
        out["raw_egress_anthropic"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}", "elapsed_s": round(time.monotonic() - t0, 2)}

    t0 = time.monotonic()
    try:
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-3-5-haiku-20241022", "max_tokens": 8, "messages": [{"role": "user", "content": "hi"}]},
            timeout=15,
        )
        out["raw_anthropic_messages_call"] = {"ok": r.status_code == 200, "status": r.status_code, "elapsed_s": round(time.monotonic() - t0, 2), "body": r.text[:300]}
    except Exception as exc:  # noqa: BLE001
        out["raw_anthropic_messages_call"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}", "elapsed_s": round(time.monotonic() - t0, 2)}

    t0 = time.monotonic()
    try:
        init_db()
        with session_scope() as session:
            session.execute(__import__("sqlalchemy").text("SELECT 1"))
        out["db_roundtrip"] = {"ok": True, "elapsed_s": round(time.monotonic() - t0, 2)}
    except Exception as exc:  # noqa: BLE001
        out["db_roundtrip"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}", "elapsed_s": round(time.monotonic() - t0, 2)}

    return out


_PAGE = """<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nometria red-team live demo — LangChain</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.2rem; }
  #log { border: 1px solid #8884; border-radius: 8px; padding: 1rem; min-height: 240px; margin-bottom: 1rem; white-space: pre-wrap; }
  .msg { margin-bottom: 0.75rem; }
  .msg b { display: block; font-size: 0.8rem; opacity: 0.6; }
  .blocked { color: #d33; font-weight: 600; }
  form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
  input[type=text] { flex: 1; padding: 0.5rem; }
  button { padding: 0.5rem 1rem; cursor: pointer; }
  #rt-out { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 0.85rem; border: 1px solid #8884; border-radius: 8px; padding: 1rem; }
  .hint { font-size: 0.85rem; opacity: 0.7; }
</style>
</head>
<body>
<h1>Nometria — governed LangChain support agent (live red-team demo)</h1>
<p class="hint">Real tools, real governance (McpGovernor + F3.8 composed-escalation),
LangChain agent. Try: <i>"A customer says their order ORD-7002 arrived damaged and
they'd like a $45 refund."</i> Then try a search-then-refund request for "Priya Anand"
to see the composed-escalation block.</p>
<div id="log"></div>
<form id="chat-form">
  <input id="msg" type="text" placeholder="Type a customer request..." autocomplete="off" />
  <button type="submit">Send</button>
</form>
<h2 style="font-size:1rem">Red-team the live agent</h2>
<button id="rt-btn">Run 22 built-in probes</button>
<pre id="rt-out"></pre>
<script>
const log = document.getElementById('log');
const history = [];
const sessionId = 'web-' + Math.random().toString(36).slice(2, 10);

function addMsg(role, text, blocked) {
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = '<b>' + role + '</b>' + (blocked ? '<span class="blocked">[BLOCKED] </span>' : '') + text.replace(/</g, '&lt;');
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

document.getElementById('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('msg');
  const message = input.value.trim();
  if (!message) return;
  addMsg('customer', message, false);
  input.value = '';
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message, session_id: sessionId, history}),
  });
  const data = await res.json();
  addMsg('agent', data.reply, data.blocked || data.escalated);
  if (data.rules_fired && data.rules_fired.length) {
    addMsg('governance', 'rules_fired: ' + data.rules_fired.join(', '), false);
  }
  history.push({role: 'user', content: message});
  history.push({role: 'assistant', content: data.reply});
});

document.getElementById('rt-btn').addEventListener('click', async () => {
  const out = document.getElementById('rt-out');
  out.textContent = 'Running...';
  const res = await fetch('/api/redteam', {method: 'POST'});
  const data = await res.json();
  out.textContent = `recall=${(data.recall*100).toFixed(0)}%  precision=${(data.precision*100).toFixed(0)}%\\n` +
    `attacks: ${data.attacks_blocked}/${data.attacks_run} blocked\\n` +
    `benign false positives: ${data.benign_false_positives}/${data.benign_probes_run}`;
});
</script>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return _PAGE
