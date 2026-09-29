"""Does a deny on this (harness, event) actually stop the agent?

The question nothing in this product asked. We assert enforcement across nine
surfaces and several integrations, and `langgraph.py` does raise on a block —
but nothing recorded, per integration and per event, whether the verdict is
read at a call site that prevents the action. That is a different claim from
"we returned block", and only one of them is a control.

A competitor learned this the expensive way. Their docs described a harness's
turn-end hook as a working gate while upstream discarded the return value, so
every customer policy on that event enforced nothing, silently, for months.
Prose drifted; a table a test can assert against cannot.

**ABSENT MEANS UNVERIFIED, NOT "BLOCK".** A caller must treat a missing entry
as "say nothing". A hedge rendered in the UI is still a claim, and an
unverified claim is what this file exists to prevent.

Every row carries how it was established:

    SOURCE      read in the harness's own source or shipped bundle
    VENDOR_DOCS the vendor documents the behaviour
    LIVE_PROBE  we ran it and watched what happened

and the version it was established against, because a version is part of the
claim and not a footnote. A row whose version has moved is due for a re-probe;
it is not evidence.

**Why this file currently says almost nothing.** Because almost nothing has
been probed. The daemon and the hook client are ours and verifiable, and they
are verified. A harness's wire contract is that harness's, and writing down
what it probably does — from memory, from a blog post, from what would be
sensible — is exactly the failure above with a fresh coat on it. Rows arrive
when somebody runs the probe.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

#: What a deny does on this event, where we know.
Capability = Literal["block", "observe"]

#: How a row was established. Ordered weakest to strongest.
Evidence = Literal["VENDOR_DOCS", "SOURCE", "LIVE_PROBE"]


@dataclass(frozen=True)
class Verified:
    """One (harness, event) pair we have actually established something about."""

    capability: Capability
    evidence: Evidence
    #: The harness version this was established against. Part of the claim.
    version: str
    #: Where to look to check it again — a file and symbol, a docs URL, or the
    #: probe that produced it.
    reference: str
    note: str = ""


#: The table. Keyed (harness, event).
#:
#: Empty is the correct state for a harness nobody has probed, and it is not a
#: placeholder to be filled in with plausible values. `agentfox hooks install`
#: reads this and tells the operator plainly when it cannot promise
#: enforcement, which is better than installing a hook that reports itself as
#: a gate.
CAPABILITY: dict[tuple[str, str], Verified] = {}


def capability_of(harness: str, event: str) -> Verified | None:
    """What a deny does here, or None if nobody has checked."""
    return CAPABILITY.get((harness, event))


def describe(harness: str, event: str) -> str:
    """One line an operator can act on, for the install summary and `doctor`."""
    known = capability_of(harness, event)
    if known is None:
        return (
            f"{harness}/{event}: unverified. The hook will run and record, and whether a "
            "deny stops the call has not been established against this harness — treat it "
            "as observation until it has."
        )
    if known.capability == "block":
        return (
            f"{harness}/{event}: a deny stops the call "
            f"({known.evidence.lower()}, {known.version})."
        )
    return (
        f"{harness}/{event}: the call proceeds regardless — this event observes only "
        f"({known.evidence.lower()}, {known.version})."
    )
