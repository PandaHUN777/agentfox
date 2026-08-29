# Gap Analysis — Enterprise Readiness & Competitive Position

**Date:** 2026-08-18 · **Scope:** Nometria Control Plane MVP v0.1 (18.7k LOC, 178 tests)
**Question:** what stops us selling this to an enterprise, and where do we stand against the field?

**Reading this in 2026-08-29 or later:** this snapshot predates roughly fifteen commits
of build-out (`ba3d977` real auth, `PL-1..PL-3` streaming/migrations/kill-switch,
`4f8369f` escalation, `f06dc73`/`65ee7d4`/`e49b88d`/`58b6a47` the four F1–F4 failure
families) documented in [failure-modes.md](failure-modes.md)'s 2026-08-29 update and in
the auto-generated [status.md](status.md). Most of **Part 4's Tier 0** (streaming, DB
migrations, kill switch, real auth) is now built. Treat the **Verdict**, **Part 1 audit**,
and **Tier 0/1 gap register** below as historical — current state lives in status.md,
[coverage-map.md](coverage-map.md), and [traceability.md](traceability.md). **Part 2
below has been corrected in place** to reflect what PRD-v3-consolidated.md (written the
same day) already fixed versus what is still genuinely open.

---

## Verdict

We built a **technically differentiated core with a genuine wedge** — taint-based tool containment, a tamper-evident audit chain with an independent verifier, silent-failure detection, and control status computed from telemetry rather than attested. Three of those four are things **no competitor advertises**.

We also built something that **cannot currently be deployed in front of a production agent, and cannot pass an enterprise security review.**

Three findings dominate everything else:

1. **The gateway silently breaks streaming.** `stream: true` is ignored and a non-streaming JSON body is returned (verified). Most production agents stream. As an inline proxy, the product is unusable today for the majority of its target integrations — and it fails *silently*, which is worse than failing loudly.
2. **Our competitive research was already stale when we shipped.** Six material acquisitions closed between late 2025 and March 2026 that the source documents missed — including **promptfoo → OpenAI** (our chosen CI-eval runner is now owned by a model provider, the exact risk our own Appendix A tells us to avoid) and **Lakera → Check Point**.
3. **Gartner published the first Magic Quadrant for AI Governance Platforms on 16 June 2026** with explicit inclusion criteria. We would **fail to qualify for inclusion** on at least three of them.

The gap is not in the moat. The gap is in everything that surrounds a moat and turns it into a product an enterprise can buy.

**Fourth finding, added after a second pass on real deployment failures** — see the companion
[failure-modes.md](failure-modes.md). Benchmarking against vendor feature lists was the wrong
lens. Measured against how enterprise agents *actually* fail, we cover **1 of 50 failure modes
outright**. A study of 10,000+ failure events found **<10% are hallucination-related**, while
**31.1% are escalation/resolution breakdowns** and execution/action failures are **up 62%**.
Our flagship differentiator — silent-failure detection — is pointed at the smallest slice of
the problem. Read that document before the feature gaps below: it changes what to build first.

---

## Method

- **Code audit** — capability checks run against the repository and the running system; every claim below is grep- or execution-verified and marked accordingly.
- **Market research** — 8 web searches and 3 deep fetches across agent-security, AI-governance and eval/observability vendor guides, the Gartner MQ, and enterprise procurement literature (sources at the end).
- Anything I could not verify is marked **unverified** rather than asserted.

---

## Part 1 — What we actually have (audited)

### Genuinely built and tested

