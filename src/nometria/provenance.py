"""P8 — source authority and provenance (F2).

*"How do we know it didn't use an unverified source?"*

The gap this closes is specific and easy to miss: our groundedness scorer — and every
model-based equivalent, Vectara HHEM included — checks the **answer against the
retrieved context**. It never asks whether that context was authoritative. An agent
that faithfully grounds a pricing answer in someone's personal OneNote scores 1.0.
Perfect groundedness against the wrong source is still a wrong answer, and it is
*more* dangerous than an ungrounded one because every quality metric says it is fine.

So provenance is a property of the retrieval, not of the generation, and it has to be
declared the same way the knowledge boundary is: which sources are systems of record,
which are merely approved, which are unverified, who owns them, how fresh they must
be, and which corpus they belong to.

Four tiers, ordered. The ordering is the policy surface: *"financial figures may only
be sourced from tier-1 systems of record less than 24h old; anything else must be
caveated or blocked."*
"""

from __future__ import annotations

import datetime as dt
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import SourceRecord, utcnow

log = logging.getLogger(__name__)

SYSTEM_OF_RECORD = "system_of_record"
APPROVED = "approved"
UNVERIFIED = "unverified"
EXTERNAL = "external"
TIERS = (SYSTEM_OF_RECORD, APPROVED, UNVERIFIED, EXTERNAL)

#: Higher is less trustworthy, so `max` over a set of chunks gives the weakest link —
#: which is the right reading: an answer is only as authoritative as its worst source.
TIER_RANK = {SYSTEM_OF_RECORD: 0, APPROVED: 1, UNVERIFIED: 2, EXTERNAL: 3}


def register_source(
    session: Session,
    key: str,
    *,
    title: str = "",
    tier: str = UNVERIFIED,
    owner: str | None = None,
    domain: str | None = None,
    updated_at_source: dt.datetime | None = None,
    freshness_sla_hours: int | None = None,
    deprecated: bool = False,
    metadata: dict[str, Any] | None = None,
) -> SourceRecord:
    if tier not in TIERS:
        raise ValueError(f"tier must be one of {TIERS}")
    record = session.scalar(select(SourceRecord).where(SourceRecord.key == key))
    if record is None:
        record = SourceRecord(key=key)
        session.add(record)
    record.title = title or record.title
    record.tier = tier
    record.owner = owner
    record.domain = domain
    record.updated_at_source = updated_at_source
    record.freshness_sla_hours = freshness_sla_hours
    record.deprecated = deprecated
    record.metadata_json = metadata or {}
    session.flush()
    return record


def source_tier(session: Session, key: str) -> str:
    """F2.1 — the tier of a source, defaulting to `unverified`.

    An unregistered source is unverified, never approved. Defaulting the other way
    would make the control vacuous the moment a retriever emits something new.
    """
    record = session.scalar(select(SourceRecord).where(SourceRecord.key == key))
    return record.tier if record else UNVERIFIED


def freshness_breach(record: SourceRecord | None, now: dt.datetime | None = None) -> dict | None:
    """F2.2 — the policy changed last week and the index is a month old."""
    if record is None or record.freshness_sla_hours is None:
        return None
    if record.updated_at_source is None:
        return {
            "source": record.key,
            "reason": "source has a freshness SLA but no recorded update time",
        }
    now = now or utcnow()
    updated = record.updated_at_source
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=dt.UTC)
    age_hours = (now - updated).total_seconds() / 3600
    if age_hours <= record.freshness_sla_hours:
        return None
    return {
        "source": record.key,
        "age_hours": round(age_hours, 1),
        "sla_hours": record.freshness_sla_hours,
        "reason": (
            f"'{record.key}' is {age_hours:.0f}h old against a {record.freshness_sla_hours}h SLA"
        ),
    }


