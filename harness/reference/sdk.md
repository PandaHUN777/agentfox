---
title: Python SDK and integrations
layer: reference
audience: agents wiring nometria into a user's codebase
source_of_truth: src/nometria/__init__.py, autoguard.py, sdk/, integrations/
verified_against: commit 6863b8b, 2026-09-15
---

# Integration surfaces — pick one per agent

| Surface | Code change | Governs | Choose when |
|---|---|---|---|
| `nometria.auto()` | 1 line | OpenAI / Anthropic / LiteLLM / LangChain calls, sync and async, streamed or not | First integration, any framework. |
| Gateway proxy (`/v1/chat/completions`, `/v1/messages`) | change `base_url` | every model call over HTTP, any language, with mid-stream (windowed) enforcement | Non-Python, streaming that must be cut mid-response, or a platform team owns the gateway. |
| `Nometria` SDK | decorators + session | model calls **and tool calls with argument provenance** | The agent calls tools with real side effects (payments, SQL, email). |
| LangGraph `NometriaGuard` | wrap nodes | retrieval, model, tool nodes; escalation → `interrupt()` | The agent is a LangGraph graph (primary adoption path). |
| FastAPI `install()` / `guard()` | middleware / dependency | HTTP endpoints that take prompts | The agent is exposed as a FastAPI service. |
| `McpGovernor` | wrap MCP client calls | MCP tool calls, schema drift ("rug pull"), undeclared tools | The agent uses MCP servers. |

## 1. `nometria.auto()` — the one-liner

```python
import nometria
nometria.auto()                                   # follows each policy's own mode
# nometria.auto(agent="support-triage", session_id=conv_id)
```

Signature: `auto(agent=None, *, mode="policy", environment=None, session_id=None, register=True, quiet=False) -> AutoState`.

| `mode` | Raises `nometria.Blocked` when | Use it for |
|---|---|---|
| `"policy"` (default) | the gateway would have refused the call: an enforce-mode policy blocks, or the agent is killed, quarantined, over budget, or outside its knowledge boundary | normal use. With the shipped packs `baseline` observes, so adding the import blocks nothing new. `nometria policy enforce baseline` is then the one step that starts blocking |
| `"observe"` | never, not even for the kill switch | a library-level safety valve |
| `"enforce"` | the enforced verdict stops it, or the effective verdict is `block` even though the policy only observes | tests and CI |

Also `nometria.state()` (`calls_governed`, `calls_blocked`, `would_have_blocked`,
`framework_routes()`), `nometria.off()`, and the exception `nometria.Blocked`. Extra kwargs accepted by patched calls and stripped before the provider sees
them: `nometria_principal`, `nometria_chunks`, `nometria_purpose`.
Limits: see `reference/known-issues.md` → "`nometria.auto()` limits".

## 2. SDK — tools with provenance

```python
from nometria import Nometria, PolicyViolation, ApprovalRequired

nom = Nometria(agent="support-triage")            # in-process; add base_url=, api_key= for remote

@nom.tool("payments.transfer", impact="irreversible")   # impact: read | write | high_impact | irreversible
def transfer(amount, currency, to): ...

with nom.session(intent="refund a duplicate charge") as s:
    doc = s.retrieved(fetch_kb(q))                # marks content untrusted (taint)
    answer = s.complete(messages)                 # input + output enforced
    try:
        transfer(amount=250, currency="USD", to=doc.account)
    except ApprovalRequired as e:                 # tainted arg → human approval
        notify_approver(e.approval_id)
    except PolicyViolation as e:
        log.warning("blocked: %s", e.rules_fired)
```

Other `AgentSession` methods: `tool_result(text, tool=)`, `subagent_output(text)`,
`guard_tool(tool, arguments, provenance=)`. One-off checks: `nom.check(text, surface="input")`,
`@nom.guard(surface="output")`.

## 3. LangGraph

```python
from nometria.integrations.langgraph import NometriaGuard   # needs the [langgraph] extra

guard = NometriaGuard(agent="support-triage", intent="answer a refund question")
builder.add_node("retrieve", guard.retrieval_node(fetch_docs))
builder.add_node("model",    guard.model_node(call_model))
builder.add_node("pay",      guard.tool_node(transfer, tool="payments.transfer"))
```

Governance state lives under the `"__nometria__"` state key, so it survives checkpointing.
Escalation calls LangGraph's `interrupt()`; blocks raise `PolicyViolation`.

## 4. FastAPI

```python
from fastapi import Depends
from nometria.integrations.fastapi import install, guard

install(app, service="support-api")               # observe-only middleware + /nometria/health

@app.post("/ask")
def ask(payload: dict, result=Depends(guard(agent="support-triage", field="prompt"))): ...
```

## 5. MCP client governor

```python
from nometria.integrations import McpGovernor

gov = McpGovernor(session=db_session, agent_slug="support-triage", server_name="billing")
gov.register_tools(tools_list)                    # snapshot; later drift is detected
outcome = gov.call("issue_refund", {"amount": 40}, transport=call_mcp)   # outcome.allowed
```

## 6. Gateway proxy (any language)

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8080/v1", api_key="nom_agt_…",
                default_headers={"X-Nometria-Agent": "support-triage"})
```

## Rollout rule (the product's own safety stance)

1. Integrate. Policies start in observe (except `tool-containment`). 2. Read `nometria findings`
and tune. 3. `policy simulate` the enforce candidate against recorded traffic. 4. Only then
`policy enforce`; `auto()` follows it with no code change. Never skip to step 4 on a user's
behalf.
