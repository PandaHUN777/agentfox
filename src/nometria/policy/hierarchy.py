"""Hierarchical policy composition (P12).

**Evidence.** Two of eleven senior engineers surveyed hand-built this. Derrick
(Murphy USA, ex-Apple/Cigna/Ally) quantified it: *"hierarchical policy framework
(company → team → user) with inheritance/override rules, context isolation, and tool
permissions... reducing policy misconfigurations by **87%**."*

That number is the whole argument. Flat policy does not merely scale badly — it
*causes incidents*, because with forty agents across eight teams nobody can hold the
interaction of a dozen overlapping documents in their head.

Four levels, narrowest wins on ties:

    org  →  team  →  agent  →  user

Three composition modes, and the asymmetry between them is the safety property:

``extend``    add rules; the parent's still apply. The default.
``restrict``  tighten. **Always permitted** — a child may make itself safer without
              asking, because nobody needs authorisation to be more careful.
``override``  loosen. Permitted **only** where the parent marked the rule
              ``overridable: true``. Loosening is a grant, not a right.

The other half of the fix is not the algorithm but the *explanation*:
:func:`resolve_effective` reports, for every rule in force, which level it came from
and what it overrode. Opacity is what makes flat policy dangerous, so a resolver that
produced a correct answer nobody could read would have missed the point.
"""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field
from typing import Any

from .model import EFFECT_RANK, PolicyDocument, Rule

#: Broadest to narrowest. Order is load-bearing: later levels win ties.
LEVELS = ("org", "team", "agent", "user")

MODES = ("extend", "restrict", "override")


def level_rank(level: str) -> int:
    try:
        return LEVELS.index(level)
    except ValueError:
        return -1


@dataclass
class PolicyLayer:
    """One policy document bound at one level of the hierarchy."""

    document: PolicyDocument
    level: str = "org"
    #: Which org / team / agent / user this layer applies to. ``*`` means all.
    scope_id: str = "*"
    mode: str = "extend"

    def applies_to(self, subject: dict[str, str]) -> bool:
        if self.level not in LEVELS:
            return False
        if self.scope_id == "*":
            return True
        return fnmatch.fnmatch(str(subject.get(self.level, "")), self.scope_id)


@dataclass
class ResolvedRule:
    """A rule in force, with the provenance that makes it explicable."""

    rule: Rule
    level: str
    scope_id: str
    mode: str
    overrides: list[str] = field(default_factory=list)
    #: Set when this rule replaced a weaker one from a broader level.
    loosened: bool = False

    def to_json(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule.id,
            "effect": self.rule.effect,
            "level": self.level,
            "scope": self.scope_id,
            "mode": self.mode,
            "overrides": self.overrides,
            "loosened": self.loosened,
            "source": f"{self.level}:{self.scope_id}",
        }


@dataclass
class EffectivePolicy:
    """The composed policy, plus why each rule is in it."""

    rules: list[ResolvedRule] = field(default_factory=list)
    mode: str = "observe"
    default_effect: str = "allow"
    layers: list[str] = field(default_factory=list)
    rejected: list[dict[str, Any]] = field(default_factory=list)

    def document(self, key: str = "effective") -> PolicyDocument:
        """Collapse to a single document the existing engine can evaluate."""
        return PolicyDocument(
            key=key,
            name="Effective policy",
            mode=self.mode,
            default_effect=self.default_effect,  # type: ignore[arg-type]
            rules=[resolved.rule for resolved in self.rules],
        )

    def explain(self) -> dict[str, Any]:
        return {
            "layers": self.layers,
            "mode": self.mode,
            "default_effect": self.default_effect,
            "rules": [r.to_json() for r in self.rules],
            "rejected": self.rejected,
        }


def resolve_effective(
    layers: list[PolicyLayer], subject: dict[str, str] | None = None
) -> EffectivePolicy:
    """Compose layers into the policy actually in force for ``subject``.

    ``subject`` is a mapping like ``{"org": "acme", "team": "finance",
    "agent": "payments-ops", "user": "priya@acme.com"}``. Layers that do not apply
    are skipped rather than merged, which is what gives context isolation (P12-5):
    a team never sees another team's rules because they were never in scope.
    """
    subject = subject or {}
    applicable = [layer for layer in layers if layer.applies_to(subject)]
    applicable.sort(key=lambda layer: level_rank(layer.level))

    effective = EffectivePolicy(
        layers=[f"{layer.level}:{layer.scope_id}({layer.mode})" for layer in applicable]
    )
    by_id: dict[str, ResolvedRule] = {}
    overridable: dict[str, bool] = {}

    for layer in applicable:
        document = layer.document
        # Enforcement mode escalates and never relaxes down the hierarchy: a team
        # cannot quietly put itself back into observe once the org is enforcing.
        if document.mode == "enforce":
            effective.mode = "enforce"
        if EFFECT_RANK.get(document.default_effect, 0) > EFFECT_RANK.get(
            effective.default_effect, 0
        ):
            effective.default_effect = document.default_effect

        for rule in document.rules:
            existing = by_id.get(rule.id)
            marked = bool(getattr(rule, "overridable", False))

            if existing is None:
                by_id[rule.id] = ResolvedRule(
                    rule=rule, level=layer.level, scope_id=layer.scope_id, mode=layer.mode
                )
                overridable[rule.id] = marked
                continue

            tightening = EFFECT_RANK[rule.effect] >= EFFECT_RANK[existing.rule.effect]

            # `restrict` may only tighten. A layer that declares restraint and then
            # loosens is a misconfiguration, not a permission — so it is rejected
            # loudly rather than silently applied.
            if layer.mode == "restrict" and not tightening:
                effective.rejected.append(
                    {
                        "rule_id": rule.id,
                        "level": layer.level,
                        "scope": layer.scope_id,
                        "reason": (
                            f"mode 'restrict' cannot weaken '{existing.rule.effect}' "
                            f"(from {existing.level}) to '{rule.effect}'"
                        ),
                    }
                )
                continue

            if not tightening and not overridable.get(rule.id, False):
                effective.rejected.append(
                    {
                        "rule_id": rule.id,
                        "level": layer.level,
                        "scope": layer.scope_id,
                        "reason": (
                            f"cannot loosen '{existing.rule.effect}' (from "
                            f"{existing.level}) to '{rule.effect}' — the upstream rule "
                            "is not marked overridable"
                        ),
                    }
                )
                continue

            by_id[rule.id] = ResolvedRule(
                rule=rule,
                level=layer.level,
                scope_id=layer.scope_id,
                mode=layer.mode,
                overrides=[*existing.overrides, f"{existing.level}:{existing.scope_id}"],
                loosened=not tightening,
            )
            overridable[rule.id] = marked

    effective.rules = sorted(by_id.values(), key=lambda r: (level_rank(r.level), r.rule.id))
    return effective


