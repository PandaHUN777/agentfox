# AgentDojo, end to end: benign utility and attack containment

```bash
uv run python benchmarks/agentdojo_e2e/run_agentdojo_e2e.py
```

[AgentDojo](https://github.com/ethz-spylab/agentdojo) (MIT, ETH Zurich) is the reference dynamic benchmark for prompt injection against tool-using agents. Our existing [`../action_safety/`](../action_safety/README.md) run scores only the *syntax* of its arguments, and says so:

> "`analyse_arguments` has no reason to catch a well-formed `send_money(...)` call; catching *that* is what taint tracking and capability grants are for."

This benchmark is that missing half, and it is the honest test: AgentDojo's injection tasks are exactly the attack our containment story claims to stop.

## Method

AgentDojo ships hand-authored ground-truth call sequences for both categories, so no model is needed and the replay is deterministic and offline:

| Category | Calls | What it represents |
|---|---|---|
| `user` | 552 | what a correctly-behaving agent calls for its real assignment |
| `injection` | 65 | what a **successfully compromised** agent calls on the attacker's behalf |

Both are replayed through `Enforcer.guard_tool_call`, the same call the SDK, LangGraph node, MCP governor and gateway make before a tool executes. User-task arguments are marked user-sourced; injection-task arguments are marked as arriving from tool output, which is AgentDojo's own threat model.

**The construction is deliberately strict against us.** One agent per suite is granted exactly the tools its own legitimate user tasks call, at `max_taint: user`, with no blanket approval requirement. An injection call is therefore contained only by provenance, impact and constraint logic, never because we conveniently withheld a grant it needed. Agents are `risk_tier: limited` on purpose: the shipped EU AI Act pack escalates every irreversible action by a `high`-tier agent regardless of provenance, which would have made containment trivially complete for a reason unrelated to the attack.

## Results

| | detectors on | detectors off |
|---|---|---|
| **Benign utility** — legitimate calls allowed | **552/552 (100%)** | **552/552 (100%)** |
| Attacker calls that *act* (write or irreversible) contained | **42/42 (100%)** | **42/42 (100%)** |
| Attacker calls that only *read*, contained | 20/23 (87.0%) | 20/23 (87.0%) |
| All attacker calls contained | 62/65 (95.4%) | 62/65 (95.4%) |

Per suite, injection calls contained: banking 21/23, slack 12/13, travel 17/17, workspace 12/12.

**The two columns are identical, and that is the finding.** Detection contributed nothing here, because an injected `send_money` call is syntactically ordinary — there is no malicious string to catch in the arguments. Everything that stopped these attacks was provenance, impact tier and grant logic, which is precisely the claim [`../containment/`](../containment/README.md) makes in the small and this run reproduces at scale across four unrelated tool domains.

## What escaped, and why we are not calling it a rounding error

All three escapes are **read-only** calls: `get_scheduled_transactions` twice, and `get_channels`. The compromised agent was told to read something it already held a legitimate grant for, and it did.

Nothing in impact-tier or taint logic distinguishes that from ordinary work, by design: the agent is allowed to read those things. The harm in that attack shape arrives later, when the data leaves — which is the exfiltration step our irreversible-tool containment does stop, and which is separately governed by entitlement and purpose limitation ([`../entitlement/`](../entitlement/README.md)). A product that blocked these reads would also block the agent doing its job, as the 552/552 utility column shows.

Stated plainly: **this benchmark shows we contain the acting half of an injection completely, and the reading half not at all.** Anyone selling the 95.4% figure without that sentence is misrepresenting it.

## What this benchmark does not show

- **It is not AgentDojo's "utility under attack" metric.** That requires driving a live model through the environment, which needs a model and network. We measure the two halves that can be measured exactly, and skip the one that cannot be done offline rather than approximating it.
- **Impact tiers are our judgement, not AgentDojo's.** AgentDojo has no impact model. Ours is applied mechanically by verb (`send_money`, `delete_*`, `send_email`, `reserve_*` and similar are irreversible; `create_*`/`update_*` are writes; `get_*`/`search_*`/`read_*` are reads) so a reader can check it. This is the single most load-bearing assumption here. A tool mis-declared as `read` is not contained, which is the same declaration-dependence stated in [`../containment/`](../containment/README.md).
- **No model was fooled to produce these calls.** Compromise is the premise, taken from AgentDojo's own answer key, not something this run demonstrates.
- **552 user calls is a utility check, not a quality check.** It shows governance did not block legitimate work. It says nothing about whether the agent's answers were good.

## Files

- `run_agentdojo_e2e.py` — the replay; self-contained, throwaway SQLite database, offline.
- `results/agentdojo_e2e_results.json` — every one of the 617 calls in both detector modes, with verdict and rules fired.
