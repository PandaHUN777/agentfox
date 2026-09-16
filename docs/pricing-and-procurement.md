# Pricing and procurement readiness — draft for decision

**Status: a draft proposal, not a decision.** Nothing here is published or committed to. It exists because
two of the most consequential gaps in [gap-analysis.md](gap-analysis.md) are commercial rather than
technical, and they block the buyer who is most persuaded by the product: no published pricing (item 3.16)
and an unmet procurement bar (Part 6). Both need a human decision; this document is written so that decision
takes an hour rather than a week.

## 1. Why no pricing is a real problem

A direct competitor in the adjacent category publishes **$39/seat**. We publish nothing. The effect is not
neutrality, it is friction: a platform engineer who likes the product cannot tell their manager what it
costs, cannot build a business case, and cannot get it into a budget cycle. Every PLG motion in the PRD
assumes a self-serve path that does not exist yet.

## 2. Why per-seat is the wrong unit here

Seats measure the wrong thing. Nobody's value from this product scales with how many humans log into a
dashboard; it scales with how many agents are governed and how much traffic flows through enforcement. Three
candidate units, with the trade-off stated:

| Unit | Argument for | Argument against |
|---|---|---|
| **Per governed agent** | Matches the value story exactly: an agent is the thing being governed, and the count is visible in the registry | Penalises decomposition — teams splitting one agent into five for good engineering reasons pay five times |
| **Per governed decision** (metered) | Scales with actual protection delivered; cheap to start, grows with adoption | Unpredictable for a buyer; procurement dislikes variable cost; punishes exactly the high-traffic deployments we most want |
| **Per environment / deployment, tiered by agent count band** | Predictable, procurement-friendly, does not punish decomposition, still grows with adoption | Coarse; a band boundary can feel arbitrary |

**Recommendation: tiered by agent-count band, self-hosted, with an unlimited free tier below the band where
governance stops being optional.** It preserves the adoption path (`pip install`, one line, free while you
have a handful of agents), it prices the moment the product becomes load-bearing, and it is the only one of
the three that a procurement team can approve without a usage forecast.

Suggested shape, for the user to accept or reject:

| Tier | Who it is for | Suggested price |
|---|---|---|
| **Free, self-hosted** | up to 5 governed agents, community support | $0 |
| **Team** | up to 25 agents, email support, evidence packages | mid four figures per year |
| **Enterprise** | unlimited agents, SSO/SCIM, DR commitments, reviewed compliance mappings, support SLA | five figures per year, negotiated |

The open-source Apache-2.0 core stays as it is. What Team and Enterprise buy is not the code — it is
support, the reviewed compliance content, and the commitments listed below.

## 3. The procurement bar

From [gap-analysis.md](gap-analysis.md) Part 6: **6 of 14 standard requirements are met.** None of the
remaining eight are engineering problems, which is why no amount of building has closed them.

| Requirement | Status | Who can close it |
|---|---|---|
| SOC 2 Type II | ✗ | Auditor engagement, 6–12 months including observation window |
| ISO 27001 | ✗ | Same programme, usually sequenced after SOC 2 |
| Third-party penetration test | ✗ | A vendor and a budget; the fastest item on this list |
| Filled SIG / CAIQ questionnaire | ✗ | Mostly answerable once SOC 2 and SSO exist |
| DPA + sub-processor register | ✗ | Counsel, a few days |
| Published DR / RTO / RPO | ✗ | An operational commitment, then documentation |
| Uptime SLA | ✗ | A commercial decision tied to the tiers above |
| Marketplace listing (AWS / Azure) | ✗ | Weeks of paperwork; unlocks committed-spend budgets |
| Vulnerability disclosure policy + `security.txt` | ✗ | An afternoon |
| Tamper-evident audit | ✅ | shipped |
| Data residency / self-host | ✅ | shipped, zero-egress default |
| Role-based access control | ✅ | shipped |
| Encryption at rest for secrets | ✅ | shipped |
| Operator action audit | ✅ | shipped |

**Sequencing recommendation:** the vulnerability disclosure policy and the penetration test first, because
they are cheap and they unblock the security questionnaire that arrives before procurement. SOC 2 has a
calendar that cannot be compressed, so start the clock early even if nothing else is ready. Marketplace
listing matters more than its effort suggests, because it converts a purchase into committed-spend budget
that is already approved.

## 4. What to decide

1. Accept or change the pricing unit (agent-count bands, self-hosted).
2. Accept or change the three tiers and their rough price points.
3. Approve starting the SOC 2 clock, or explicitly defer it with a date.
4. Approve a penetration-test budget.
5. Name an owner for the compliance-mapping review (see
   [appendix-b-control-catalog.md](appendix-b-control-catalog.md) §B.6) — today every mapping ships as
   DRAFT, which is the single loudest "not ready" signal in an audit conversation.