| Capability | Evidence |
|---|---|
| PII / secrets / injection detection, input + output + tool args + tool result + retrieved | 5 surfaces, live-verified on each |
| **Taint tracking** — argument provenance, inferred or declared, propagated into tool calls | `test_taint_contains_an_irreversible_tool` |
| Tool-scoped least privilege, default-deny, argument-level constraints, provenance ceiling | `check_capability`, 6 tests |
| Delegation narrowing enforced at write time (tool pattern, actions, taint, approval) | 4 tests incl. glob-widening rejection |
| **Tamper-evident audit chain** — mutation, deletion, insertion/reorder, checkpoint forgery all detected | 8 tests + standalone verifier run outside the repo |
| Evidence package with stdlib-only `verify_chain.py`, draft mappings excluded | verified by extracting the zip and running it under system Python |
| **Silent-failure ensemble** — 6 signal families, discriminates confident-and-wrong from refusal | 8 tests |
| CI regression gate with direction-aware scorers, JUnit + SARIF | `test_gate_respects_scorer_direction` |
| Policy-as-code, immutable versions, observe→enforce promotion, Rego compilation | 12 tests |
| **Policy simulation** against recorded traffic, exits non-zero on new blocks | `test_policy_simulation_reports_a_diff` |
| Control status **computed** from telemetry; chain break forces `failing` | `test_broken_chain_makes_the_audit_control_fail_hard` |
| 41 controls × 7 frameworks with **declared gaps** per framework | `test_every_framework_has_a_gap_list` |
| Latency: 2–6 ms added on the heuristic path | `test_enforcement_stays_inside_the_latency_budget` |

### Verified absent

Every one of these returned zero matches in the codebase:

`streaming` · `rate limiting` · `cursor pagination` · `kill switch / quarantine` · `multi-tenant org_id filtering` · `cloud connectors (Bedrock/Azure/Vertex/Salesforce)` · `ITSM (ServiceNow/Jira)` · `async job queue / scheduler` · `secrets manager (Vault/KMS)` · `bias / fairness testing` · `model registry / SR 11-7` · `dynamic risk scoring` · `framework instrumentation (LangChain/LlamaIndex callbacks)` · `DB migrations (Alembic)` · `notifications (Slack/PagerDuty/SMTP)`

SSO/SAML: 2 references — a seam, not an integration. Questionnaires: 2 references — a JSON column, not a workflow engine.

---

## Part 2 — The market moved under us

**Update — 2026-08-29.** The table below still holds as a list of real market events. But
"this invalidates parts of the PRD and Appendix A" needs a correction: it's ambiguous
about *which* PRD, and that ambiguity matters. There were, by this point, five PRD
documents in `docs/` (`PRD.md`, `PRD-v2.md`, `PRD-consolidated.md`,
`PRD-v3-consolidated.md`, `PRD-v4-addendum.md`). **`PRD-v3-consolidated.md` and
`appendix-a-oss-register.md` are dated the same day as this document (2026-08-18)** and
already incorporate four of the six events below — apparently the same research pass
that produced this document fed a same-day PRD revision. Presenting this as an open
invalidation, without naming which PRD is stale, reads as a bigger unresolved gap than
what's actually left. Here is what's genuinely still open, event by event:

