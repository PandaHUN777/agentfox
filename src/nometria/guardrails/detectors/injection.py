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
from ..normalize import evasion_score, normalize

OWASP = "LLM01"
ATLAS = "AML.T0051"
ATLAS_JAILBREAK = "AML.T0054"

# --- 1b. Paraphrase and non-English -----------------------------------------
# The corpus showed the original table caught canonical English and nothing else: an
# attacker who rewrites the sentence, or writes it in French, walked straight through.
# Neither is a sophisticated attack — non-English content is not an attack at all, it
# is Tuesday at any multinational.

_PARAPHRASE: list[tuple[str, str, float]] = [
    # The instruction-override *concept* without its canonical wording.
    (
        r"\b(?:rules?|instructions?|guidelines?|constraints?)\s+(?:you\s+were\s+given\s+)?"
        r"(?:earlier|before|previously|above)?\s*(?:no\s+longer\s+(?:apply|applies)|"
        r"are\s+(?:now\s+)?(?:void|cancelled|canceled|suspended|revoked))\b",
        "OVERRIDE",
        0.8,
    ),
    (
        r"\bset\s+aside\s+(?:your|the|all)\s+(?:earlier|previous|prior|original)\s+"
        r"(?:instruction|guidance|rule|direction)s?\b",
        "OVERRIDE",
        0.8,
    ),
    (r"\bforget\s+what\s+you\s+(?:were|have\s+been)\s+told\b", "OVERRIDE", 0.8),
    (r"\bwhatever\s+(?:rules?|instructions?)\s+you\s+(?:were\s+given|have)\b", "OVERRIDE", 0.75),
    (
        r"\b(?:here\s+are\s+the\s+new|new)\s+(?:instruction|rule|directive)s?\s*[:.]",
        "OVERRIDE",
        0.7,
    ),
    (r"\btreat\s+the\s+following\s+as\s+your\s+only\s+(?:task|instruction)\b", "OVERRIDE", 0.8),
    (r"\byour\s+(?:only|real|actual|true)\s+(?:task|job|purpose)\s+is\b", "OVERRIDE", 0.65),
    # Persona replacement. The named jailbreaks churn constantly, so this matches the
    # *shape* — "you are now X, and X has no limits" — rather than the roster.
    (
        r"\byou\s+are\s+now\s+\w+\b.{0,60}?\b(?:no|without|free\s+from)\s+"
        r"(?:restrictions?|limits?|rules?|filters?|guidelines?)\b",
        "PERSONA",
        0.8,
    ),
    (
        r"\bpretend\s+(?:to\s+be|you\s+are)\s+.{0,40}?\bno\s+(?:restrictions?|limits?)\b",
        "PERSONA",
        0.8,
    ),
    (r"\bact\s+as\s+(?:if\s+you\s+(?:have|had)\s+no|an?\s+unrestricted)\b", "PERSONA", 0.75),
]

#: The same concept across the languages an enterprise agent actually meets. Each
#: requires the *verb* (ignore/forget) as well as the object, so ordinary sentences
#: that merely contain the word "instructions" do not match.
_MULTILINGUAL: list[tuple[str, str, float]] = [
    # French
    (
        r"\b(?:ignorez?|oubliez?)\s+(?:toutes?\s+)?les\s+instructions?\s+"
        r"(?:pr[ée]c[ée]dentes?|ant[ée]rieures?)\b",
        "OVERRIDE",
        0.85,
    ),
    # German
    (
        r"\b(?:ignoriere?|vergiss|missachte)\s+(?:alle\s+)?(?:vorherigen?|bisherigen?|"
        r"vorangegangenen?)\s+(?:Anweisungen|Anleitungen|Regeln)\b",
        "OVERRIDE",
        0.85,
    ),
    # Spanish / Portuguese
    (
        r"\b(?:ignora|olvida|ignore|esque[çc]a)\s+(?:todas?\s+)?(?:las?|as)\s+"
        r"(?:instrucciones|instru[çc][õo]es)\s+(?:anteriores|previas|pr[ée]vias)\b",
        "OVERRIDE",
        0.85,
    ),
    # Italian
    (r"\bignora\s+(?:tutte\s+)?le\s+istruzioni\s+precedenti\b", "OVERRIDE", 0.85),
    # Russian
    (r"(?:игнорируй|забудь|проигнорируй)\s+(?:все\s+)?предыдущие\s+инструкции", "OVERRIDE", 0.85),
    # Japanese
    (
        r"(?:以前|これまで|上記)の(?:指示|命令)(?:を|は)?\s*(?:すべて|全て)?\s*無視",
        "OVERRIDE",
        0.85,
    ),
    # Chinese
    (r"忽略(?:所有)?(?:之前|先前|以上)的(?:指令|指示|规则)", "OVERRIDE", 0.85),
    # Korean
    (r"이전\s*지시(?:사항)?(?:을|를)?\s*무시", "OVERRIDE", 0.85),
]

