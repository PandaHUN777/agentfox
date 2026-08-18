"""P9 — action assurance: what the generated artefact will actually do.

Everything else in this system governs the *call*: is this agent allowed to use
`db.query`, and is the argument tainted? That containment is real and it is not
enough, because an agent holding a legitimate `db.query` capability can pass
``DROP TABLE users`` as a perfectly well-formed string argument and every
argument-level check will pass it. An AI coding agent connected to production instead
of staging wiped 1.9M rows this way — "flawlessly, from a technical standpoint".

Three design commitments, all of them from the incident literature rather than from
what is convenient to build:

* **Deterministic parsing, never a model.** An LLM asked "is this SQL dangerous?" is a
  probabilistic control on a deterministic question, and it will be wrong on exactly
  the adversarial input that matters. We parse to an AST with sqlglot (MIT,
  zero-dependency, 31 dialects) and reason over the tree.
* **Fail closed on unparseable.** A statement we cannot parse is a statement we cannot
  govern. Passing it through because analysis failed inverts the control.
* **Comments are the parser's problem, not a regex's.** ``SELECT * FROM users --
  ; DROP TABLE users`` defeats keyword matching and is harmless to an AST; the reverse
  case — a `DROP` hidden past a comment the regex stopped at — is why keyword matching
  cannot be the mechanism.

The target is **zero false negatives on destructive operations**. A false positive
here costs an engineer a policy exception; a false negative costs a table.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger(__name__)

try:  # sqlglot is an optional extra so `pip install nometria` stays offline-light
    import sqlglot
    from sqlglot import exp

    SQLGLOT_AVAILABLE = True
except Exception:  # pragma: no cover - exercised only where sqlglot is absent
    sqlglot = None  # type: ignore[assignment]
    exp = None  # type: ignore[assignment]
    SQLGLOT_AVAILABLE = False


# Operation classes, ordered by how hard the damage is to undo.
READ = "read"
WRITE = "write"
DESTRUCTIVE = "destructive"
ADMIN = "admin"
UNKNOWN = "unknown"

CLASS_RANK = {READ: 0, WRITE: 1, ADMIN: 2, DESTRUCTIVE: 3, UNKNOWN: 4}

#: Statement types that destroy data or schema. TRUNCATE is here rather than under
#: write because it is typically non-transactional and non-recoverable.
_DESTRUCTIVE_NODES = ("Drop", "TruncateTable")
#: ALTER is destructive only when it drops or renames — ADD COLUMN is not, and
#: blocking it would be the kind of false positive that gets the control switched off.
_DESTRUCTIVE_ALTER_ACTIONS = ("Drop", "AlterRename")
_WRITE_NODES = ("Insert", "Update", "Delete", "Merge")
_ADMIN_NODES = ("Grant", "Revoke", "Create", "Set", "Command", "Alter")

#: Environments where an irreversible statement is a production incident rather than
#: a test. Bound to the agent's declared environment (P9-6).
PRODUCTION_ENVIRONMENTS = ("production", "prod")


@dataclass
class ActionRisk:
    """One reason a statement is dangerous, with the evidence for it."""

    code: str
    severity: str
    detail: str
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "detail": self.detail,
            "evidence": self.evidence,
        }


@dataclass
class ActionAnalysis:
    """The full verdict on one generated artefact."""

    dialect: str
    parsed: bool
    operation: str = UNKNOWN
    statements: int = 0
    targets: list[str] = field(default_factory=list)
    risks: list[ActionRisk] = field(default_factory=list)
    blast_radius: str = "unknown"  # none | bounded | unbounded | catastrophic
    reversible: bool = True
    normalised: list[str] = field(default_factory=list)
    parse_error: str | None = None

    @property
    def severity(self) -> str:
        order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        return max((r.severity for r in self.risks), key=lambda s: order.get(s, 0), default="low")

    @property
    def blocked(self) -> bool:
        return any(r.severity == "critical" for r in self.risks)

    def to_json(self) -> dict[str, Any]:
        return {
            "dialect": self.dialect,
            "parsed": self.parsed,
            "operation": self.operation,
            "statements": self.statements,
            "targets": self.targets,
            "blast_radius": self.blast_radius,
            "reversible": self.reversible,
            "severity": self.severity,
            "risks": [r.to_json() for r in self.risks],
            "normalised": self.normalised,
            "parse_error": self.parse_error,
        }


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------


def _alter_is_destructive(node: Any) -> bool:
    actions = node.args.get("actions") or []
    return any(type(a).__name__ in _DESTRUCTIVE_ALTER_ACTIONS for a in actions)


def _is_destructive(node: Any) -> bool:
    name = type(node).__name__
    if name in _DESTRUCTIVE_NODES:
        return True
    return name == "Alter" and _alter_is_destructive(node)


def _node_class(node: Any) -> str:
    name = type(node).__name__
    if _is_destructive(node):
        return DESTRUCTIVE
    if name in _WRITE_NODES:
        return WRITE
    if name in _ADMIN_NODES:
        return ADMIN
    if name in ("Select", "Union", "With", "Describe", "Show"):
        return READ
    return UNKNOWN


def _predicate_always_true(node: Any) -> bool:
    """Is this expression true regardless of the row?

    Takes the expression itself rather than the WHERE wrapper, because unwrapping
    ``.this`` recursively would descend into the left operand of a comparison and
    quietly mis-answer ``id = 5 OR 1 = 1``.
    """
    if node is None or exp is None:
        return False
    if isinstance(node, exp.Paren):
        return _predicate_always_true(node.this)
    if isinstance(node, exp.Boolean):
        return bool(node.this)
    if isinstance(node, exp.EQ):
        left, right = node.this, node.expression
        if isinstance(left, exp.Literal) and isinstance(right, exp.Literal):
            return str(left.this) == str(right.this)
        if isinstance(left, exp.Column) and isinstance(right, exp.Column):
            return left.sql() == right.sql()
        return False
    if isinstance(node, exp.Or):
        # An OR is unbounded if *either* side is — the bounded side is irrelevant.
        return _predicate_always_true(node.this) or _predicate_always_true(node.expression)
    if isinstance(node, exp.And):
        return _predicate_always_true(node.this) and _predicate_always_true(node.expression)
    return False


def _is_tautology(where: Any) -> bool:
    """``WHERE 1=1`` and friends: syntactically bounded, semantically unbounded.

    This is the shape that gets past a "does it have a WHERE clause?" check, which is
    why the check has to look at what the predicate actually says.
    """
    if where is None:
        return False
    return _predicate_always_true(where.this if hasattr(where, "this") else where)


def analyse_sql(statement: str, *, dialect: str = "postgres") -> ActionAnalysis:
    """Parse and classify a SQL artefact. P9-1…P9-5, P9-9."""
    analysis = ActionAnalysis(dialect=dialect, parsed=False)
    if not SQLGLOT_AVAILABLE:
        analysis.risks.append(
            ActionRisk(
                "analysis.unavailable",
                "critical",
                "sqlglot is not installed, so this statement cannot be analysed. "
                "Install nometria[sql] or the action is refused — an unanalysable "
                "statement is not a safe statement.",
            )
        )
        return analysis

    try:
        trees = [t for t in sqlglot.parse(statement, read=dialect) if t is not None]
    except Exception as exc:
        # P9-1: fail closed. Passing through what we could not parse would invert the
        # control — the adversarial input is precisely the one that fails to parse.
        analysis.parse_error = f"{type(exc).__name__}: {exc}"
        analysis.risks.append(
            ActionRisk(
                "sql.unparseable",
                "critical",
                "statement could not be parsed, and an unparseable statement cannot be governed",
                {"error": analysis.parse_error},
            )
        )
        analysis.blast_radius = "unknown"
        return analysis

    analysis.parsed = True
    analysis.statements = len(trees)
    analysis.normalised = [t.sql(dialect=dialect) for t in trees]

    targets: list[str] = []
    operation = READ
    for tree in trees:
        klass = _node_class(tree)
        if CLASS_RANK[klass] > CLASS_RANK[operation]:
            operation = klass
        for table in tree.find_all(exp.Table):
            # comments=False: sqlglot attaches trailing comments to the node, and a
            # target called "users /* ; DROP TABLE users */" is unreadable in a policy
            # or an audit entry.
            name = table.sql(dialect=dialect, comments=False)
            if name not in targets:
                targets.append(name)
    analysis.operation = operation
    analysis.targets = targets

    # P9-3: stacked statements. A single "query" that is really two is the classic
    # injection shape, and no legitimate parameterised call needs it.
    if len(trees) > 1:
        analysis.risks.append(
            ActionRisk(
                "sql.stacked_statements",
                "critical",
                f"{len(trees)} statements in one call: "
                + "; ".join(type(t).__name__ for t in trees),
                {"statements": analysis.normalised},
            )
        )

    for tree in trees:
        name = type(tree).__name__
        if _is_destructive(tree):
            analysis.reversible = False
            analysis.blast_radius = "catastrophic"
            analysis.risks.append(
                ActionRisk(
                    "sql.destructive_ddl",
                    "critical",
                    f"{name} destroys data or schema and cannot be rolled back after commit",
                    {"statement": tree.sql(dialect=dialect)},
                )
            )
            continue

        if name in ("Delete", "Update"):
            where = tree.args.get("where")
            # P9-4: the unbounded mutation. This is the 1.9M-row shape.
            if where is None:
                analysis.reversible = False
                analysis.blast_radius = "unbounded"
                analysis.risks.append(
                    ActionRisk(
                        "sql.unbounded_mutation",
                        "critical",
                        f"{name.upper()} with no WHERE clause affects every row in "
                        f"{', '.join(targets) or 'the target table'}",
                        {"statement": tree.sql(dialect=dialect)},
                    )
                )
            elif _is_tautology(where):
                analysis.reversible = False
                analysis.blast_radius = "unbounded"
                analysis.risks.append(
                    ActionRisk(
                        "sql.tautological_predicate",
                        "critical",
                        f"{name.upper()} predicate is always true, so it is unbounded "
                        "despite having a WHERE clause",
                        {"predicate": where.sql(dialect=dialect)},
                    )
                )
            else:
                if analysis.blast_radius in ("unknown", "none"):
                    analysis.blast_radius = "bounded"

        if name in ("Grant", "Revoke"):
            # P9-9: an agent that can widen its own grants can defeat every other
            # control here, so privilege change is never merely a write.
            analysis.risks.append(
                ActionRisk(
                    "sql.privilege_change",
                    "high",
                    f"{name.upper()} alters access control, which can compose into "
                    "privileges the agent was never granted",
                    {"statement": tree.sql(dialect=dialect)},
                )
            )

    if analysis.blast_radius == "unknown":
        analysis.blast_radius = "none" if operation == READ else "bounded"
    return analysis


# ---------------------------------------------------------------------------
# Non-SQL artefacts
# ---------------------------------------------------------------------------

#: Shell fragments that are destructive regardless of context. Deliberately narrow:
#: shell has no equivalent of sqlglot, so this is a high-confidence deny-list rather
#: than a claim to analyse shell semantics, and it is documented as such.
_SHELL_DESTRUCTIVE = [
    (re.compile(r"\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rf]", re.I), "recursive or forced delete"),
    (re.compile(r"\bmkfs(\.\w+)?\b", re.I), "filesystem format"),
    (re.compile(r"\bdd\s+.*\bof=/dev/", re.I), "raw device write"),
    (re.compile(r">\s*/dev/sd[a-z]", re.I), "raw device write"),
    (re.compile(r"\bdrop\s+database\b", re.I), "database drop"),
    (re.compile(r":\(\)\s*\{.*\};\s*:", re.S), "fork bomb"),
    (re.compile(r"\bchmod\s+(-R\s+)?777\s+/", re.I), "world-writable root"),
    (re.compile(r"\bgit\s+push\s+.*--force", re.I), "force push"),
    (re.compile(r"\bkubectl\s+delete\s+(ns|namespace|all)\b", re.I), "cluster-scope delete"),
    (re.compile(r"\bterraform\s+destroy\b", re.I), "infrastructure destroy"),
]

_UNSAFE_METHODS = {"DELETE", "PUT", "PATCH", "POST"}


def analyse_shell(command: str) -> ActionAnalysis:
    """Deny-list analysis of a shell command.

    Honest about its limits: there is no sqlglot for shell, so this catches known
    catastrophic shapes and makes no claim to understand arbitrary commands. It is a
    backstop, not a sandbox — the primary control for shell remains not granting the
    capability.
    """
    analysis = ActionAnalysis(dialect="shell", parsed=True, operation=UNKNOWN)
    analysis.normalised = [command.strip()]
    for pattern, label in _SHELL_DESTRUCTIVE:
        if pattern.search(command):
            analysis.operation = DESTRUCTIVE
            analysis.reversible = False
            analysis.blast_radius = "catastrophic"
            analysis.risks.append(
                ActionRisk(
                    "shell.destructive",
                    "critical",
                    f"command performs a {label}",
                    {"pattern": pattern.pattern},
                )
            )
    if not analysis.risks:
        analysis.blast_radius = "unknown"
    return analysis


def analyse_http(method: str, url: str, body: Any = None) -> ActionAnalysis:
    """Classify an HTTP action by method and target shape."""
    method = (method or "GET").upper()
    analysis = ActionAnalysis(dialect="http", parsed=True)
    analysis.targets = [url]
    analysis.normalised = [f"{method} {url}"]
    if method in ("GET", "HEAD", "OPTIONS"):
        analysis.operation = READ
        analysis.blast_radius = "none"
        return analysis

    analysis.operation = DESTRUCTIVE if method == "DELETE" else WRITE
    analysis.reversible = method != "DELETE"
    analysis.blast_radius = "bounded"

    # A collection-level unsafe method is the HTTP shape of an unbounded mutation:
    # DELETE /users is not the same class of act as DELETE /users/42.
    path = url.split("?", 1)[0].rstrip("/")
    last = path.rsplit("/", 1)[-1] if "/" in path else path
    collection_like = bool(last) and not re.search(r"[0-9]|[0-9a-f]{8}-[0-9a-f]{4}", last)
    if method in _UNSAFE_METHODS and collection_like and method != "POST":
        analysis.blast_radius = "unbounded"
        analysis.risks.append(
            ActionRisk(
                "http.collection_mutation",
                "critical" if method == "DELETE" else "high",
                f"{method} against a collection endpoint affects every member, not one record",
                {"url": url},
            )
        )
    return analysis


# ---------------------------------------------------------------------------
# Dispatch and policy shaping
# ---------------------------------------------------------------------------

#: Argument names that conventionally carry an executable artefact. Matching is on the
#: name because that is what the tool's own schema declares.
_SQL_KEYS = ("sql", "query", "statement", "command_text")
_SHELL_KEYS = ("command", "cmd", "script", "shell")
_URL_KEYS = ("url", "endpoint", "path")


def analyse_arguments(
    arguments: dict[str, Any], *, dialect: str = "postgres"
) -> list[ActionAnalysis]:
    """Find and analyse every executable artefact in a tool call's arguments."""
    out: list[ActionAnalysis] = []
    for key, value in (arguments or {}).items():
        lowered = str(key).lower()
        if isinstance(value, str) and value.strip():
            if lowered in _SQL_KEYS:
                out.append(analyse_sql(value, dialect=dialect))
            elif lowered in _SHELL_KEYS:
                out.append(analyse_shell(value))
            elif lowered in _URL_KEYS:
                method = str(arguments.get("method") or arguments.get("http_method") or "GET")
                out.append(analyse_http(method, value, arguments.get("body")))
    return out


