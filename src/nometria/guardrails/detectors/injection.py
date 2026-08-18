"""Prompt-injection and jailbreak detection (P3-1, NOM-RTG-01).

Design position, stated because it drives the code: detection alone is a losing
arms race. This detector is deliberately *table stakes* — it exists to catch the
common cases cheaply and inside the latency budget, while the durable defence is
containment (``policy`` + taint tracking, P3-4). See Appendix E.1.1.

Three signal families, scored and combined:
  1. **Lexical** — known override/jailbreak phrasings.
  2. **Structural** — fake role delimiters, injected system blocks, encoded payloads.
  3. **Contextual** — severity is raised when the content arrived from an untrusted
     surface. The *same string* is far more suspicious in a retrieved document than
     in a user's message, and no model-era string filter models that.

Reference material: the multi-layer approach in Rebuff (stale, Appendix A.3) and
the scanner taxonomy of LLM Guard (archived Jul 2026). Reimplemented, not depended on.
"""

from __future__ import annotations

import base64
import re

from ..base import BaseDetector, Detection, DetectionContext, redact_sample, snippet, taint_rank

OWASP = "LLM01"
ATLAS = "AML.T0051"
ATLAS_JAILBREAK = "AML.T0054"

# --- 1. Lexical signals ----------------------------------------------------
# (pattern, entity, base_score). Scores are calibrated so that a single weak
# signal never blocks on its own; two independent signals do.
_LEXICAL: list[tuple[re.Pattern[str], str, float]] = [
    (
        re.compile(
            r"\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+"
            r"(?:instruction|prompt|rule|direction|message)s?\b",
            re.I,
        ),
        "INJECTION.INSTRUCTION_OVERRIDE",
        0.85,
    ),
    (
        re.compile(
            r"\bdisregard\s+(?:all\s+)?(?:previous|prior|the\s+above|your)\s+"
            r"(?:instruction|rule|guideline|training)s?\b",
            re.I,
        ),
        "INJECTION.INSTRUCTION_OVERRIDE",
        0.85,
    ),
    (
        re.compile(
            r"\bforget\s+(?:everything|all)\s+(?:you\s+)?(?:were\s+told|know|above)\b", re.I
        ),
        "INJECTION.INSTRUCTION_OVERRIDE",
        0.8,
    ),
    (
        re.compile(
            r"\byou\s+are\s+(?:now|actually)\s+(?:a|an|in)\b.{0,60}?"
            r"\b(?:unrestricted|unfiltered|jailbroken|developer\s+mode|DAN)\b",
            re.I,
        ),
        "INJECTION.PERSONA_OVERRIDE",
        0.85,
    ),
    (
        re.compile(r"\b(?:developer|god|admin|debug)\s+mode\s+(?:enabled|on|activated)\b", re.I),
        "INJECTION.PERSONA_OVERRIDE",
        0.75,
    ),
    (
        re.compile(r"\bnew\s+(?:system\s+)?(?:instruction|prompt|directive)s?\s*[:\-]", re.I),
        "INJECTION.INSTRUCTION_INJECTION",
        0.8,
    ),
    (
        re.compile(
            r"\b(?:reveal|print|repeat|show|output|display)\s+(?:me\s+)?"
            r"(?:your|the)\s+(?:system\s+)?(?:prompt|instruction|rule)s?\b",
            re.I,
        ),
        "INJECTION.SYSTEM_PROMPT_LEAK",
        0.8,
    ),
    (
        re.compile(r"\bwhat\s+(?:were|are)\s+your\s+(?:original\s+)?instructions\b", re.I),
        "INJECTION.SYSTEM_PROMPT_LEAK",
        0.65,
    ),
    (
        re.compile(
            r"\b(?:do\s+not|don'?t|never)\s+(?:tell|inform|mention\s+to|alert)\s+"
            r"(?:the\s+)?(?:user|human|operator)\b",
            re.I,
        ),
        "INJECTION.COVERT_INSTRUCTION",
        0.8,
    ),
    (
        re.compile(
            r"\bwithout\s+(?:asking|informing|notifying|confirming\s+with)\s+"
            r"(?:the\s+)?(?:user|human|anyone)\b",
            re.I,
        ),
        "INJECTION.COVERT_INSTRUCTION",
        0.7,
    ),
    (
        re.compile(
            r"\b(?:send|email|post|upload|exfiltrate|forward)\b.{0,40}?"
            r"\b(?:to|at)\s+(?:https?://|[\w.\-]+@)",
            re.I,
        ),
        "INJECTION.EXFILTRATION",
        0.75,
    ),
    (
        re.compile(
            r"\bpretend\s+(?:that\s+)?(?:you|to\s+be)\b.{0,40}?"
            r"\b(?:no|without)\s+(?:restriction|filter|rule|guardrail)",
            re.I,
        ),
        "INJECTION.JAILBREAK",
        0.8,
    ),
    (
        re.compile(
            r"\bfor\s+(?:educational|research|testing)\s+purposes\s+only\b.{0,60}?"
            r"\b(?:ignore|bypass|disable)\b",
            re.I,
        ),
        "INJECTION.JAILBREAK",
        0.7,
    ),
    (
        re.compile(
            r"\bthis\s+is\s+(?:a\s+)?(?:test|simulation|hypothetical)\b.{0,50}?"
            r"\b(?:safety|guardrail|filter|policy)\b.{0,30}?\b(?:off|disabled|not\s+apply)",
            re.I,
        ),
        "INJECTION.JAILBREAK",
        0.7,
    ),
]

