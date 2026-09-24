"""Standalone bridge to a real `llm-guard` install, run via a subprocess.

`llm-guard` (Protect AI, MIT) pins `transformers==4.51.3` / `tokenizers==0.21.4`,
which conflicts with this project's own pinned versions (`transformers>=5`, needed
for `leolee99/PIGuard`). Rather than fight that in the main project venv, this
script has zero `agentfox` imports and is meant to be run with a *separate*
interpreter that has `llm-guard` installed on its own:

    uv venv /path/to/scratch/.venv
    uv pip install --python /path/to/scratch/.venv/bin/python llm-guard
    /path/to/scratch/.venv/bin/python llm_guard_bridge.py < input.json > output.json

Input on stdin: `{"texts": ["...", "..."]}`
Output on stdout: `[{"text": ..., "is_injection": bool, "risk_score": float}, ...]`

`risk_score` is llm-guard's own `PromptInjection` scanner score (0.0-1.0, higher
= more confident it's an attack); `is_injection` is `not is_valid` from the same
scanner call — llm-guard's own pass/fail line, not a threshold we chose.
"""

from __future__ import annotations

import contextlib
import json
import os
import sys


@contextlib.contextmanager
def _redirect_stdout_to_stderr():
    """llm-guard's `structlog` setup prints its own debug/warning lines straight to
    stdout (not stderr), which corrupts this script's JSON output on the parent's
    read end. Redirect at the file-descriptor level, since structlog's writer holds
    a raw handle opened before any Python-level `sys.stdout` reassignment would
    take effect."""
    saved_fd = os.dup(1)
    os.dup2(2, 1)
    try:
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved_fd, 1)
        os.close(saved_fd)


def main() -> None:
    payload = json.loads(sys.stdin.read())
    texts: list[str] = payload["texts"]

    with _redirect_stdout_to_stderr():
        from llm_guard.input_scanners import PromptInjection

        scanner = PromptInjection()
        results = []
        for text in texts:
            _sanitized, is_valid, risk_score = scanner.scan(text)
            results.append(
                {"text": text, "is_injection": not is_valid, "risk_score": float(risk_score)}
            )

    json.dump(results, sys.stdout)


if __name__ == "__main__":
    main()