_EXTRA_LEXICAL: list[tuple[re.Pattern[str], str, float]] = [
    (re.compile(pattern, re.I | re.UNICODE), f"INJECTION.INSTRUCTION_{kind}", score)
    for pattern, kind, score in (_PARAPHRASE + _MULTILINGUAL)
]


# --- 1. Lexical signals ----------------------------------------------------
# (pattern, entity, base_score). Scores are calibrated so that a single weak
# signal never blocks on its own; two independent signals do.
_LEXICAL: list[tuple[re.Pattern[str], str, float]] = [
    (
        re.compile(
            r"\bignore\s*(?:all\s*)?(?:the\s*)?(?:previous|prior|above|earlier)\s*"
            r"(?:instruction|prompt|rule|direction|message)s?\b",
            re.I,
        ),
        "INJECTION.INSTRUCTION_OVERRIDE",
        0.85,
    ),
    (
        re.compile(
            r"\bdisregard\s*(?:all\s*)?(?:previous|prior|the\s*above|your)\s*"
            r"(?:instruction|rule|guideline|training)s?\b",
            re.I,
        ),
        "INJECTION.INSTRUCTION_OVERRIDE",
        0.85,
    ),
    (
        re.compile(
            r"\bforget\s*(?:everything|all)\s*(?:you\s*)?(?:were\s*told|know|above)\b", re.I
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
    # This detector iterates the views itself, so that it can raise the score for
    # content that only matched after de-obfuscation and flag the obfuscation alone.
    handles_views = True
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

        # Every lexical pattern is matched against every normalised reading of the
        # content, not just the raw bytes. The corpus is unambiguous about why: the
        # misses were separators, homoglyphs, fullwidth, base64 and percent-encoding —
        # none of them an attack on the pattern, all of them an attack on the
        # assumption that what the detector reads is what the model reads.
        normalised = normalize(content)
        seen: set[tuple[str, int, int]] = set()

        for pattern, entity, base_score in _LEXICAL + _EXTRA_LEXICAL:
            for view in normalised.views:
                match = pattern.search(view.text)
                if match is None:
                    continue
                start, end = view.origin(match.start(), match.end())
                key = (entity, start, end)
                if key in seen:
                    continue
                seen.add(key)
                atlas = ATLAS_JAILBREAK if "JAILBREAK" in entity or "PERSONA" in entity else ATLAS
                # Content that had to be de-obfuscated before it matched is more
                # suspicious than content that matched as written, not less.
                obfuscation_boost = 0.1 if view.kind != "normalized" else 0.0
                out.append(
                    Detection(
                        entity_type=entity,
                        score=min(1.0, base_score + boost + obfuscation_boost),
                        start=start,
                        end=end,
                        sample=snippet(content, start, end),
                        owasp_id="LLM07" if "SYSTEM_PROMPT_LEAK" in entity else OWASP,
                        atlas_id=atlas,
                        detail={
                            "signal": "lexical",
                            "taint": context.taint_source,
                            "view": view.kind,
                            "transforms": normalised.transforms,
                        },
                    )
                )
                break  # one view is enough; the rest would report the same thing

        # Obfuscation is evidence in its own right. Ordinary content is occasionally
        # fullwidth or occasionally base64; it is rarely both and almost never
        # zero-width. Content that went to lengths not to be read is worth a finding
        # even when nothing inside it matched — that is the case where a pattern set
        # is about to be one technique behind.
        evasion = evasion_score(normalised)
        if evasion >= 0.5 and taint_rank(context.taint_source) >= 2:
            out.append(
                Detection(
                    entity_type="INJECTION.OBFUSCATED_CONTENT",
                    score=min(1.0, evasion + boost),
                    start=0,
                    end=min(len(content), 120),
                    sample=snippet(content, 0, min(len(content), 120)),
                    owasp_id=OWASP,
                    atlas_id=ATLAS,
                    detail={
                        "signal": "evasion",
                        "techniques": [e.get("kind") for e in normalised.evasion],
                        "taint": context.taint_source,
                    },
                )
            )

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
