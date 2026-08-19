"""Static discovery — point it at a repository and it highlights what is ungoverned.

The adoption problem this solves is not technical. A platform team asked to "adopt
governance" has to first answer a question nobody has written down: *where does this
codebase actually talk to a model?* In a mature repo that is thirty call sites across
eight services, some behind wrappers, some in notebooks, one in a cron job somebody
left. Until that list exists, every governance conversation is speculative.

So this walks the source and produces the list. Deliberately **static** — no import,
no execution, no network. A discovery tool that imports the target codebase runs
arbitrary code from a repo the operator may not trust, and fails on anything with a
side effect at import time, which is most real applications.

The output is ranked by what an engineer should look at first, not by file order. An
alphabetical list of forty findings is the same as no list.
"""

from __future__ import annotations

import ast
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

#: Directories never worth walking. Skipping them is the difference between a scan
#: that takes a second and one that walks node_modules.
SKIP_DIRS = {
    ".git",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "dist",
    "build",
    ".next",
    "site-packages",
    ".tox",
    ".idea",
    ".vscode",
    "htmlcov",
    ".terraform",
}

#: Call shapes that mean "a model was invoked". Matched on the attribute path rather
#: than the receiver, because the receiver is a variable whose name we cannot know.
_MODEL_CALLS = {
    "chat.completions.create": "openai",
    "completions.create": "openai",
    "messages.create": "anthropic",
    "responses.create": "openai",
    "generate_content": "vertex",
    "converse": "bedrock",
    "invoke_model": "bedrock",
    "ainvoke": "langchain",
    "invoke": "langchain",
    "predict": "langchain",
    "acompletion": "litellm",
    "completion": "litellm",
}

#: Imports that identify the stack, so the report can say what the repo is built on.
_FRAMEWORK_IMPORTS = {
    "langgraph": "LangGraph",
    "langchain": "LangChain",
    "llama_index": "LlamaIndex",
    "crewai": "CrewAI",
    "autogen": "AutoGen",
    "openai": "OpenAI SDK",
    "anthropic": "Anthropic SDK",
    "litellm": "LiteLLM",
    "boto3": "AWS SDK",
    "fastapi": "FastAPI",
    "flask": "Flask",
    "django": "Django",
    "mcp": "MCP",
    "fastmcp": "FastMCP",
    "ragas": "Ragas",
    "langsmith": "LangSmith",
    "langfuse": "Langfuse",
    "opentelemetry": "OpenTelemetry",
    "nometria": "Nometria",
}

#: Tool-ish decorators. A decorated function an agent can call is a tool whether or
#: not anyone registered it, and an unregistered tool is the F-family blind spot.
_TOOL_DECORATORS = ("tool", "function_tool", "mcp.tool", "agent.tool", "register_tool")

#: Executable-artefact shapes worth flagging even without a model call nearby: these
#: are what P9 governs, and a repo that builds SQL from an f-string is where the
#: 1.9M-row incident starts.
_SQL_BUILD = re.compile(
    r"""(?:execute|executemany|cursor\.execute|text)\s*\(\s*f?["']\s*"""
    r"""(?:SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)""",
    re.I,
)
_SHELL_CALL = re.compile(r"\b(?:os\.system|subprocess\.(?:run|call|Popen|check_output))\s*\(")

#: Secrets in source. Narrow on purpose — a loose pattern here produces a wall of
#: false positives and the report gets ignored.
_HARDCODED_SECRET = re.compile(
    r"""(?:api_key|apikey|secret|password|token)\s*=\s*["'](?:sk-|ghp_|xox|AKIA|AIza)[\w-]{12,}""",
    re.I,
)


@dataclass
class Site:
    """One place in the codebase worth governing."""

    kind: str  # model_call | tool | mcp_server | sql_build | shell_call | secret
    file: str
    line: int
    detail: str
    provider: str | None = None
    governed: bool = False
    severity: str = "info"

    def to_json(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "file": self.file,
            "line": self.line,
            "detail": self.detail,
            "provider": self.provider,
            "governed": self.governed,
            "severity": self.severity,
        }


