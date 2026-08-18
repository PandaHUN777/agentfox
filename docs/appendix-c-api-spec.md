# Appendix C — API Specification

Companion to [PRD §11](PRD.md#11-api-surface). Principle **X-5**: the dashboard is a client of this API; there is no privileged back-channel. The CLI and SDK use the same surface.

Base: `http://localhost:8080` (self-host default). All control-plane routes under `/api`. Inline enforcement routes under `/v1` so they are drop-in for provider SDKs.

---

## C.1 Authentication

| Credential | Header | Used by | Scope |
|---|---|---|---|
| **Agent key** (`nom_agt_…`) | `Authorization: Bearer <key>` | Agents calling the inline gateway | Bound to one `Identity`; grants only inline routes |
| **API token** (`nom_api_…`) | `Authorization: Bearer <token>` | CLI, CI, dashboard, integrations | Bound to a `User` + role |
| **Session cookie** | `nom_session` | Dashboard browser sessions | Bound to a `User` + role |

Agent keys are hashed at rest (`argon2id`), shown once at issuance, and carry `expires_at`. Rotation issues a new key with an overlap window (P2-1).

---

## C.2 Inline enforcement (`/v1`)

### `POST /v1/chat/completions` — OpenAI-compatible proxy
### `POST /v1/messages` — Anthropic-compatible proxy

Drop-in: point `base_url` at the gateway, keep the existing client (X-1a, NFR-8). Request/response bodies are the provider's own. Nometria adds optional headers:

| Header | Meaning |
|---|---|
| `X-Nometria-Agent` | Agent slug. If absent, inferred from the credential; if neither resolves, a `shadow_agent` finding is raised (P1-2). |
| `X-Nometria-Session` | Correlates multiple calls into one execution path. |
| `X-Nometria-Environment` | `production` \| `staging` \| `development`. Selects the policy binding. |
| `X-Nometria-Intent` | Declared task intent, used by intent-based containment (P3-4). |
| `X-Nometria-Trust` | JSON map marking message indices as untrusted (`{"2":"retrieved","3":"tool_result"}`) for taint tracking. |

Response adds:

| Header | Meaning |
|---|---|
| `X-Nometria-Trace` | Trace id — the handle for everything in Pillar 5. |
| `X-Nometria-Verdict` | `allow` \| `redact` \| `block` \| `escalate` |
| `X-Nometria-Decision` | Decision id. |
| `X-Nometria-Latency-Ms` | Added enforcement latency (NFR-1 observability). |

**On block** → `HTTP 403` with an error body carrying `trace_id`, `decision_id`, the `rule_id` that fired, and a human-readable reason (X-4: never block without an auditable reason).
**On escalate** → `HTTP 202` with `approval_id` and a poll/callback URL (P2-3).

### `POST /v1/guard/input` · `POST /v1/guard/output` · `POST /v1/guard/tool_call`

Direct enforcement without proxying — for teams that keep their own provider calls (X-1b).

```jsonc
// POST /v1/guard/tool_call
{
  "agent": "support-triage",
  "session_id": "s-1a2b",
  "tool": "payments.transfer",
  "arguments": {"amount": 25000, "currency": "USD", "to": "acct_991"},
  "provenance": {"to": "tool_result", "amount": "user"},   // taint sources
  "intent": "refund a duplicate charge"
}
```
```jsonc
// 200
{
  "verdict": "escalate",
  "decision_id": "dec_7f…",
  "trace_id": "trc_9c…",
  "policy_version": "pol_payments@4",
  "rules_fired": [
    {"rule_id": "payments.high_value", "effect": "escalate",
     "reason": "amount 25000 exceeds auto-approve limit 1000"},
    {"rule_id": "taint.high_impact_tool", "effect": "escalate",
     "reason": "argument 'to' originates from tool_result (untrusted)"}
  ],
  "approval_id": "apr_3d…",
  "findings": [],
  "latency_ms": 11
}
```

### `POST /v1/traces` — OTLP/HTTP ingest (X-1c)

Passive ingestion of existing OpenTelemetry spans. Accepts OTLP/JSON. Spans following OpenLLMetry semantic conventions are mapped into the agent-native span model; unrecognised spans are retained as context. This is how a team gets Pillar 1 and 5 value with *zero* integration.

---

## C.3 Control plane (`/api`)

### Registry (Pillar 1)

| Method | Path | Notes |
|---|---|---|
| `GET/POST` | `/api/agents` | List / register. `POST` accepts the suggested payload from a shadow finding. |
| `GET/PATCH/DELETE` | `/api/agents/{id}` | Delete is soft; the audit chain retains history. |
| `GET` | `/api/agents/{id}/lineage` | Observed graph (P1-3). `?depth=` for blast radius. |
| `GET` | `/api/agents/{id}/posture` | Rolled-up: findings, control status, eval health, budget. |
| `GET/POST` | `/api/tools` · `/api/mcp-servers` | Tool & MCP inventory. |
| `POST` | `/api/mcp-servers/{id}/scan` | Hygiene scan (P1-5); native checks + optional `mcp-scan`. |
| `GET/PATCH` | `/api/findings` · `/api/findings/{id}` | Cross-pillar findings queue. Triage state, assignee, suppression w/ justification. |

### Identity & authorization (Pillar 2)

| Method | Path | Notes |
|---|---|---|
| `GET/POST` | `/api/identities` | NHI records. |
| `POST` | `/api/identities/{id}/credentials` | Issue. Key returned **once**. |
| `POST` | `/api/identities/{id}/rotate` · `/revoke` | Rotation w/ overlap window. |
| `GET/PUT` | `/api/identities/{id}/capabilities` | Tool-scoped grants incl. argument constraints. |
| `GET` | `/api/identities/posture` | Stale / over-privileged / orphaned (P2-1). |
| `GET/POST` | `/api/approvals` | HITL queue. |
| `POST` | `/api/approvals/{id}/{approve\|deny}` | Requires `security` or the named approver; recorded with approver identity and rationale. |
| `GET/POST` | `/api/users` · `/api/roles` | RBAC. |

### Policy (Pillars 2, 3, 6)

| Method | Path | Notes |
|---|---|---|
| `GET/POST` | `/api/policies` | Declarative YAML or Rego. |
| `GET/POST` | `/api/policies/{id}/versions` | Immutable versions; never mutated in place (X-4). |
| `POST` | `/api/policies/{id}/bind` | Bind version → scope (agent/env). Enforce vs observe mode. |
| `POST` | `/api/policies/simulate` | **P2-7.** Replay recorded traffic against a candidate version; returns `{newly_blocked, newly_allowed, newly_escalated, unchanged}` with per-decision diffs. |
| `POST` | `/api/policies/validate` | Lint/compile without saving. |

### Evaluation (Pillar 4)

| Method | Path | Notes |
|---|---|---|
| `GET/POST` | `/api/eval/suites` · `/api/eval/suites/{id}/cases` | Versioned datasets (P4-6). |
| `POST` | `/api/eval/suites/{id}/cases/from-trace` | Promote a production failure to a test case. |
| `POST` | `/api/eval/runs` | Execute. `{suite_id, target:{agent|model|provider}, scorers[], baseline_id?}` |
| `GET` | `/api/eval/runs/{id}` | Results, per-case scores, diff vs baseline. |
| `POST` | `/api/eval/gate` | **CI entry point (P4-1).** Returns `{passed, regressions[], junit, sarif}`; CLI maps to exit code. |
| `GET` | `/api/eval/drift` | Online drift windows + PSI/KS (P4-2). |
| `GET/POST` | `/api/eval/slos` | Reliability targets + error budget (P4-7). |
| `POST` | `/api/eval/compare` | Cross-model comparison (P4-8) — the neutrality proof-point. |
| `GET/POST` | `/api/redteam/campaigns` | Garak/PyRIT/native probes (P4-4). |

### Audit & evidence (Pillar 5)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/traces` | Search: agent, verdict, entity type, tool, time, content. |
| `GET` | `/api/traces/{id}` | Full execution path incl. every decision and detector run. |
| `POST` | `/api/traces/{id}/replay` | Replay against a candidate policy/model (feeds P2-7, P4-8). |
| `GET` | `/api/audit/entries` | Append-only. **No PUT/PATCH/DELETE exists** (P5-2). |
| `POST` | `/api/audit/verify` | Chain verification over a range → `{valid, entries_checked, first_break?, checkpoints[]}`. |
| `GET` | `/api/audit/checkpoints` | Signed checkpoints. |
| `POST` | `/api/evidence` | Build package: `{scope:{agents[],period,controls[]}}` → zip + manifest (P5-3, P5-7). |
| `GET` | `/api/evidence/{id}` · `/download` | |
| `POST` | `/api/export/siem` | On-demand export; `format ∈ otlp\|jsonl\|cef\|leef\|webhook` (P5-4). |
| `GET/POST` | `/api/retention` · `/api/legal-holds` | P5-5. |

### Compliance (Pillar 6)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/controls` · `/api/controls/{id}` | Catalog w/ mappings and live status. |
| `GET` | `/api/frameworks` · `/api/frameworks/{key}` | Coverage **and declared gaps** (Appendix B §B.4). |
| `GET` | `/api/compliance/status` | Computed status per control per scope (P6-4). |
| `GET/POST` | `/api/risk/assessments` | Risk register incl. EU AI Act classification (P6-3). |
| `GET` | `/api/obligations` | Obligation calendar vs inventory (P6-5). |
| `GET` | `/api/board` | Executive rollup (P6-6). |
| `POST` | `/api/compliance/packs/{key}/import` | Policy packs (P6-7). |

### Platform

`GET /api/health` · `GET /api/version` (code + policy + detector + catalog versions, for X-4 determinism) · `GET /api/detectors` (registered detectors, versions, measured latency and precision — P3-11) · `GET /api/providers` (registered model providers — X-2).

---

## C.4 Role → permission matrix

| Route family | owner | admin | security | compliance | developer | auditor |
|---|---|---|---|---|---|---|
| Agents / registry | RW | RW | RW | R | RW | R |
| Identities / credentials | RW | RW | RW | R | R | R |
| Approvals (decide) | ✓ | ✓ | ✓ | — | — | — |
| Policies (author) | RW | RW | RW | R | R* | R |
| Policies (bind to production) | ✓ | ✓ | ✓ | — | — | — |
| Eval suites & runs | RW | RW | R | R | RW | R |
| Traces | R | R | R | R | R | R |
| Audit entries | R | R | R | R | — | R |
| Audit verify | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Evidence export | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Controls / risk / obligations | RW | RW | R | RW | — | R |
| Users & roles | RW | RW | — | — | — | — |

`R*` — developers may author and bind policies in non-production environments only.
**`auditor` can never mutate anything**, which is what makes their read of the audit log meaningful.

---

## C.5 Conventions

- **Errors**: RFC 7807 `application/problem+json` with `trace_id` where one exists.
- **Pagination**: cursor (`?cursor=&limit=`), `limit` max 500.
- **Idempotency**: `Idempotency-Key` honoured on all `POST` that create durable state.
- **Versioning**: `/api` is v1 implicitly; breaking changes go to `/api/v2`. `/v1` inline routes track provider compatibility, not our version.
- **Rate limiting**: per-token, `429` + `Retry-After`.
- **Every mutating call writes an `AuditEntry`** — including reads of evidence packages, because who looked at the evidence is itself audit-relevant.
