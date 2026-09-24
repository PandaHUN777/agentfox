"""Thin subprocess client for `llm_guard_bridge.py`, callable from the main
project's `uv run` interpreter without ever installing `llm-guard` into it.

Set `LLM_GUARD_VENV_PYTHON` to the interpreter path of the isolated venv (see
`llm_guard_bridge.py`'s docstring for how to build one) before running any
benchmark script that imports this module.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

_BRIDGE = Path(__file__).parent / "llm_guard_bridge.py"


class LlmGuardUnavailable(RuntimeError):
    pass


def scan(texts: list[str]) -> list[dict]:
    """Run `texts` through llm-guard's real `PromptInjection` scanner.

    Returns `[{"text": ..., "is_injection": bool, "risk_score": float}, ...]`,
    llm-guard's own verdict — nothing here is a agentfox threshold.
    """
    python = os.environ.get("LLM_GUARD_VENV_PYTHON")
    if not python or not Path(python).exists():
        raise LlmGuardUnavailable(
            "Set LLM_GUARD_VENV_PYTHON to an interpreter with llm-guard installed "
            "(see llm_guard_bridge.py's docstring) to run the comparison."
        )
    proc = subprocess.run(
        [python, str(_BRIDGE)],
        input=json.dumps({"texts": texts}),
        capture_output=True,
        text=True,
        timeout=max(60, len(texts) * 2),
    )
    if proc.returncode != 0:
        raise LlmGuardUnavailable(f"llm-guard bridge failed: {proc.stderr[-2000:]}")
    return json.loads(proc.stdout)