def domain_breach(record: SourceRecord | None, agent_domain: str | None) -> dict | None:
    """F2.6 — the support agent answering from the finance corpus."""
    if record is None or not agent_domain or not record.domain:
        return None
    if record.domain == agent_domain:
        return None
    return {
        "source": record.key,
        "source_domain": record.domain,
        "agent_domain": agent_domain,
        "reason": (
            f"'{record.key}' belongs to the '{record.domain}' corpus, and this agent is "
            f"declared for '{agent_domain}'"
        ),
    }


# ---------------------------------------------------------------------------
# Citations
# ---------------------------------------------------------------------------

#: Citation shapes agents actually emit. Kept narrow: a loose pattern turns ordinary
#: brackets into citations and manufactures fabrication findings.
_CITATION_RE = re.compile(r"\[(?:source[:\s]*)?([A-Za-z0-9][\w./:-]{2,120})\]")

#: A claim carrying a figure, a date or a proper noun is material. Everything else is
#: connective prose, and demanding a citation for it is how a control gets disabled.
_MATERIAL = re.compile(r"\d|\b[A-Z][a-z]{2,}\b")


def extract_citations(answer: str) -> list[str]:
    return [m.group(1) for m in _CITATION_RE.finditer(answer or "")]


def detect_fabricated_citations(
    answer: str, chunks: list[dict[str, Any]] | None
) -> list[dict[str, Any]]:
    """F2.3 — a citation to a document that was never retrieved, or that lacks the claim.

    Two distinct failures. Citing a document that does not exist in the retrieval set
    is the blatant one. Citing a real document that does not contain the claim is the
    common one, and it is what makes a fabricated citation survive review — the
    reference resolves, so a human spot-checking the link sees a real page.
    """
    citations = extract_citations(answer)
    if not citations:
        return []
    available = {str(c.get("source") or c.get("id") or "") for c in (chunks or [])}
    by_key = {
        str(c.get("source") or c.get("id") or ""): str(c.get("text") or "") for c in (chunks or [])
    }

    out: list[dict[str, Any]] = []
    for citation in citations:
        if citation not in available:
            out.append(
                {
                    "citation": citation,
                    "kind": "unknown_source",
                    "reason": f"'{citation}' was not among the retrieved sources",
                }
            )
            continue
        # Does the cited chunk carry the figures asserted next to the citation?
        # Strip the citation markers first: a versioned source id like `policy-v3`
        # otherwise contributes its own digits to the sentence and every such citation
        # reports a fabricated figure.
        sentence = _CITATION_RE.sub(" ", _sentence_containing(answer, citation))
        numbers = set(re.findall(r"\d[\d,.]*", sentence))
        supported = set(re.findall(r"\d[\d,.]*", by_key.get(citation, "")))
        missing = sorted(n for n in numbers if n not in supported)
        if missing:
            out.append(
                {
                    "citation": citation,
                    "kind": "unsupported_claim",
                    "missing_figures": missing,
                    "reason": (
                        f"'{citation}' is cited for figures {missing} that do not appear in it"
                    ),
                }
            )
    return out


def _sentence_containing(text: str, needle: str) -> str:
    for sentence in re.split(r"(?<=[.!?])\s+", text or ""):
        if needle in sentence:
            return sentence
    return ""


def uncited_claims(answer: str, chunks: list[dict[str, Any]] | None) -> list[str]:
    """F2.5 — a material claim with no source at all.

    Only reported when retrieval actually happened. Demanding citations from an agent
    that was given nothing to cite is a bug report about the retriever, not about the
    answer.
    """
    if not chunks:
        return []
    out: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", answer or ""):
        clean = sentence.strip()
        if not clean or not _MATERIAL.search(clean):
            continue
        if not _CITATION_RE.search(clean):
            out.append(clean[:160])
    return out


