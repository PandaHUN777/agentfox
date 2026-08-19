"""F7 — numeric, temporal and entity integrity.

The failures here are the ones that survive every other control. The answer is
grounded, the source is authoritative, the action is safe, nobody needed to escalate
— and the number is for the wrong quarter, or in the wrong currency, or belongs to a
different customer with a similar name. The reconciliation incident is the canonical
shape: a record "matched" that was never in the data.

These are high-frequency in finance and operations and they are almost entirely
undetected in practice, because the usual quality metrics are about *language*.
Groundedness asks whether the claim is supported by the text; it does not ask whether
5 + 3 = 9, or whether "Q1" in the question means the same three months as "Q1" in the
source.

Every check here is deterministic arithmetic or string comparison. That is not a
limitation to apologise for: these are exactly the questions where a probabilistic
judge is the wrong instrument, and a false negative on a currency mismatch costs more
than the check.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# --- Numbers ---------------------------------------------------------------

_NUMBER = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")
_SCALE = {
    "k": 1_000,
    "thousand": 1_000,
    "thousands": 1_000,
    "m": 1_000_000,
    "mn": 1_000_000,
    "million": 1_000_000,
    "millions": 1_000_000,
    "bn": 1_000_000_000,
    "b": 1_000_000_000,
    "billion": 1_000_000_000,
}
_CURRENCY_SYMBOLS = {"£": "GBP", "$": "USD", "€": "EUR", "¥": "JPY"}
_CURRENCY_CODES = re.compile(r"\b(USD|EUR|GBP|JPY|CHF|CAD|AUD|INR|CNY)\b")

_ARITHMETIC = re.compile(
    r"([-+]?\d[\d,]*(?:\.\d+)?)\s*([+\-*/x×])\s*([-+]?\d[\d,]*(?:\.\d+)?)\s*(?:=|is|equals)\s*"
    r"([-+]?\d[\d,]*(?:\.\d+)?)",
    re.I,
)
_TOTAL_CLAIM = re.compile(
    r"(?:total|sum|altogether|combined)[^.\n]*?(?:is|of|=|:)\s*([£$€]?\s?[-+]?\d[\d,]*(?:\.\d+)?)",
    re.I,
)

# --- Periods ---------------------------------------------------------------

_QUARTER = re.compile(r"\bQ([1-4])\s*(?:of\s*)?(?:FY)?\s*(\d{2,4})?\b", re.I)
_FISCAL = re.compile(r"\b(?:FY|fiscal(?:\s+year)?)\s*(\d{2,4})\b", re.I)
_CALENDAR = re.compile(r"\b(?:calendar(?:\s+year)?|CY)\s*(\d{4})\b", re.I)
_YEAR = re.compile(r"\b(20\d{2}|19\d{2})\b")

# --- Timezones -------------------------------------------------------------

_TZ_NAMED = re.compile(r"\b(UTC|GMT|EST|EDT|PST|PDT|CET|CEST|IST|JST|BST)\b")
_TIME = re.compile(r"\b\d{1,2}:\d{2}\s*(?:am|pm)?\b", re.I)
_DEADLINE = re.compile(r"\b(?:by|before|due|deadline|expires?|closes?)\b", re.I)


def _to_float(raw: str) -> float:
    return float(str(raw).replace(",", "").replace(" ", ""))


def numbers_in(text: str) -> set[str]:
    return {m.group(0).replace(",", "") for m in _NUMBER.finditer(text or "")}


# ---------------------------------------------------------------------------
# F7.1 — hallucinated record match
# ---------------------------------------------------------------------------


def detect_unmatched_records(
    answer: str, records: list[dict[str, Any]] | None, *, id_fields: tuple[str, ...] = ("id",)
) -> list[dict[str, Any]]:
    """F7.1 — the reconciliation incident: a record "matched" that was never there.

    Only identifier-shaped tokens are checked. Comparing every number in the answer
    against the record set would flag quantities and dates, which is noise; an
    identifier that resolves to nothing is signal.
    """
    if records is None:
        return []
    known = {
        str(record.get(field, "")).lower()
        for record in records
        for field in id_fields
        if record.get(field) is not None
    }
    known |= {str(v).lower() for r in records for v in r.values() if isinstance(v, str)}

    candidates = re.findall(r"\b(?:[A-Z]{2,}[-_]?\d{3,}|#\d{4,}|\d{6,})\b", answer or "")
    out: list[dict[str, Any]] = []
    for candidate in dict.fromkeys(candidates):
        if candidate.lower().lstrip("#") in {k.lstrip("#") for k in known}:
            continue
        out.append(
            {
                "identifier": candidate,
                "reason": (
                    f"the answer references record '{candidate}', which is not in the "
                    f"{len(records)} record(s) that were actually retrieved"
                ),
            }
        )
    return out


# ---------------------------------------------------------------------------
# F7.2 — arithmetic
# ---------------------------------------------------------------------------


def check_arithmetic(answer: str, *, components: list[float] | None = None) -> list[dict]:
    """F7.2 — the sum does not match the rows cited.

    Two forms: an explicit statement of arithmetic, and a total claimed over a
    component list the caller supplies. Tolerance is relative, so rounding in a
    currency figure is not reported as an error.
    """
    out: list[dict[str, Any]] = []
    for left, op, right, claimed in _ARITHMETIC.findall(answer or ""):
        a, b, stated = _to_float(left), _to_float(right), _to_float(claimed)
        actual = {
            "+": a + b,
            "-": a - b,
            "*": a * b,
            "x": a * b,
            "×": a * b,
            "/": a / b if b else None,
        }.get(op)
        if actual is None:
            continue
        if abs(actual - stated) > max(0.01, abs(actual) * 0.001):
            out.append(
                {
                    "kind": "arithmetic_error",
                    "expression": f"{left} {op} {right}",
                    "stated": stated,
                    "actual": round(actual, 4),
                    "reason": f"{left} {op} {right} is {actual:g}, not {stated:g}",
                }
            )

    if components:
        expected = sum(components)
        for claimed in _TOTAL_CLAIM.findall(answer or ""):
            stated = _to_float(re.sub(r"[£$€\s]", "", claimed))
            if abs(expected - stated) > max(0.01, abs(expected) * 0.001):
                out.append(
                    {
                        "kind": "aggregation_error",
                        "stated": stated,
                        "actual": round(expected, 4),
                        "components": len(components),
                        "reason": (
                            f"the stated total {stated:g} does not match the sum of "
                            f"{len(components)} cited values ({expected:g})"
                        ),
                    }
                )
    return out


# ---------------------------------------------------------------------------
# F7.3 — period
# ---------------------------------------------------------------------------


def _periods(text: str) -> dict[str, Any]:
    quarters = {(q, y) for q, y in _QUARTER.findall(text or "")}
    return {
        "quarters": quarters,
        "fiscal": set(_FISCAL.findall(text or "")),
        "calendar": set(_CALENDAR.findall(text or "")),
        "years": set(_YEAR.findall(text or "")),
    }


def detect_period_mismatch(question: str, answer: str, context: str = "") -> list[dict]:
    """F7.3 — fiscal versus calendar, or an answer about a period nobody asked about.

    The fiscal/calendar case is the expensive one: both parties say "2024" and mean
    date ranges that overlap by nine months, so the answer looks right to everyone in
    the room and reconciles against nothing.
    """
    asked, given = _periods(question), _periods(answer)
    out: list[dict[str, Any]] = []

    if asked["fiscal"] and given["calendar"]:
        out.append(
            {
                "kind": "fiscal_calendar_mismatch",
                "asked": sorted(asked["fiscal"]),
                "answered": sorted(given["calendar"]),
                "reason": "the question is about a fiscal year and the answer is calendar-year",
            }
        )
    if asked["calendar"] and given["fiscal"]:
        out.append(
            {
                "kind": "fiscal_calendar_mismatch",
                "asked": sorted(asked["calendar"]),
                "answered": sorted(given["fiscal"]),
                "reason": "the question is about a calendar year and the answer is fiscal-year",
            }
        )

    asked_q = {q for q, _y in asked["quarters"]}
    given_q = {q for q, _y in given["quarters"]}
    if asked_q and given_q and not (asked_q & given_q):
        out.append(
            {
                "kind": "quarter_mismatch",
                "asked": sorted(asked_q),
                "answered": sorted(given_q),
                "reason": f"asked about Q{'/Q'.join(sorted(asked_q))}, "
                f"answered about Q{'/Q'.join(sorted(given_q))}",
            }
        )

    asked_years = asked["years"] - asked["calendar"] - asked["fiscal"]
    given_years = given["years"] - given["calendar"] - given["fiscal"]
    if asked_years and given_years and not (asked_years & given_years):
        out.append(
            {
                "kind": "year_mismatch",
                "asked": sorted(asked_years),
                "answered": sorted(given_years),
                "reason": (
                    f"asked about {sorted(asked_years)}, answered about {sorted(given_years)}"
                ),
            }
        )
    if context:
        ctx = _periods(context)
        stray = given["years"] - ctx["years"] if ctx["years"] else set()
        if stray:
            out.append(
                {
                    "kind": "period_not_in_context",
                    "answered": sorted(stray),
                    "reason": f"the answer cites {sorted(stray)}, which is not in the retrieved "
                    "context",
                }
            )
    return out


# ---------------------------------------------------------------------------
# F7.4 — unit and currency
# ---------------------------------------------------------------------------


def _currencies(text: str) -> set[str]:
    found = {_CURRENCY_SYMBOLS[s] for s in _CURRENCY_SYMBOLS if s in (text or "")}
    return found | set(_CURRENCY_CODES.findall(text or ""))


def _scales(text: str) -> set[str]:
    out = set()
    pattern = r"\d[\d,.]*\s*(k|m|mn|bn|b|thousand|thousands|million|millions|billion)\b"
    for match in re.finditer(pattern, text or "", re.I):
        out.add(match.group(1).lower())
    return out


def detect_unit_mismatch(answer: str, context: str = "") -> list[dict[str, Any]]:
    """F7.4 — USD stated for a EUR figure, or thousands read as millions.

    Reported when the answer asserts a currency or scale the context does not, which
    means a conversion happened somewhere with nothing recording that it did.
    """
    out: list[dict[str, Any]] = []
    answer_ccy, context_ccy = _currencies(answer), _currencies(context)
    if len(answer_ccy) > 1:
        out.append(
            {
                "kind": "mixed_currency",
                "currencies": sorted(answer_ccy),
                "reason": f"the answer mixes {sorted(answer_ccy)} without stating a conversion",
            }
        )
    if context_ccy and answer_ccy and not (answer_ccy & context_ccy):
        out.append(
            {
                "kind": "currency_mismatch",
                "answer": sorted(answer_ccy),
                "context": sorted(context_ccy),
                "reason": (
                    f"the answer is in {sorted(answer_ccy)} and the source is in "
                    f"{sorted(context_ccy)}, with no conversion recorded"
                ),
            }
        )
    answer_scale, context_scale = _scales(answer), _scales(context)
    if context_scale and answer_scale:
        answer_factors = {_SCALE[s] for s in answer_scale}
        context_factors = {_SCALE[s] for s in context_scale}
        if not answer_factors & context_factors:
            out.append(
                {
                    "kind": "scale_mismatch",
                    "answer": sorted(answer_scale),
                    "context": sorted(context_scale),
                    "reason": (
                        f"the answer states {sorted(answer_scale)} and the source states "
                        f"{sorted(context_scale)}"
                    ),
                }
            )
    return out


# ---------------------------------------------------------------------------
# F7.5 — entity confusion
# ---------------------------------------------------------------------------


def detect_entity_confusion(
    question: str, answer: str, entities: list[str] | None = None
) -> list[dict[str, Any]]:
    """F7.5 — the right answer about the wrong customer.

    Fires when the question names one known entity and the answer names a different
    one. Bounded to the declared entity list on purpose: inferring entities from prose
    would flag every product name and place.
    """
    if not entities:
        return []
    lowered_q, lowered_a = (question or "").lower(), (answer or "").lower()
    asked = [e for e in entities if e and e.lower() in lowered_q]
    answered = [e for e in entities if e and e.lower() in lowered_a]
    if not asked or not answered:
        return []
    wrong = [e for e in answered if e not in asked]
    if not wrong:
        return []
    return [
        {
            "kind": "entity_confusion",
            "asked_about": asked,
            "answered_about": wrong,
            "reason": (
                f"the question is about {asked} and the answer is about {wrong} — right "
                "answer, wrong entity"
            ),
        }
    ]


# ---------------------------------------------------------------------------
# F7.6 — timezone
# ---------------------------------------------------------------------------


def detect_timezone_ambiguity(answer: str) -> list[dict[str, Any]]:
    """F7.6 — a deadline stated as a bare time, which is off by one day somewhere.

    Only fires on deadline language. Flagging every clock time would be noise, and a
    deadline is where the off-by-one actually costs something.
    """
    if not _DEADLINE.search(answer or ""):
        return []
    if not _TIME.search(answer or ""):
        return []
    if _TZ_NAMED.search(answer or ""):
        return []
    return [
        {
            "kind": "timezone_ambiguity",
            "reason": "a deadline is stated as a clock time with no timezone, which is "
            "off by a day for someone",
        }
    ]


# ---------------------------------------------------------------------------
# Assessment
# ---------------------------------------------------------------------------


@dataclass
class IntegrityAssessment:
    issues: list[dict[str, Any]] = field(default_factory=list)

    @property
    def clean(self) -> bool:
        return not self.issues

    @property
    def kinds(self) -> list[str]:
        return sorted({i["kind"] for i in self.issues if "kind" in i})

    def to_json(self) -> dict[str, Any]:
        return {"clean": self.clean, "kinds": self.kinds, "issues": self.issues}


def assess_integrity(
    *,
    question: str = "",
    answer: str = "",
    context: str = "",
    records: list[dict[str, Any]] | None = None,
    entities: list[str] | None = None,
    components: list[float] | None = None,
) -> IntegrityAssessment:
    """All six deterministic checks in one pass. F7.7 is the self-consistency scorer."""
    issues: list[dict[str, Any]] = []
    issues.extend(
        {"kind": "hallucinated_record", **r} for r in detect_unmatched_records(answer, records)
    )
    issues.extend(check_arithmetic(answer, components=components))
    issues.extend(detect_period_mismatch(question, answer, context))
    issues.extend(detect_unit_mismatch(answer, context))
    issues.extend(detect_entity_confusion(question, answer, entities))
    issues.extend(detect_timezone_ambiguity(answer))
    return IntegrityAssessment(issues=issues)
