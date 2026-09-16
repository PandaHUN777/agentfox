#!/usr/bin/env python3
"""PreToolUse hook: make the agent ask before a nometria command changes what is blocked.

The product's own safety stance is "observe first; enforcement is an explicit human act".
An agent driving the CLI must not quietly break that, so every command below is turned
into a permission prompt with a plain-language reason. Anything else passes through
untouched. Stdlib only; never blocks outright; a parse failure lets the call through.
"""

from __future__ import annotations

import json
import re
import sys

# A nometria invocation at *command position* only — so a commit message or a filename
# that merely mentions "policy enforce" is not mistaken for running it.
#   nometria …  |  uv run [--project X] nometria …  |  python -m nometria.cli.main …
#   …/scripts/nometria.sh …   (optionally preceded by VAR=value assignments)
_PREFIX = (
    r"^(?:\w+=\S*\s+)*"
    r"(?:(?:uv\s+run(?:\s+--\S+(?:\s+(?!nometria\b)\S+)?)*\s+)|(?:\S*python[\d.]*\s+-m\s+))?"
    r"(?:\S*/)?nometria(?:\.cli\.main|\.sh)?\s+"
)
_END = r"(?=\s|$)"

CLI_RULES: list[tuple[re.Pattern[str], str]] = [
    (
        r"policy\s+enforce" + _END,
        "promotes a policy to ENFORCE — matching production traffic starts being blocked.",
    ),
    (
        r"policy\s+observe" + _END,
        "demotes a policy to OBSERVE — traffic it was blocking will be let through.",
    ),
    (r"agents\s+(?:kill|quarantine)" + _END, "stops a production agent (kill switch)."),
    (r"agents\s+resume" + _END, "restarts a stopped agent."),
    (
        r"demo" + _END,
        "runs the demo, which writes demo agents and data and briefly enforces `baseline` "
        "in whatever DB NOMETRIA_DATABASE_URL points at. Use a scratch DB.",
    ),
    (
        r"seed" + _END,
        "seeds demo agents, policies and keys into the configured DB "
        "(with --show-keys, raw keys are printed).",
    ),
    (r"db\s+downgrade" + _END, "rolls back database migrations (can drop columns and data)."),
    (
        r"(?:guardrails\s+apply|boundary\s+set|escalation\s+set)\s.*--mode[\s=]+enforce" + _END,
        "turns a guardrail/boundary/escalation rule on in ENFORCE mode.",
    ),
    (
        r"auth\s+(?:issue|revoke)" + _END,
        "mints or revokes an API token (a minted token is shown once, in this transcript).",
    ),
    (
        r"(?:check|quickscan)\s.*--submit" + _END,
        "uploads a redacted scan summary to a remote Nometria API.",
    ),
]
CLI_RULES = [(re.compile(_PREFIX + pat), why) for pat, why in CLI_RULES]  # type: ignore[misc]

CURL_RULE = (
    re.compile(
        r"^(?:\w+=\S*\s+)*curl\b.*(?:/api/policies/[^/\s]+/mode|/api/agents/[^/\s]+/(?:kill|quarantine|resume)|/api/approvals/[^/\s]+/(?:approve|deny))"
    ),
    "calls a control-plane endpoint that changes enforcement, stops an agent, "
    "or decides an approval.",
)

_SPLIT = re.compile(r"\s*(?:&&|\|\||;|\||\n|\$\(|`|\()\s*")


def reasons_for(command: str) -> list[str]:
    reasons: list[str] = []
    for segment in _SPLIT.split(command):
        segment = segment.strip()
        for pattern, why in [*CLI_RULES, CURL_RULE]:
            if pattern.search(segment) and why not in reasons:
                reasons.append(why)
    return reasons


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        command = payload.get("tool_input", {}).get("command", "") or ""
    except Exception:
        return 0  # never break the session because of the hook itself
    reasons = reasons_for(command)
    if not reasons:
        return 0
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "ask",
                "permissionDecisionReason": "Nometria harness: this command "
                + " Also: ".join(reasons)
                + " Confirm the user asked for exactly this.",
            }
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