# ---------------------------------------------------------------------------
# Lint (P12-4)
# ---------------------------------------------------------------------------


@dataclass
class LintFinding:
    code: str
    severity: str
    rule_id: str
    message: str
    level: str = ""

    def to_json(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "rule_id": self.rule_id,
            "level": self.level,
            "message": self.message,
        }


def lint_policy(layers: list[PolicyLayer]) -> list[LintFinding]:
    """Catch the misconfigurations that hierarchy makes possible.

    This is the half of P12 that produces the 87%. Composition without a linter just
    moves the confusion somewhere harder to see.
    """
    findings: list[LintFinding] = []
    ordered = sorted(layers, key=lambda layer: level_rank(layer.level))

    seen: dict[str, tuple[str, str, Rule]] = {}
    overridable: dict[str, bool] = {}

    for layer in ordered:
        ids_in_layer: set[str] = set()
        for rule in layer.document.rules:
            # Duplicate ids inside one document: the second silently wins.
            if rule.id in ids_in_layer:
                findings.append(
                    LintFinding(
                        "duplicate-id",
                        "high",
                        rule.id,
                        layer.level,
                        message=f"'{rule.id}' is defined twice in the same layer; "
                        "the later definition silently wins",
                    )
                )
            ids_in_layer.add(rule.id)

            if not rule.enabled:
                findings.append(
                    LintFinding(
                        "disabled",
                        "low",
                        rule.id,
                        "rule is disabled and enforces nothing",
                        layer.level,
                    )
                )

            # Over-broad tool globs on blocking rules.
            tool = rule.when.tool
            if tool in ("*", "**") and rule.effect in ("block", "escalate"):
                findings.append(
                    LintFinding(
                        "over-broad-glob",
                        "medium",
                        rule.id,
                        f"'{rule.effect}' applies to every tool ('{tool}') — "
                        "likely to produce false blocks",
                        layer.level,
                    )
                )

            # A rule with no conditions at all matches everything.
            if rule.effect in ("block", "escalate") and not rule.when.model_dump(exclude_none=True):
                findings.append(
                    LintFinding(
                        "unconditional",
                        "high",
                        rule.id,
                        f"'{rule.effect}' has no conditions and will fire on every request",
                        layer.level,
                    )
                )

            previous = seen.get(rule.id)
            if previous is not None:
                prev_level, prev_scope, prev_rule = previous
                if EFFECT_RANK[rule.effect] < EFFECT_RANK[prev_rule.effect]:
                    if not overridable.get(rule.id, False):
                        findings.append(
                            LintFinding(
                                "illegal-loosening",
                                "critical",
                                rule.id,
                                f"weakens '{prev_rule.effect}' from {prev_level}:"
                                f"{prev_scope} to '{rule.effect}' without an "
                                "'overridable: true' grant upstream — this rule will "
                                "be rejected at resolution",
                                layer.level,
                            )
                        )
                elif rule.effect == prev_rule.effect and rule.when == prev_rule.when:
                    findings.append(
                        LintFinding(
                            "shadowed",
                            "low",
                            rule.id,
                            f"identical to {prev_level}:{prev_scope}; the inherited "
                            "rule already covers it",
                            layer.level,
                        )
                    )
            seen[rule.id] = (layer.level, layer.scope_id, rule)
            overridable[rule.id] = bool(getattr(rule, "overridable", False))

    return findings


def lint_summary(findings: list[LintFinding]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding.severity] = counts.get(finding.severity, 0) + 1
    blocking = [f for f in findings if f.severity in ("critical", "high")]
    return {
        "findings": [f.to_json() for f in findings],
        "counts": counts,
        "total": len(findings),
        # CI should fail on critical/high. Low and medium are advice.
        "passed": not blocking,
        "blocking": [f.to_json() for f in blocking],
    }
