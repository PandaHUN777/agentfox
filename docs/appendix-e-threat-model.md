# Appendix E — Threat Model

Two threat models, and conflating them is a common failure in this category:

- **E.1 — Threats to the customer's agents.** What the product defends against. Drives Pillars 3, 2 and 4.
- **E.2 — Threats to Nometria itself.** We sit inline on the customer's critical path and hold their most sensitive text. We are a high-value target and a potential single point of failure.

Taxonomy anchors: OWASP LLM Top 10 (2025), OWASP Agentic Threats T1–T15, MITRE ATLAS. Mapped to controls in [Appendix B](appendix-b-control-catalog.md).

---

## E.1 Threats to the customer's agents

### E.1.1 Injection & instruction hijacking

| Threat | Vector | Control | Residual risk |
|---|---|---|---|
| **Direct prompt injection** — user overrides the system prompt | User message | NOM-RTG-01 (P3-1): heuristic + structural + classifier detection | Novel phrasings evade classifiers. Mitigated by defence-in-depth: even a successful injection must still pass tool authorisation (NOM-RTG-04). |
| **Indirect prompt injection** — payload arrives via a retrieved document or tool result | RAG chunk, web page, tool response, email body | P3-1 runs on **all** untrusted surfaces, not just user input; taint tagging marks the content | The highest-severity realistic attack on agents. Our answer is not "detect every payload" — it is "a tainted argument cannot reach an irreversible tool without approval" (P3-4). |
| **Sub-agent / A2A poisoning** | Output of one agent becomes input to another | Taint propagates across delegation; `max_taint` on capabilities | Cross-process propagation is MVP-partial (P2-5). |
| **Memory poisoning** (Agentic T1) | Persisted conversation/vector memory | Detectors run on memory reads; drift + red-team probes | We do not secure the vector store itself (§2.3 non-goal). |

**The architectural position worth stating.** Detection of injection is a losing arms race played alone. The durable defence is *containment*: assume the model can be convinced of anything, and constrain what a convinced model is permitted to do. That is why P3-4 (intent-based tool containment with argument provenance) is the differentiator and P3-1 is table-stakes.

### E.1.2 Data exposure

| Threat | Vector | Control |
|---|---|---|
| PII to a third-party model | Prompt construction | NOM-RTG-02 (P3-2) inbound Presidio-backed detection + redact/block |
| PII/secret leakage to a user or tool | Model output, tool arguments | NOM-RTG-02/03 outbound; both directions is the requirement |
| Credential exfiltration | Agent holds long-lived secrets | NOM-RTG-03 detection today; NOM-IAM-01 + credential brokerage (P2-6) removes the class — Phase 2/3 |
| System-prompt leakage (LLM07) | Extraction prompts | Output detector for prompt-shaped content + canary tokens |
| Exfiltration via inference API (ATLAS AML.T0024) | High-volume probing | NOM-RTG-08 consumption bounds + behavioural anomaly (P4-3d) |

### E.1.3 Excessive agency & tool abuse

| Threat | Control |
|---|---|
| Agent takes an irreversible action it should not (LLM06, Agentic T2) | NOM-IAM-02 default-deny least privilege with **argument-level** constraints; NOM-IAM-03 HITL on `irreversible` tools |
| Privilege escalation via delegation (T3) | NOM-IAM-05 — child ⊆ parent enforced at write time |
| Confused deputy — agent used as a proxy to reach data the caller cannot | Capabilities bound to the *identity*, evaluated per call; taint provenance in the decision |
| Runaway loop / resource exhaustion (LLM10, T4) | NOM-RTG-08 depth + budget limits, loop breaking |
| Tool poisoning — malicious instructions inside an MCP tool description; silent schema swap | NOM-DSC-05 — snapshot digests, description-injection scanning, pinning |

### E.1.4 Correctness failures (the pillar security vendors omit)

| Threat | Control |
|---|---|
| **Silent failure** — plausible, confident, wrong (~78% of failures) | NOM-EVL-03 (P4-3) — groundedness, self-consistency, contract violation, behavioural anomaly, hedging, task-completion |
| Regression on release | NOM-EVL-01 CI gating |
| Drift after release | NOM-EVL-02 online scoring + PSI/KS |
| Cascading hallucination across agents (T5) | Groundedness scored at each hop; lineage shows blast radius |
| Undetected model substitution by a provider | Cross-model comparison (P4-8) + behavioural envelope |

