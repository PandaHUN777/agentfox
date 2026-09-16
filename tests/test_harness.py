"""The agent harness (harness/) must not drift from the product it drives.

Three guarantees, each cheap and offline:
  * every `nometria …` command/flag, repo path and docs-map entry in the harness markdown
    is real (harness/scripts/check_harness.py);
  * the safety hook asks before exactly the commands that change what gets blocked, and
    never on look-alikes (harness/scripts/guard_blocking_commands.py);
  * Appendix C's generated route tables match the running app (scripts/api_routes.py).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
HOOK = REPO / "harness" / "scripts" / "guard_blocking_commands.py"


def _run(args: list[str], **kwargs) -> subprocess.CompletedProcess:
    env = {**__import__("os").environ, "PYTHONPATH": str(REPO / "src")}
    return subprocess.run(
        args, cwd=REPO, capture_output=True, text=True, env=env, timeout=120, **kwargs
    )


def test_harness_markdown_matches_the_live_cli_and_repo():
    result = _run([sys.executable, str(REPO / "harness" / "scripts" / "check_harness.py")])
    assert result.returncode == 0, result.stdout + result.stderr


def test_appendix_c_routes_are_generated_from_the_app():
    result = _run([sys.executable, str(REPO / "scripts" / "api_routes.py"), "--check"])
    assert result.returncode == 0, result.stdout + result.stderr


def _decision(command: str) -> str:
    result = _run(
        [sys.executable, str(HOOK)], input=json.dumps({"tool_input": {"command": command}})
    )
    assert result.returncode == 0
    if not result.stdout.strip():
        return "allow"
    return json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"]


@pytest.mark.parametrize(
    "command",
    [
        "nometria policy enforce baseline",
        "uv run --project /r nometria policy observe baseline",
        "python -m nometria.cli.main agents kill payments-ops",
        "cd /x && nometria agents quarantine s -r incident",
        "NOMETRIA_DATABASE_URL=sqlite:////tmp/x.db nometria demo",
        "harness/scripts/nometria.sh seed",
        "nometria db downgrade base",
        "nometria guardrails apply rule.yaml --mode enforce",
        "nometria boundary set support --mode=enforce",
        "nometria auth issue a@b.c",
        "nometria check . --json --submit",
        "curl -X POST localhost:8080/api/policies/baseline/mode -d '{}'",
    ],
)
def test_blocking_commands_require_confirmation(command):
    assert _decision(command) == "ask"


@pytest.mark.parametrize(
    "command",
    [
        "nometria findings --json",
        "nometria policy list",
        "nometria policy simulate -f p.yaml",
        "nometria check . --fail",
        "nometria escalation set --agent a --mode observe",
        "nometria demo-notes.md",
        "git commit -m 'nometria policy enforce baseline'",
        "echo nometria seed",
        "cat docs/nometria-policy-enforce.md",
    ],
)
def test_read_only_and_look_alike_commands_pass_silently(command):
    assert _decision(command) == "allow"


def test_hook_never_breaks_on_garbage_input():
    result = _run([sys.executable, str(HOOK)], input="not json")
    assert result.returncode == 0 and result.stdout == ""