| Event | Date | Status against `PRD-v3-consolidated.md` (current canonical PRD) |
|---|---|---|
| **promptfoo → OpenAI** | 9 Mar 2026 | ✅ **Already corrected.** [`appendix-a-oss-register.md:19`](appendix-a-oss-register.md) downgrades it `REUSE ★ → REFERENCE ⚠`, dated 2026-08-18, with the note *"a model provider now owns our CI-eval substrate."* [`PRD-v3-consolidated.md:227`](PRD-v3-consolidated.md) already reads *"Dropped from the critical path; optional adapter only."* Nothing left to fix here — this row can be closed. |
| **OpenAI Frontier launched** | 5 Feb 2026 | 🟠 **Partially reflected — two specific lines still need qualifying.** The consolidation table at [line 228](PRD-v3-consolidated.md) already calls it *"bigger than AgentKit."* But the camps table at **line 336** still asserts model providers are *"not a compliance product"* — directly contradicted by line 228's own description of Frontier shipping compliance controls two pages earlier. And **line 716**'s claim that computing status from telemetry is *"a claim only an inline platform can make"* is weakened by the fact that Frontier is itself now an inline, provider-run platform. Neither claim is fully false — Nometria's cross-vendor-neutrality argument (line 384) still holds against a single-provider platform — but both need a qualifying clause, not silence. |
| **Lakera → Check Point** (~$300M) | Q4 2025 | ✅ **Already corrected.** Every reference in v3 already reads "Check Point (+Lakera)," correctly placed under Security suites. The "point tool to out-flank" framing this row worries about only ever existed in the superseded `PRD.md`. |
| **Galileo → Cisco** | late 2025 | ✅ **Already corrected.** v3 already reads "Galileo (Cisco)" throughout, folded into Security suites. |
| **Weights & Biases → CoreWeave** | 2025 | 🟡 **Genuinely missing — a completeness gap, not an invalidation.** It's in [`appendix-a-oss-register.md:90`](appendix-a-oss-register.md)'s changelog only. The PRD's actual competitive tables — the consolidation table (line 223-232) and Pillar 4's OSS/Commercial columns (line 630-631, which lists Galileo, Cleanlab, Braintrust, Arize, Fiddler, Patronus) — never mention it. The PRD never made a claim about W&B's independence, so there's nothing to retract; it just needs adding. |
| **Microsoft Entra Agent ID + Agent 365** | GA through 2026 | ✅ **Already the correct strategic response.** v3 states plainly: *"Microsoft Entra Agent ID will win agent identity — they own the directory. Our Pillar 2 should integrate with it, not compete"* (line 381-382), backed by a concrete requirement `P2-8` (line 471) and risk-register entry `R3` (line 1081). |

**Net correction:** of six events, **four were already fixed same-day** in the canonical
PRD, **one is a completeness gap** (add the W&B row), and **one is a real, narrow
contradiction inside the PRD's own text** (lines 336 and 716 need qualifying against the
PRD's own line 228). "This invalidates parts of the PRD" overstated the residual problem
— what's left is two sentences to edit and one row to add, not a structural rethink.

**A second, related correction to this document's own Part 3.** Part 3 below criticizes
the PRD for modelling *"two camps"* where the real market has four. But `PRD.md`'s "two
camps" language is from the **oldest, superseded** PRD version. `PRD-v3-consolidated.md`
already models **five camps** (§4.1, line 328) — Observability & eval, Agent security,
Security suites, AI governance platforms, and **Model providers** as a fifth camp,
specifically to capture OpenAI Frontier and Microsoft Entra. That's a finer breakdown
than even this document's own four-camp table in Part 3, which omits "Model providers"
entirely — despite this same Part 2 treating Frontier and Entra as the two most critical
consolidation events. Part 3's camps table is the one that's under-counting, not the PRD.

**Consequence, revised:** the "agent-native security is still forming and open" premise
was already being corrected in the PRD in step with these events, not left stale. The
real lesson isn't "the PRD is behind the market" — it's that a same-day fix in one PRD
revision doesn't automatically retire the concern in every document that cites the old
picture, including this one. Three of the five camps are consolidating into incumbents
with distribution; that structural read still stands.

---

## Part 3 — The competitive field, as it actually stands

Four camps, not two. Our PRD modelled two.

| Camp | Players | Runtime enforcement | Compliance depth | Where we lose |
|---|---|---|---|---|
| **Agent-security pure-plays** | Zenity, Noma, Arthur, WitnessAI, Astrix | Strong | Thin | Estate-scale discovery, business-platform coverage, adaptive red team, maturity |
| **Security suites** | Palo Alto (Prisma AIRS), Cisco AI Defense, Check Point (+Lakera), SentinelOne (+Prompt Security) | Strong, network-integrated | Medium | Distribution, SOC integration, existing MSA |
| **AI governance platforms** (Gartner MQ) | IBM, ServiceNow, Truyo (Leaders); Airia, Credo AI, ModelOp, Monitaur, OneTrust (Visionaries); Holistic AI; Cranium, Relyance, Saidot, SAP | Mostly none — *Gartner notes most lack runtime enforcement* | Deep | Workflow engine, assessments, connectors, analyst recognition, installed base |
| **Eval / observability** | Braintrust, Arize, Fiddler, LangSmith, Patronus, Opik | N/A | N/A | Eval UX depth, datasets, experiment tooling, human review |