def environment_risk(analysis: ActionAnalysis, environment: str) -> ActionRisk | None:
    """P9-6 — the same statement is a test in staging and an incident in production.

    The 1.9M-row incident was not an unusual statement. It was an ordinary statement
    pointed at the wrong database, which is why the environment has to be part of the
    verdict rather than an operator's assumption.
    """
    if environment.lower() not in PRODUCTION_ENVIRONMENTS:
        return None
    if analysis.reversible and analysis.blast_radius not in ("unbounded", "catastrophic"):
        return None
    return ActionRisk(
        "action.production_irreversible",
        "critical",
        f"irreversible {analysis.operation} action with {analysis.blast_radius} blast "
        f"radius, bound to environment '{environment}'",
        {"targets": analysis.targets, "blast_radius": analysis.blast_radius},
    )


def summarise(analyses: list[ActionAnalysis], environment: str = "production") -> dict[str, Any]:
    """Collapse per-argument analyses into the shape the policy engine reasons over."""
    if not analyses:
        return {}
    risks: list[dict[str, Any]] = []
    for analysis in analyses:
        risks.extend(r.to_json() for r in analysis.risks)
        env_risk = environment_risk(analysis, environment)
        if env_risk is not None:
            risks.append(env_risk.to_json())
    operation = max((a.operation for a in analyses), key=lambda o: CLASS_RANK[o])
    radius_rank = {"none": 0, "bounded": 1, "unknown": 2, "unbounded": 3, "catastrophic": 4}
    blast = max((a.blast_radius for a in analyses), key=lambda b: radius_rank.get(b, 2))
    return {
        "operation": operation,
        "blast_radius": blast,
        "reversible": all(a.reversible for a in analyses),
        "parsed": all(a.parsed for a in analyses),
        "targets": sorted({t for a in analyses for t in a.targets}),
        "risks": risks,
        "critical": [r for r in risks if r["severity"] == "critical"],
        "analyses": [a.to_json() for a in analyses],
    }
