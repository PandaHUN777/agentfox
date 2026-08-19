"""Framework integrations.

Each integration is optional and degrades cleanly when its framework is absent, so
`pip install nometria` stays light and the offline story (X-3) holds.
"""

from .correlation import ExternalRef, link_trace, links_for, resolve_external
from .mcp import McpCallBlocked, McpGovernor, tool_key
from .prometheus import render_metrics

__all__ = [
    "ExternalRef",
    "McpCallBlocked",
    "McpGovernor",
    "link_trace",
    "links_for",
    "render_metrics",
    "resolve_external",
    "tool_key",
]