### What individual competitors have that we do not

| Competitor | Their capability | Our status |
|---|---|---|
| ServiceNow AI Control Tower | ~30 discovery integrations; MCP gateway; per-agent **kill switches** | ✗ none |
| Kosmoy | Kernel-enforced sandboxing, per-task credentials, kill switch, 4 cloud registries, air-gap K8s | ✗ none |
| Zenity | Inline step-level prevention *inside Copilot Studio*; low-code/Copilot agent coverage; Gartner "company to beat" | ✗ none |
| Noma | Adaptive red-team engine; per-agent identity + tool-level policy; self-host; $132M raised | ◐ static 11-probe suite |
| WitnessAI | Network-level capture of desktop apps and IDEs; PII **tokenisation**; warn/route/redact | ◐ tokenise yes, network capture no |
| Cisco AI Defense | Model validation, algorithmic red teaming, network-enforced guardrails, DefenseClaw sandbox | ✗ none |
| Astrix / Microsoft Entra | NHI lifecycle, secret rotation automation, Conditional Access, access packages, ITSM/SIEM/SOAR | ◐ NHI yes; no IdP, no SOAR |
| Credo AI | Policy Packs incl. NYC LL144; CE-marking support; Forrester Leader | ◐ 2 packs, all DRAFT |
| IBM watsonx.governance | AI Factsheets, SR 11-7 model-risk workflows, FedRAMP GovCloud | ✗ none |
| OneTrust | ~14,000-org installed base; third-party AI vendor risk; automated control mapping | ✗ none |
| Holistic AI | Published jailbreak audits; bias auditing; NYC LL144 / EU DSA audit heritage | ✗ none |
| LangSmith | Datasets with splits, pairwise comparison, experiments; $39/seat public pricing | ◐ basic suites |
| Almost all | **AWS / Azure Marketplace listing** (procurement path) | ✗ none |

---

## Part 4 — Gap register

Severity: 🔴 blocks the sale · 🟠 loses the bake-off · 🟡 competitive drag.
Effort: S ≤ 1wk · M 2–4wk · L 1–2mo · XL 3mo+ (single engineer).

### Tier 0 — Production blockers (the product cannot go inline)

| # | Gap | Sev | Effort | Evidence |
|---|---|---|---|---|
| 0.1 | **Streaming (SSE) unsupported and silently dropped** | 🔴 | M | verified: `stream:true` → non-streaming JSON |
| 0.2 | **No DB migrations** — `create_all()` only; a deployed instance cannot be upgraded | 🔴 | S | verified absent |
| 0.3 | **No kill switch / quarantine** — cannot stop a misbehaving agent; every competitor has one | 🔴 | S | verified absent |
| 0.4 | **Agent tool-calling loop not governed** — proxy forwards `tools`/`tool_calls` but does not enforce across the multi-turn loop | 🔴 | M | 2 refs only |
| 0.5 | **Everything synchronous** — evidence build, red-team, compliance compute run in-request | 🔴 | M | no queue/scheduler |
| 0.6 | **No HA / scale validation**; SQLite default is single-writer; NFR-3 never tested | 🔴 | M | acknowledged in traceability |
| 0.7 | No graceful degradation path if the control plane is down (fail-open exists per-detector, not per-service) | 🟠 | S | — |

### Tier 1 — Procurement blockers (cannot pass a security review)