# --- 2. Structural signals -------------------------------------------------
_ROLE_DELIMITER = re.compile(r"(?:^|\n)\s*(?:###\s*)?(?:system|assistant|user)\s*:\s*", re.I | re.M)
_CHATML = re.compile(r"<\|(?:im_start|im_end|system|endoftext)\|>", re.I)
_XML_SYSTEM = re.compile(r"</?(?:system|instructions?|admin)>", re.I)
_HIDDEN_CHARS = re.compile(r"[​-‏‪-‮⁠-⁤﻿]")
_LONG_B64 = re.compile(r"\b[A-Za-z0-9+/]{60,}={0,2}\b")

# Instructions embedded where only data belongs — the tool-poisoning shape (P1-5).
_IMPERATIVE_IN_DATA = re.compile(
    r"\b(?:you\s+must|always|before\s+(?:using|calling|responding))\b.{0,60}?"
    r"\b(?:call|invoke|send|read|include|append)\b",
    re.I,
)


def _decodes_to_suspicious_text(blob: str) -> str | None:
    """A base64 payload that decodes to instruction-like text is a strong signal."""
    try:
        raw = base64.b64decode(blob + "=" * (-len(blob) % 4), validate=True)
        text = raw.decode("utf-8", errors="strict")
    except Exception:
        return None
    if len(text) < 12:
        return None
    for pattern, _entity, _score in _LEXICAL:
        if pattern.search(text):
            return text
    return None


class InjectionHeuristicDetector(BaseDetector):
    key = "injection.heuristic"
    version = "1.2"
    surfaces = ("input", "retrieved", "tool_result", "output")

    def _detect(self, content: str, context: DetectionContext) -> list[Detection]:
        if not content:
            return []
        out: list[Detection] = []

        # Untrusted provenance raises severity. Rank 0/1 == none/user (trusted-ish);
        # anything above is content the agent pulled in, where an instruction has no
        # legitimate reason to be.
        provenance_boost = 0.15 if taint_rank(context.taint_source) >= 2 else 0.0
        surface_boost = 0.1 if context.surface in ("retrieved", "tool_result") else 0.0
        boost = provenance_boost + surface_boost

        for pattern, entity, base_score in _LEXICAL:
            for m in pattern.finditer(content):
                atlas = ATLAS_JAILBREAK if "JAILBREAK" in entity or "PERSONA" in entity else ATLAS
                out.append(
                    Detection(
                        entity_type=entity,
                        score=min(1.0, base_score + boost),
                        start=m.start(),
                        end=m.end(),
                        sample=snippet(content, m.start(), m.end()),
                        owasp_id="LLM07" if "SYSTEM_PROMPT_LEAK" in entity else OWASP,
                        atlas_id=atlas,
                        detail={"signal": "lexical", "taint": context.taint_source},
                    )
                )
                break  # one hit per pattern is enough; keeps the finding list readable

        # Structural: fabricated role turns inside content that should be plain data.
        for pattern, entity in (
            (_CHATML, "INJECTION.CONTROL_TOKENS"),
            (_XML_SYSTEM, "INJECTION.FAKE_SYSTEM_BLOCK"),
        ):
            m = pattern.search(content)
            if m:
                out.append(
                    Detection(
                        entity_type=entity,
                        score=min(1.0, 0.8 + boost),
                        start=m.start(),
                        end=m.end(),
                        sample=snippet(content, m.start(), m.end()),
                        owasp_id=OWASP,
                        atlas_id=ATLAS,
                        detail={"signal": "structural"},
                    )
                )

        if context.surface in ("retrieved", "tool_result"):
            m = _ROLE_DELIMITER.search(content)
            if m:
                out.append(
                    Detection(
                        entity_type="INJECTION.ROLE_DELIMITER",
                        score=0.7,
                        start=m.start(),
                        end=m.end(),
                        sample=snippet(content, m.start(), m.end()),
                        owasp_id=OWASP,
                        atlas_id=ATLAS,
                        detail={"signal": "structural", "surface": context.surface},
                    )
                )
            m = _IMPERATIVE_IN_DATA.search(content)
            if m:
                out.append(
                    Detection(
                        entity_type="INJECTION.INSTRUCTION_IN_DATA",
                        score=0.65,
                        start=m.start(),
                        end=m.end(),
                        sample=snippet(content, m.start(), m.end()),
                        owasp_id="LLM03",
                        atlas_id="AML.T0053",
                        detail={"signal": "structural", "note": "tool-poisoning shape"},
                    )
                )

        # Invisible characters used to hide a payload from human review.
        hidden = _HIDDEN_CHARS.findall(content)
        if hidden:
            m = _HIDDEN_CHARS.search(content)
            assert m is not None
            out.append(
                Detection(
                    entity_type="INJECTION.HIDDEN_CHARACTERS",
                    score=0.6 + boost,
                    start=m.start(),
                    end=m.end(),
                    sample=f"{len(hidden)} zero-width/bidi characters",
                    owasp_id=OWASP,
                    atlas_id=ATLAS,
                    detail={"signal": "structural", "count": len(hidden)},
                )
            )

        # Encoded payloads that decode to instructions.
        for m in _LONG_B64.finditer(content):
            decoded = _decodes_to_suspicious_text(m.group())
            if decoded:
                out.append(
                    Detection(
                        entity_type="INJECTION.ENCODED_PAYLOAD",
                        score=min(1.0, 0.85 + boost),
                        start=m.start(),
                        end=m.end(),
                        sample=redact_sample(m.group(), keep=8),
                        owasp_id=OWASP,
                        atlas_id=ATLAS,
                        detail={"signal": "encoded", "decoded_sample": redact_sample(decoded, 12)},
                    )
                )
                break

        return out