### E.1.5 Repudiation

| Threat | Control |
|---|---|
| "Prove what the agent did on 3 March" (T8) | NOM-AUD-01 full execution path; NOM-AUD-02 tamper-evident chain |
| Insider alters history to hide an incident | Hash chain + checkpoints signed with a key outside the app DB; `auditor` role cannot mutate |
| Policy retro-fitting — "that rule was always on" | `PolicyVersion` immutability; every `Decision` binds the exact version in force |

---

## E.2 Threats to Nometria

### E.2.1 We are inline on the critical path

| Threat | Impact | Mitigation |
|---|---|---|
| **Gateway outage takes the customer's agent down** | Catastrophic — the fastest way to be removed from production | NFR-2. P3-7 fail-open per policy and environment, chosen deliberately and audited. SDK path degrades to local-only enforcement. Health-check-driven bypass. **A governance tool that becomes an outage is uninstalled the same week.** |
| **Latency regression** | We become a performance problem | NFR-1 as a tested budget in CI; concurrent detectors with per-detector timeouts; heuristic fast path before any model-based detector; degrade-to-observe over budget |
| **False blocks** (PRD R3) | Trust destroyed; product disabled and never re-enabled | Observe mode by default; P2-7 simulation before enforcement; per-decision override with feedback; per-detector precision tracked and surfaced (P3-11) |

### E.2.2 We hold the most sensitive text in the company

| Threat | Mitigation |
|---|---|
| Our store becomes a new PII honeypot (PRD R8) | **Redaction at capture** (P5-5) — findings store offsets and redacted samples, not raw values. Retention bounded per data class. Encryption at rest and in transit. |
| Exfiltration through our own telemetry | Zero egress by default (NFR-4). No phone-home. Self-host is the only MVP mode. |
| Compromise of the signing key ⇒ forged checkpoints | Key outside the application database; customer-held in self-host; checkpoint verification is independent of us |
| Supply-chain compromise of a wrapped OSS dependency | Pinned versions, hashes, SBOM; adapter seam allows removing any single dependency (Appendix A exposure column) |

### E.2.3 We are a governance product, so our own governance is scrutinised

| Threat | Mitigation |
|---|---|
| Our audit chain has a bug ⇒ every compliance claim is void | Chain verification is unit- and property-tested against insertion, deletion, reordering and mutation; verification is a pure function over exported rows |
| A detector silently stops running and controls report `effective` | `DetectorRun.status` is recorded per request; NOM-RTG-06 makes degradation a *finding*; control status computed from coverage, not from configuration |
| Draft framework mappings presented as authoritative | `review_status` gate; DRAFT badge in UI; drafts ship in evidence packages chip-labeled `DRAFT — UNVERIFIED / NOT LEGAL ADVICE` rather than excluded (Appendix B §B.6) |
| We claim coverage we do not have | Declared gap list per framework (Appendix B §B.4), rendered next to every coverage claim |

### E.2.4 Privileged position abuse

We can read every prompt and output the customer's agents produce. Controls: RBAC with an `auditor` role that cannot mutate; every access to traces and evidence writes its own `AuditEntry` (§C.5 — who looked at the evidence is audit-relevant); no support back-channel into customer data in self-host; the customer holds the signing key.

---

## E.3 Assumptions & out of scope

**Assumed:** the customer's network/host security, their IdP, their model provider's own security, and the sandbox isolating tool execution (§2.3 — E2B/Modal/Daytona's job, not ours).

**Explicitly out of scope:** training-time attacks and model supply chain (ATLAS training techniques, LLM04 in its training sense); vector-store security (LLM08 beyond symptom detection); T11 Unexpected RCE (sandbox concern); T14/T15 human-directed social attacks; non-text modalities in MVP (§6.3).

**Stated because a compliance product must:** none of the above is a claim of completeness. Appendix B §B.4 carries the framework gap list, and this section is its threat-side counterpart.