| # | Gap | Sev | Effort | Note |
|---|---|---|---|---|
| 1.1 | **No real SSO (OIDC/SAML) or SCIM** — dev identity header in production code path | 🔴 | M | 40–60% of a SIG questionnaire is answerable from SOC 2 + SSO evidence |
| 1.2 | **Multi-tenancy not enforced** — `org_id` column exists, 0 queries filter on it | 🔴 | M | a single leak here ends the company |
| 1.3 | **No rate limiting / quota** on the control plane | 🔴 | S | verified absent |
| 1.4 | **Signing key and provider keys in env vars** — no Vault/KMS/CSFLE | 🔴 | M | undermines our own NFR-7 claim |
| 1.5 | **No SOC 2 Type II / ISO 27001** for us as a vendor | 🔴 | XL (org) | *most enterprise buyers require SOC 2 Type II before signing* |
| 1.6 | No third-party penetration test, VDP, or security.txt | 🔴 | M (org) | standard questionnaire item |
| 1.7 | No DPA, sub-processor register, DR/backup, RTO/RPO, incident-response commitments | 🔴 | M (org) | — |
| 1.8 | Dashboard is read-only and unauthenticated beyond a header | 🟠 | M | no approve/suppress/assign from UI |
| 1.9 | No audit log of *control-plane* logins/sessions (we audit agents, not operators) | 🟠 | S | ironic for an audit product |

### Tier 2 — Gartner MQ inclusion criteria (category table stakes)

Gartner's inclusion bar required all of the following **GA by 1 April 2026**: AI discovery and registry; compliance risk management; policy management and enforcement; **dynamic risk scoring**; evidence collection; **interoperability**; **workflow and approvals**; complete audit trail.

| # | Criterion | Our status | Sev | Effort |
|---|---|---|---|---|
| 2.1 | **Dynamic risk scoring** — continuous, signal-driven score per agent | ✗ static classification only, 0 refs | 🔴 | M |
| 2.2 | **Interoperability** — connectors to the estate (Bedrock, Azure AI, Vertex, Salesforce, ServiceNow, M365) | ✗ 0 refs; gateway + OTel only | 🔴 | L |
| 2.3 | **Workflow and approvals** — assessments, review cycles, attestations, task routing | ◐ runtime approvals only; no workflow engine | 🔴 | L |
| 2.4 | Discovery and registry at **estate scale** | ◐ inline + OTel; no agentic-platform enumeration | 🟠 | L |
| 2.5 | Evidence collection | ✅ strong — arguably best-in-class | — | — |
| 2.6 | Complete audit trail | ✅ strong — genuinely differentiated | — | — |
| 2.7 | **Findings do not auto-escalate to a human** — no owner routing, SLA, or deadline | 🟠 | M | identified in prior review |

### Tier 3 — Competitive parity

| # | Gap | Sev | Effort |
|---|---|---|---|
| 3.1 | Business-platform agents (M365 Copilot, Copilot Studio, Power Platform, Salesforce Agentforce) | 🟠 | XL |
| 3.2 | Adaptive / generative red teaming (ours is 11 static probes) | 🟠 | L |
| 3.3 | Framework instrumentation SDKs — LangChain/LangGraph callbacks, LlamaIndex, CrewAI, Claude Agent SDK | 🟠 | M |
| 3.4 | Entra Agent ID / Okta / Ping integration for NHI | 🟠 | M |
| 3.5 | FinOps — token cost attribution, budgets, chargeback | 🟠 | M |
| 3.6 | Bias / fairness testing (NYC LL144, EU DSA) — a named Holistic AI strength | 🟠 | L |
| 3.7 | Model risk management / SR 11-7 workflows — required in financial services | 🟠 | L |
| 3.8 | Third-party / vendor AI risk assessment — OneTrust's wedge | 🟡 | M |
| 3.9 | Memory & RAG governance (poisoning, retention, right-to-erasure in vector stores) | 🟠 | L |
| 3.10 | Sandboxed execution / per-task credentials | 🟡 | XL — *explicit PRD non-goal; revisit* |
| 3.11 | Network-level discovery (desktop apps, IDEs) | 🟡 | XL |
| 3.12 | AWS / Azure Marketplace listing | 🟠 | M (org) |
| 3.13 | Analyst engagement (Gartner MQ, Forrester Wave) | 🟠 | L (org) |
| 3.14 | Eval UX depth — dataset splits, pairwise comparison, human review queues, experiment tracking | 🟡 | L |
| 3.15 | **All 257 framework mappings are DRAFT** — our own gate excludes them from evidence packages | 🔴 | L (needs qualified reviewer) |
| 3.16 | No published pricing or self-serve tier — every Tier-A motion in the PRD assumes PLG | 🟠 | M |

