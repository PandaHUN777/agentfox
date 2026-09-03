"""Shared CLI presentation constants.

``SEVERITY_COLOUR`` was hand-rolled at six call sites across the CLI, one of them
(``business_cli.py``) missing the ``high`` -> ``red`` entry entirely and silently
falling through to the ``dim`` default — a real severity underrepresented in the
one place nobody was cross-checking it against the others. This is the one copy.
"""

from __future__ import annotations

SEVERITY_COLOUR = {
    "critical": "red",
    "high": "red",
    "medium": "yellow",
    "low": "cyan",
    "info": "dim",
}
