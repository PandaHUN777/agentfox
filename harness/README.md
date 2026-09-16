# Nometria harness

An agent harness for the Nometria control plane. It packages the product's knowledge as
**skills, commands, subagents and safety hooks**, so a person can say "get my support agent
governed" or "get me ready for the SOC 2 audit" and a coding agent can do it correctly.
Without it, they'd have to learn 17 CLI groups, 150+ API routes and 43 docs first.

## Install

**Claude Code, from GitHub:**

```bash
claude plugin marketplace add architsharm/guardrails
```

```bash
claude plugin install nometria@nometria
```

**Claude Code, from a local clone (no install, for trying it or developing it):**

```bash
claude --plugin-dir ./harness
```

**Any other agent (Codex, Cursor, Gemini CLI, Aider, …).** Point it at
[`harness/AGENTS.md`](AGENTS.md). Everything is plain markdown with relative links, and the
skills follow the `SKILL.md` folder convention.

The harness drives the `nometria` CLI, so the product has to be installed where the agent
runs:

```bash
pip install "git+https://github.com/architsharm/guardrails.git"
```

## What you get

| Type the command | What happens |
|---|---|
| `/nometria:tour` | Safe, offline tour of the product in a scratch database |
| `/nometria:start [path]` | Scan your code, add `nometria.auto()` in observe mode, show what it sees |
| `/nometria:status` | Read-only posture: doctor, open findings, policy modes, agent states |
| `/nometria:findings [severity]` | Grouped triage with a recommended action for each finding |
| `/nometria:policy <what you want>` | Draft, validate, lint and simulate a policy; promotion only on your say-so |
| `/nometria:guardrail "<business rule>"` | Plain English → an executable business guardrail, in observe mode |
| `/nometria:gate [suite]` | Eval regression gate and a CI workflow for your repo |
| `/nometria:redteam <agent>` | Adversarial probes, results explained, fixes proposed |
| `/nometria:evidence [agent]` | Verify the audit chain and export an auditor-ready package |
| `/nometria:contain <agent> [reason]` | Incident response: quarantine (with confirmation), blast radius, evidence |
| `/nometria:harness-check` | Check the harness against the live CLI and repo (for maintainers) |

**MCP server.** The plugin also starts `nometria mcp serve`, which gives any MCP client 24
read-only tools: posture, findings, policy validate and simulate, guard a piece of text,
analyse a SQL/shell/HTTP action, audit verify, compliance status, guardrail tests and more.
Other MCP clients can run it directly:

```bash
nometria mcp serve
```

Subagents (the model delegates to them, or you ask for one by name):

- **governance-auditor**: a read-only posture review that ends in a written report.
- **policy-author**: drafts and simulates policy. It never promotes one.
- **integration-engineer**: wires guardrails into your code in observe mode.

The **safety hook** turns every command that changes what gets blocked into a permission
prompt with a plain-language reason. That covers `policy enforce`, `agents kill`, `demo`,
`--mode enforce` and `--submit`.

## How it's organised

See [STRUCTURE.md](STRUCTURE.md): four layers of markdown, one home per fact, and a drift
checker that keeps it honest:

```bash
uv run python harness/scripts/check_harness.py
```