def detect_source_conflict(chunks: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """F2.4 — two documents disagree and the agent picks one without saying so.

    Compares figures attached to the same label across chunks. Deliberately narrow:
    detecting semantic contradiction reliably needs a model, and a lexical version of
    that would fire on paraphrase. Numbers under a shared label are the case that is
    both detectable and consequential.
    """
    if not chunks or len(chunks) < 2:
        return []
    facts: dict[str, list[tuple[str, str]]] = {}
    pattern = re.compile(r"([A-Za-z][A-Za-z ]{2,40}?)\s*(?:is|was|:|=)\s*([£$€]?\d[\d,.]*%?)")
    for chunk in chunks:
        key = str(chunk.get("source") or chunk.get("id") or "?")
        for label, value in pattern.findall(str(chunk.get("text") or "")):
            facts.setdefault(label.strip().lower(), []).append((key, value))

    conflicts: list[dict[str, Any]] = []
    for label, entries in facts.items():
        values = {v for _k, v in entries}
        if len(values) > 1 and len({k for k, _v in entries}) > 1:
            conflicts.append(
                {
                    "claim": label,
                    "values": sorted(values),
                    "sources": sorted({k for k, _v in entries}),
                    "reason": (
                        f"sources disagree on '{label}': "
                        + ", ".join(f"{k}={v}" for k, v in sorted(entries))
                    ),
                }
            )
    return conflicts


# ---------------------------------------------------------------------------
# Assessment
# ---------------------------------------------------------------------------


@dataclass
class ProvenanceAssessment:
    weakest_tier: str = UNVERIFIED
    breaches: list[dict[str, Any]] = field(default_factory=list)
    fabricated: list[dict[str, Any]] = field(default_factory=list)
    conflicts: list[dict[str, Any]] = field(default_factory=list)
    uncited: list[str] = field(default_factory=list)
    sources: list[dict[str, Any]] = field(default_factory=list)

    @property
    def clean(self) -> bool:
        return not (self.breaches or self.fabricated or self.conflicts or self.uncited)

    def to_json(self) -> dict[str, Any]:
        return {
            "weakest_tier": self.weakest_tier,
            "breaches": self.breaches,
            "fabricated_citations": self.fabricated,
            "conflicts": self.conflicts,
            "uncited_claims": self.uncited,
            "sources": self.sources,
            "clean": self.clean,
        }


def assess_provenance(
    session: Session,
    answer: str,
    chunks: list[dict[str, Any]] | None,
    *,
    agent_domain: str | None = None,
    now: dt.datetime | None = None,
) -> ProvenanceAssessment:
    """Everything F2 asks, in one pass over the retrieval set and the answer."""
    assessment = ProvenanceAssessment(
        fabricated=detect_fabricated_citations(answer, chunks),
        conflicts=detect_source_conflict(chunks),
        uncited=uncited_claims(answer, chunks),
    )
    if not chunks:
        assessment.weakest_tier = SYSTEM_OF_RECORD if not answer else UNVERIFIED
        return assessment

    worst = SYSTEM_OF_RECORD
    for chunk in chunks:
        key = str(chunk.get("source") or chunk.get("id") or "")
        record = session.scalar(select(SourceRecord).where(SourceRecord.key == key))
        tier = record.tier if record else UNVERIFIED
        if TIER_RANK[tier] > TIER_RANK[worst]:
            worst = tier
        assessment.sources.append(
            {
                "key": key,
                "tier": tier,
                "domain": record.domain if record else None,
                "registered": record is not None,
                "deprecated": bool(record.deprecated) if record else False,
            }
        )
        if record is not None and record.deprecated:
            assessment.breaches.append(
                {
                    "kind": "deprecated_source",
                    "source": key,
                    "reason": f"'{key}' is marked deprecated and should not be answered from",
                }
            )
        stale = freshness_breach(record, now)
        if stale:
            assessment.breaches.append({"kind": "stale_source", **stale})
        off_domain = domain_breach(record, agent_domain)
        if off_domain:
            assessment.breaches.append({"kind": "off_domain_source", **off_domain})
    assessment.weakest_tier = worst
    return assessment


def tier_allows(required: str, actual: str) -> bool:
    """Is `actual` at least as authoritative as `required`?"""
    return TIER_RANK.get(actual, 99) <= TIER_RANK.get(required, -1)
