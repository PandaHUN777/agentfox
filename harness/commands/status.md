---
description: Read-only governance posture — runtime health, open findings, policy modes, stopped agents
allowed-tools: Bash(*nometria* doctor*) Bash(*nometria* findings*) Bash(*nometria* policy list*) Bash(*nometria* agents *) Bash(*nometria* auth status*)
---
Run these read-only commands with `nometria` (see the harness AGENTS.md "Running the CLI" if
it isn't on PATH):

1. `doctor --json`
2. `findings --json --limit 100`
3. `policy list`
4. `agents controls`
5. `auth status`

Report in five short lines:

- runtime health, listing any `bad`/`warn` checks
- open findings by severity
- which policies enforce and which observe (remember `tool-containment` enforces by default)
- agents that are not active
- whether this deployment's auth is safe for where it runs

End with the single most important next action and the skill that handles it. Change
nothing.
