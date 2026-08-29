"""Standalone bridge to a real `agentdojo` install, run via a subprocess.

`agentdojo` (MIT, ETH Zurich) is a full agent-simulation framework with its own
dependency tree — this script has zero `nometria` imports and is meant to be run
with a *separate* interpreter that has `agentdojo` installed on its own, the same
pattern `../agent_security/llm_guard_bridge.py` uses for `llm-guard`:

    uv venv /path/to/scratch/.venv
    uv pip install --python /path/to/scratch/.venv/bin/python agentdojo
    /path/to/scratch/.venv/bin/python agentdojo_bridge.py > output.json

No stdin — this only reads static task definitions, no live LLM call is made.

For every registered task (both `injection_tasks`, where a successful prompt
injection would make the agent issue this exact call, and `user_tasks`, the
legitimate calls a correctly-behaving agent issues for its actual assignment)
across all four `v1` suites (banking, travel, slack, workspace), extracts the
`ground_truth()` `FunctionCall`s directly from the task class — no agent runs, no
model is called, this is purely the framework's own labeled data.

Output on stdout: `{"injection": [...], "user": [...]}`, each a list of
`{"suite": ..., "task_id": ..., "function": ..., "args": {...}}`.
"""

from __future__ import annotations

import json


def main() -> None:
    from agentdojo.task_suite.load_suites import get_suites

    suites = get_suites("v1")
    out: dict[str, list[dict]] = {"injection": [], "user": []}

    for suite_name, suite in suites.items():
        environment = suite.load_and_inject_default_environment({})

        for kind, registry in (
            ("injection", suite._injection_tasks),
            ("user", suite._user_tasks),
        ):
            for task_id, versions in registry.items():
                for _version, task in versions.items():
                    calls = task.ground_truth(environment)
                    for call in calls:
                        out[kind].append(
                            {
                                "suite": suite_name,
                                "task_id": task_id,
                                "function": call.function,
                                "args": call.args,
                            }
                        )

    print(json.dumps(out, default=str))


if __name__ == "__main__":
    main()