---

## Part 5 — Where we are genuinely ahead (defend these)

These are real, tested, and largely unclaimed by the field:

1. **Argument-provenance taint tracking.** Zenity's "intent-based detection examines the full execution path including tool calls" is the closest public claim; nobody else advertises argument-level provenance with a capability ceiling. Our containment holds *after* detection fails — that is the durable defence.
2. **Tamper-evident audit with an independent verifier.** No competitor advertises a hash-chained log shipping a stdlib-only verifier an auditor can run without the vendor. For regulated buyers this is a differentiator you can demonstrate in 60 seconds.
3. **Silent-failure detection.** Galileo and Braintrust do evals; nobody frames *governing correctness* as part of the governance product. Gartner's own read is that the governance camp lacks runtime — we have runtime **and** correctness.
4. **Control status computed from telemetry, not attested.** The governance camp collects attestations. We compute, and a broken chain forces `failing`.
5. **Declared gaps per framework.** Publishing what we do *not* cover is unusual and disproportionately credible in an audit conversation.
6. **Policy simulation before enforcement** — replays real traffic, exits non-zero on new blocks.
7. **Self-host default, zero egress, offline-capable.** Zenity is SaaS-only; Credo AI is SaaS-only; OneTrust is SaaS-only. For regulated buyers this is a live wedge.

**Strategic read:** Gartner explicitly notes most governance platforms lack runtime enforcement, and the security pure-plays lack compliance depth. **Our original thesis is still correct.** We are losing on the surrounding product, not on the idea.

---

## Part 6 — The enterprise procurement bar

What a Tier-B/C buyer will require before signing, and our status:

| Requirement | Status |
|---|---|
| SOC 2 Type II report | ✗ |
| ISO 27001 certification | ✗ |
| SIG Lite / SIG Core questionnaire response | ✗ no completed questionnaire |
| Third-party penetration test report | ✗ |
| SSO (SAML/OIDC) + MFA + SCIM | ✗ |
| RBAC with least privilege | ✅ (6 roles, enforced, tested) |
| Data residency / regional hosting | ◐ self-host yes; no managed regions |
| Encryption at rest + in transit, key management | ◐ transport yes; no KMS/CSFLE |
| DPA, sub-processors, GDPR/DPIA support | ✗ |
| BC/DR, RTO/RPO, backup/restore | ✗ |
| Uptime SLA + support tiers | ✗ |
| Audit log of administrative actions | ◐ agents audited, operators not |
| Vulnerability management + patch SLA | ✗ |
| AWS/Azure Marketplace (procurement path) | ✗ |

**11 of 14 are unmet.** None is hard individually; together they are the difference between a demo and a contract.

---

## Part 7 — Recommendation

**Do not build breadth next. Build deployability.**

The instinct after a gap analysis this long is to chase feature parity with Zenity or Credo AI. That would be wrong: we would spend a year reaching parity on their strengths while our own differentiators sit inside a product that cannot be installed.

Suggested sequencing — **revised** after the failure-mode analysis. Tier 0 still comes first
(nothing ships without it), but the differentiating work is no longer competitor parity; it is
the four control families in [failure-modes.md](failure-modes.md): entitlement-aware data access,
action semantics/blast radius, answerability & abstention, and source authority. Those are what
a buyer's own incident list will contain.

- **Phase A — Make it deployable (Tier 0).** Streaming, migrations, kill switch, agent-loop governance, async workers, HA. *Without this nothing else matters.*
- **Phase B — Make it buyable (Tier 1).** SSO/SCIM, multi-tenancy enforcement, rate limiting, KMS, operator audit log, writable dashboard. Start the SOC 2 clock in parallel — it is the longest pole and it is organisational, not engineering.
- **Phase C — Qualify for the category (Tier 2).** Dynamic risk scoring, connector framework, assessment/workflow engine, finding→HITL escalation. This is the Gartner MQ inclusion bar.
- **Phase D — Differentiate on real failure modes, not competitor features.** The four families
  in [failure-modes.md](failure-modes.md) §"What this implies for the build", then escalation
  governance (F5 — the largest single failure class). Deliberately *skip* sandboxing and
  business-platform coverage — XL effort, defended by well-funded incumbents, and not what the
  failure data says matters most.