@dataclass
class ScanReport:
    root: str
    files_scanned: int = 0
    frameworks: list[str] = field(default_factory=list)
    sites: list[Site] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    governed_files: list[str] = field(default_factory=list)

    @property
    def model_calls(self) -> list[Site]:
        return [s for s in self.sites if s.kind == "model_call"]

    @property
    def ungoverned(self) -> list[Site]:
        return [s for s in self.model_calls if not s.governed]

    @property
    def coverage(self) -> float:
        calls = self.model_calls
        if not calls:
            return 1.0
        return sum(1 for s in calls if s.governed) / len(calls)

    def by_kind(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for site in self.sites:
            counts[site.kind] = counts.get(site.kind, 0) + 1
        return dict(sorted(counts.items()))

    def ranked(self, limit: int | None = None) -> list[Site]:
        """What to look at first. An alphabetical list of forty findings is no list."""
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        ranked = sorted(
            self.sites,
            key=lambda s: (order.get(s.severity, 9), s.governed, s.file, s.line),
        )
        return ranked[:limit] if limit else ranked

    def to_json(self) -> dict[str, Any]:
        return {
            "root": self.root,
            "files_scanned": self.files_scanned,
            "frameworks": self.frameworks,
            "model_calls": len(self.model_calls),
            "ungoverned_model_calls": len(self.ungoverned),
            "coverage": round(self.coverage, 3),
            "counts": self.by_kind(),
            "sites": [s.to_json() for s in self.sites],
            "errors": self.errors,
        }

    def next_step(self) -> str:
        """One sentence telling the operator what to do next.

        A report that ends without a next action makes the reader do the synthesis,
        and most readers will not.
        """
        if not self.model_calls:
            return (
                "No model calls found. If this repo calls a model through a wrapper we "
                "don't recognise, govern it explicitly with the SDK."
            )
        if self.ungoverned:
            return (
                f"{len(self.ungoverned)} model call(s) are ungoverned. Add "
                "`import nometria; nometria.auto()` to your entry point — nothing else "
                "in the codebase has to change."
            )
        return "Every model call is governed. Run `nometria doctor` to check the runtime config."


def _attribute_path(node: ast.AST) -> str:
    """Render `a.b.c(...)` as "a.b.c" without needing to know what `a` is."""
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def _decorator_name(node: ast.AST) -> str:
    if isinstance(node, ast.Call):
        node = node.func
    return _attribute_path(node) if isinstance(node, ast.Attribute | ast.Name) else ""


class _Visitor(ast.NodeVisitor):
    def __init__(self, path: str) -> None:
        self.path = path
        self.sites: list[Site] = []
        self.frameworks: set[str] = set()
        self.governed = False

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self._note_import(alias.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module:
            self._note_import(node.module)
        self.generic_visit(node)

    def _note_import(self, module: str) -> None:
        root = module.split(".")[0]
        label = _FRAMEWORK_IMPORTS.get(root)
        if label:
            self.frameworks.add(label)
        if root == "nometria":
            self.governed = True

    def visit_Call(self, node: ast.Call) -> None:
        path = _attribute_path(node.func)
        # `nometria.auto()` anywhere in a file means its model calls are governed.
        if path.endswith("auto") and "nometria" in path:
            self.governed = True
        for suffix, provider in _MODEL_CALLS.items():
            if path.endswith(suffix):
                # `invoke` and `completion` are common words; require a model-ish
                # keyword before claiming a model call, or every .invoke() in a repo
                # becomes a finding.
                if suffix in ("invoke", "ainvoke", "predict", "completion") and not any(
                    kw.arg in ("model", "messages", "prompt", "input") for kw in node.keywords
                ):
                    continue
                self.sites.append(
                    Site(
                        kind="model_call",
                        file=self.path,
                        line=node.lineno,
                        detail=f"{path}(...)",
                        provider=provider,
                        severity="high",
                    )
                )
                break
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._check_tool(node)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._check_tool(node)
        self.generic_visit(node)

    def _check_tool(self, node: Any) -> None:
        for decorator in node.decorator_list:
            name = _decorator_name(decorator)
            if any(name.endswith(marker) for marker in _TOOL_DECORATORS):
                self.sites.append(
                    Site(
                        kind="tool",
                        file=self.path,
                        line=node.lineno,
                        detail=f"@{name} {node.name}()",
                        severity="medium",
                    )
                )
                break


def scan_file(path: Path, root: Path) -> tuple[list[Site], set[str], bool]:
    rel = str(path.relative_to(root))
    try:
        source = path.read_text(errors="ignore")
    except OSError as exc:  # pragma: no cover - unreadable file
        raise RuntimeError(f"{rel}: {exc}") from exc

    sites: list[Site] = []
    frameworks: set[str] = set()
    governed = False

    if path.suffix == ".py":
        try:
            tree = ast.parse(source, filename=rel)
        except SyntaxError as exc:
            # A file we cannot parse is reported, never skipped silently: an
            # unparseable file is exactly where an ungoverned call would hide.
            raise RuntimeError(f"{rel}: {exc.msg} (line {exc.lineno})") from exc
        visitor = _Visitor(rel)
        visitor.visit(tree)
        sites.extend(visitor.sites)
        frameworks |= visitor.frameworks
        governed = visitor.governed

    for line_no, line in enumerate(source.splitlines(), start=1):
        if _SQL_BUILD.search(line):
            sites.append(
                Site(
                    kind="sql_build",
                    file=rel,
                    line=line_no,
                    detail="SQL built inline — governed by P9 only if it passes through a tool",
                    severity="medium",
                )
            )
        if _SHELL_CALL.search(line):
            sites.append(
                Site(
                    kind="shell_call",
                    file=rel,
                    line=line_no,
                    detail=line.strip()[:90],
                    severity="medium",
                )
            )
        if _HARDCODED_SECRET.search(line):
            sites.append(
                Site(
                    kind="secret",
                    file=rel,
                    line=line_no,
                    # Never echo the match: a scan report that reprints the key it found
                    # is a second copy of the leak.
                    detail="hard-coded credential in source",
                    severity="critical",
                )
            )
    return sites, frameworks, governed


def scan(root: str | Path = ".", *, include_config: bool = True) -> ScanReport:
    """Walk a repository and report every surface worth governing."""
    root_path = Path(root).resolve()
    report = ScanReport(root=str(root_path))
    frameworks: set[str] = set()

    suffixes = {".py"}
    if include_config:
        suffixes |= {".yaml", ".yml", ".json", ".toml", ".env"}

    for dirpath, dirnames, filenames in os.walk(root_path):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix not in suffixes:
                continue
            report.files_scanned += 1
            try:
                sites, found, governed = scan_file(path, root_path)
            except RuntimeError as exc:
                report.errors.append(str(exc))
                continue
            frameworks |= found
            if governed:
                report.governed_files.append(str(path.relative_to(root_path)))
            for site in sites:
                if site.kind == "model_call" and governed:
                    site.governed = True
                    site.severity = "info"
                report.sites.append(site)

    report.frameworks = sorted(frameworks)
    _detect_mcp(root_path, report)
    return report


#: MCP servers are declared in config, not code, so they need their own pass.
_MCP_CONFIG_NAMES = (
    ".mcp.json",
    "mcp.json",
    "claude_desktop_config.json",
    "mcp_settings.json",
)


def _detect_mcp(root: Path, report: ScanReport) -> None:
    import json

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for filename in filenames:
            if filename not in _MCP_CONFIG_NAMES:
                continue
            path = Path(dirpath) / filename
            try:
                data = json.loads(path.read_text(errors="ignore"))
            except (OSError, ValueError):
                continue
            servers = data.get("mcpServers") or data.get("servers") or {}
            for name in servers:
                report.sites.append(
                    Site(
                        kind="mcp_server",
                        file=str(path.relative_to(root)),
                        line=1,
                        detail=(
                            f"MCP server '{name}' — its tools can change between review "
                            "and use (I-2 rug pull)"
                        ),
                        severity="high",
                    )
                )
