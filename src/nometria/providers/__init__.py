"""Model providers (X-2 — neutrality by construction).

Every provider is an adapter. `echo` is the offline default; hosted providers are
gated on `NOMETRIA_ALLOW_EGRESS` so nothing leaves a regulated boundary by accident.
"""

from .base import (
    CompletionRequest,
    CompletionResponse,
    ModelProvider,
    all_providers,
    available_providers,
    get_provider,
    register_provider,
)
from .echo import EchoProvider, clear_scripts, script
from .remote import AnthropicProvider, OpenAIProvider, estimate_cost

__all__ = [
    "AnthropicProvider",
    "CompletionRequest",
    "CompletionResponse",
    "EchoProvider",
    "ModelProvider",
    "OpenAIProvider",
    "all_providers",
    "available_providers",
    "clear_scripts",
    "estimate_cost",
    "get_provider",
    "register_provider",
    "script",
]