Two decisions needed from you before the next PRD:

1. **Reclassify promptfoo.** It is now provider-owned. Options: drop it, keep it as an optional adapter with a warning, or fork. Our own Appendix A rule says it comes off the critical path — the native runner already is the default, so this is mostly a documentation and register change.
2. **Vertical or horizontal.** Still unresolved from the original PRD, and it now determines whether Phase D includes SR 11-7 (financial services) or bias auditing (HR/employment). The gap list is materially different per vertical.

---

## Sources

Vendor and market research: [Arthur — Best AI Agent Security Platforms 2026](https://www.arthur.ai/column/best-ai-agent-security-platforms-2026) · [Kosmoy — Best AI Agent Governance Platforms 2026](https://www.kosmoy.com/resources/blog/best-ai-agent-governance-platforms-2026/) · [Kosmoy — Best AI Governance Platforms 2026 (9 vendors + Gartner MQ)](https://www.kosmoy.com/resources/blog/best-ai-governance-platforms-2026/) · [Modulos — AI governance tools buyer's guide](https://www.modulos.ai/best-ai-governance-platforms/) · [MarkTechPost — LLM observability & evaluation platforms 2026](https://www.marktechpost.com/2026/08/09/top-llm-observability-and-evaluation-platforms-in-2026-langfuse-langsmith-braintrust-arize-and-more-compared/) · [Braintrust — AI observability buyer's guide](https://www.braintrust.dev/articles/best-ai-observability-tools-2026)

Gartner: [Magic Quadrant for AI Governance Platforms](https://www.gartner.com/en/documents/8006369) · [IBM — recognised as a Leader](https://www.ibm.com/new/announcements/ibm-recognized-as-a-leader-in-gartner-magic-quadrant-for-ai-governance-platforms)

Acquisitions: [OpenAI to acquire Promptfoo](https://openai.com/index/openai-to-acquire-promptfoo/) · [Promptfoo — joining OpenAI](https://www.promptfoo.dev/blog/promptfoo-joining-openai/) · [CNBC — OpenAI buys Promptfoo](https://www.cnbc.com/2026/03/09/open-ai-cybersecurity-promptfoo-ai-agents.html) · [Check Point acquires Lakera](https://www.checkpoint.com/press-releases/check-point-acquires-lakera-to-deliver-end-to-end-ai-security-for-enterprises/) · [CSO Online — Check Point/Lakera](https://www.csoonline.com/article/4058653/check-point-acquires-lakera-to-build-a-unified-ai-security-stack.html)

Platform risk: [OpenAI Frontier guide](https://www.digitalapplied.com/blog/openai-frontier-enterprise-ai-agent-platform-guide) · [Microsoft Entra Agent ID](https://learn.microsoft.com/en-us/entra/agent-id/what-is-microsoft-entra-agent-id) · [Entra ID Governance for agents](https://learn.microsoft.com/en-us/entra/id-governance/agent-id-governance-overview) · [What's new in Agent 365 — June 2026](https://techcommunity.microsoft.com/blog/agent-365-blog/whats-new-in-agent-365-%E2%80%93-june-2026/4535107)

Procurement: [Konfirmity — SOC 2 customer security questionnaire](https://www.konfirmity.com/blog/soc-2-customer-security-questionnaire) · [Workstreet — security compliance questionnaires](https://www.workstreet.com/blog/security-compliance-questionnaires) · [Copla — vendor security assessment questionnaires](https://copla.com/blog/third-party-risk-management/guide-to-vendor-security-and-risk-assessment-questionnaires/)
