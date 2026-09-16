---
description: Check the harness markdown against the live CLI, repo paths and docs map
allowed-tools: Bash(uv run python harness/scripts/check_harness.py*) Bash(python* harness/scripts/check_harness.py*)
---
From the repo root, run `uv run python harness/scripts/check_harness.py`. If it reports
drift, fix each item in the harness file it names, following `harness/STRUCTURE.md`: code
wins, and each fact has one home. Then re-run until it passes. Report what changed.
