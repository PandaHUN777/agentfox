import Link from "next/link";
import type { ReactNode } from "react";

import { BOUNDARIES, DecisionCard } from "@/components/marketing/decisions";
import { DecisionStream, EstateScan, TraceAnatomy } from "@/components/marketing/product";
import { REPO } from "@/components/marketing/nav";

/*
 * The homepage sections.
 *
 * What this replaces, and why. The previous version was eight sections of the same
 * shape: eyebrow, centred heading, lede, grid of dense panels. It led with
 * "capability grants", "provenance" and "impact tier", which are mechanisms, and it
 * never once said what a reader gets. It read as a report.
 *
 * The rules this file follows:
 *   1. Every section heading states a benefit, not a mechanism. The mechanism is
 *      allowed in the supporting line, never in the heading.
 *   2. Three ticks beat a paragraph. A reader scans ticks and skips prose.
 *   3. One picture per section, large, and it is the product rather than a drawing.
 *   4. Sections alternate shape and ground, so the page has a rhythm instead of
 *      eight identical grids.
 *   5. No jargon before its plain-English meaning has been given.
 */

/* --- Shared ------------------------------------------------------------- */

/** A screenshot in window chrome. Real captures of a running instance. */
function Shot({ src, alt, w = 1600, h }: { src: string; alt: string; w?: number; h: number }) {
  return (
    <div className="mk-frame">
      <div className="mk-frame-bar">
        <span className="mk-frame-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        width={w}
        height={h}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
}

function Ticks({ items, row }: { items: string[]; row?: boolean }) {
  return (
    <ul className={row ? "mk-ticks mk-ticks-row" : "mk-ticks"}>
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/**
 * A benefit section. `flip` puts the picture on the left at desktop width while
 * keeping the copy first in the DOM, so a phone reads the heading before the image.
 */
function Benefit({
  eyebrow,
  title,
  lede,
  ticks,
  visual,
  flip,
  band,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  ticks: string[];
  visual: ReactNode;
  flip?: boolean;
  band?: boolean;
}) {
  return (
    <section className={band ? "mk-section mk-band" : "mk-section"}>
      <div
        className="mk-wrap mk-split mk-split-wide"
        style={flip ? { direction: "rtl" } : undefined}
      >
        <div className="mk-up" style={flip ? { direction: "ltr" } : undefined}>
          <span className="mk-eyebrow">{eyebrow}</span>
          <h2 className="mk-h2" style={{ marginTop: 12 }}>
            {title}
          </h2>
          <p className="mk-body" style={{ marginTop: 16, fontSize: "1.05rem", maxWidth: "46ch" }}>
            {lede}
          </p>
          <Ticks items={ticks} />
        </div>
        <div className="mk-up mk-d2" style={flip ? { direction: "ltr" } : undefined}>
          {visual}
        </div>
      </div>
    </section>
  );
}

/**
 * The other shape a benefit can take: heading beside its lede, three ticks across,
 * and the picture at the full width of the column underneath.
 *
 * It exists because of a measurement. Inside the split above, a dashboard capture
 * lands at about 620px, which is a 0.48 scale on a 1280px screen — small enough
 * that a reader sees "there is a product" and reads nothing in it. At the full
 * column the same crop runs at 0.84 and the verdicts, the provenance rows and the
 * severity chips are all legible. The section that has to be believed gets this
 * shape; the two that only have to be recognised keep the split.
 */
function BenefitWide({
  eyebrow,
  title,
  lede,
  ticks,
  visual,
  band,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  ticks: string[];
  visual: ReactNode;
  band?: boolean;
}) {
  return (
    <section className={band ? "mk-section mk-band" : "mk-section"}>
      <div className="mk-wrap">
        <div className="mk-head mk-up">
          <div>
            <span className="mk-eyebrow">{eyebrow}</span>
            <h2 className="mk-h2" style={{ marginTop: 12 }}>
              {title}
            </h2>
          </div>
          <p className="mk-body" style={{ margin: 0, fontSize: "1.05rem" }}>
            {lede}
          </p>
        </div>
        <Ticks items={ticks} row />
        <div className="mk-up mk-d2" style={{ marginTop: 40 }}>
          {visual}
        </div>
      </div>
    </section>
  );
}

/* --- 1. Hero ------------------------------------------------------------ */

export function Hero() {
  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <div className="mk-wash" aria-hidden />
      <div
        className="mk-wrap"
        style={{ position: "relative", paddingTop: 72, textAlign: "center" }}
      >
        <span className="mk-eyebrow mk-up">Open source, Apache-2.0</span>
        {/* "AI agents that only do what you allow" was a permissions headline on a
            product that also decides what an agent may read and what it may claim.
            An outside review that had read the PRD made exactly that point. This one
            names the moment all three checks are for.

            The three verbs in the lede are different because the three checks are:
            refuses (tool-containment, ships enforcing), withholds (the entitlement
            filter drops the chunk), tells you (answerability reports while its policy
            is in observe). Measured, not assumed — see decisions.tsx. */}
        <h1 className="mk-h1 mk-up mk-d1" style={{ margin: "16px auto 0", maxWidth: "17ch" }}>
          Know when your agent should <em>stop</em>.
        </h1>
        {/* Four lines became two. The three boundaries are the section directly
            below this one, drawn; repeating them here in prose was the page
            explaining its own next screenful. */}
        <p
          className="mk-lede mk-up mk-d2"
          style={{ margin: "20px auto 0", maxWidth: "46ch" }}
        >
          It checks the action against what that agent was granted — not the message
          against a filter. So it holds after the model has been convinced.
        </p>
        <div className="mk-row mk-up mk-d3" style={{ justifyContent: "center", marginTop: 30 }}>
          <Link href="/playground" className="mk-btn mk-btn-primary">
            Try it, no account
          </Link>
          <a href={REPO} target="_blank" rel="noreferrer" className="mk-btn mk-btn-outline">
            View the source
          </a>
        </div>
        <p className="mk-fine mk-up mk-d4" style={{ marginTop: 16 }}>
          One line in Python · Runs offline, no API key · Free forever
        </p>
      </div>

      {/* Was a 1600px capture of the findings table. At this width it rendered a
          sidebar, a help paragraph, a filter row and seven columns of 8px grey —
          a picture of a document, with nothing for the eye to land on. */}
      <div
        className="mk-wrap mk-up mk-d5"
        style={{ position: "relative", marginTop: 56, paddingBottom: 8, maxWidth: 860 }}
      >
        <DecisionStream />
      </div>
    </section>
  );
}

/* --- 2. The stack strip ------------------------------------------------- */

/** Project names rather than logos: these are integrations, and we have no licence
 *  to anyone's mark. Every one is a real adapter in the repository. */
const STACK = [
  "OpenAI",
  "Anthropic",
  "LiteLLM",
  "LangChain",
  "LangGraph",
  "FastAPI",
  "MCP",
  "OpenTelemetry",
  "Presidio",
  "Open Policy Agent",
];

export function Stack() {
  return (
    <section className="mk-section-tight">
      <div className="mk-wrap" style={{ textAlign: "center" }}>
        <p className="mk-label" style={{ marginBottom: 18 }}>
          Works with what you already run
        </p>
        <div className="mk-strip mk-up">
          {STACK.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- 3. The three boundaries -------------------------------------------- */

/**
 * The centre of the page, and the thing two outside reviews independently said was
 * missing: three decisions, side by side, with the agent, the input, the rule and
 * the reason visible on each.
 *
 * What was here before was three benefit sections — containment, evidence,
 * discovery — which is a product tour. It led a reader to think the product
 * authorises tool calls and also does some auditing, when the actual shape is one
 * idea applied at three points in a request: before retrieval, before the answer,
 * before the action.
 *
 * The verbs under each card are different on purpose, because the three checks do
 * different things and saying "blocks" three times would be false twice. Every
 * value on the cards was read off this repository's gateway; see the comment above
 * BOUNDARIES in decisions.tsx.
 */
export function Boundaries() {
  return (
    <section id="boundaries" className="mk-section mk-band">
      <div className="mk-wrap">
        <div className="mk-narrow" style={{ textAlign: "center" }}>
          <span className="mk-eyebrow mk-up">Three questions, every request</span>
          <h2 className="mk-h2 mk-up mk-d1" style={{ marginTop: 12 }}>
            One boundary check, at three different moments.
          </h2>
          <p className="mk-lede mk-up mk-d2" style={{ margin: "16px auto 0", maxWidth: "56ch" }}>
            Not a filter reading the conversation. A check against what this agent, and
            the person behind it, were actually given.
          </p>
        </div>

        <div className="mk-grid mk-grid-3 mk-up mk-d3" style={{ marginTop: 44 }}>
          {BOUNDARIES.map((b) => (
            <div
              key={b.id}
              style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 14, minWidth: 0 }}
            >
              <div>
                <h3 className="mk-h3">{b.question}</h3>
                <p className="mk-body" style={{ margin: "6px 0 0", fontSize: ".94rem" }}>
                  {b.lede}
                </p>
              </div>
              <DecisionCard decision={b.decision} fill />
            </div>
          ))}
        </div>

        {/* The honest edge of the three cards, next to them rather than buried in the
            limits section. The first two need the operator to have declared something;
            the third is default-deny and needs nothing. */}
        {/* Where each one runs, and what it costs you to turn on. Written after an
            audit of the enforcement paths, because the first draft of this section
            implied all three happen automatically and only the third does. */}
        <div className="mk-grid mk-grid-3 mk-up mk-d4" style={{ marginTop: 26 }}>
          {[
            [
              "Read",
              "You call the filter from your retrieval code, with a registered person and a grant. It returns what they may see; you drop the rest.",
            ],
            [
              "Answer",
              "Declare a knowledge boundary for the agent. It reports by default and abstains before the model is called once you set that boundary to enforce.",
            ],
            [
              "Act",
              "Nothing to turn on. A tool the agent was never granted is refused from the first request, whatever mode the policies are in.",
            ],
          ].map(([k, v]) => (
            <p key={k} className="mk-fine" style={{ margin: 0 }}>
              <strong style={{ color: "var(--mk-text)" }}>{k}.</strong> {v}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- 3b. What it keeps -------------------------------------------------- */

/**
 * Evidence and discovery, demoted.
 *
 * They used to be two of the three top sections, which made the implied product an
 * audit-and-discovery suite with a permission check attached. They are real and
 * they matter, but they are what the product keeps and finds *around* the checks
 * above, so they sit under them and share one section instead of owning two.
 */
export function Around() {
  return (
    <>
      <BenefitWide
        eyebrow="Evidence"
        title="Know what it did, and prove it."
        lede="Every prompt, retrieval, tool call and decision is recorded as one auditable object, in a log that cannot be edited without the edit showing."
        ticks={[
          "One page per request, with every check that ran",
          "Auditors verify the log themselves, without trusting us",
          "Compliance status computed from real traffic, not a questionnaire",
        ]}
        visual={<TraceAnatomy />}
      />

      <Benefit
        band
        flip
        eyebrow="Discovery"
        title="Find the agents nobody told you about."
        lede="Point it at a repository or a running API. It reports what talks to a model, what is ungoverned, and who owns each one."
        ticks={[
          "Scans source without running it",
          "Flags agents with no owner as a problem of their own",
          "Red-teams your real configuration, not a model in general",
        ]}
        visual={<EstateScan />}
      />
    </>
  );
}

/* --- 4. Proof ----------------------------------------------------------- */

/* Three figures, not five. All three are one experiment: the AgentDojo replay with
 * every detector switched off (README.md, "What we claim, and what we don't", bound
 * to benchmarks/agentdojo_e2e/results by scripts/claims.py). The third is the
 * interesting one and it is why the other two mean anything. */
const PROOF: [string, string][] = [
  ["42 of 42", "attacker calls that act, contained"],
  ["552 of 552", "legitimate calls still allowed"],
  ["0", "detectors switched on"],
];

export function Proof() {
  return (
    <section id="proof" className="mk-section">
      <div className="mk-wrap" style={{ textAlign: "center" }}>
        <span className="mk-eyebrow mk-up">Measured, not asserted</span>
        <h2 className="mk-h2 mk-up mk-d1" style={{ margin: "12px auto 0", maxWidth: "20ch" }}>
          We turned the detectors off and ran it anyway.
        </h2>
        <p className="mk-lede mk-up mk-d2" style={{ margin: "16px auto 0", maxWidth: "52ch" }}>
          617 real agent calls, replayed with every detector disabled. What was left is
          the part that does not depend on catching the attack.
        </p>

        <div className="mk-grid mk-grid-3 mk-up mk-d3" style={{ marginTop: 44 }}>
          {PROOF.map(([n, label]) => (
            <div key={label} className="mk-card mk-stat" style={{ textAlign: "left" }}>
              <b>{n}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* The denominator, beside the numbers rather than one click away. "42 of
            42" invites "out of what?", and a proof section that makes the reader
            follow a link to find out is doing the opposite of its job. All four
            figures are from the same run, written up in section 2 of /benchmark. */}
        <p className="mk-fine mk-up mk-d4" style={{ margin: "20px auto 0", maxWidth: "62ch" }}>
          617 calls: 552 legitimate, and 65 from an agent the attacker had already
          convinced. 42 of those 65 act; the other 23 only read. Three escaped, and
          all three are read-only. This measures the third boundary — whether an action
          runs. It says nothing about the other two.
        </p>

        <p className="mk-row mk-up mk-d5" style={{ justifyContent: "center", marginTop: 26 }}>
          <Link href="/benchmark" className="mk-btn mk-btn-outline">
            Every number, and how to reproduce it
          </Link>
        </p>
      </div>
    </section>
  );
}

/* --- 5. The honest limits ---------------------------------------------- */

/* Kept, and kept short. This product's credibility rests on publishing the numbers
 * that make it look worse, and a reader who finds them elsewhere first will not come
 * back. Three lines, not a grid of four dense cards. */
/* Four, not three, because the page now claims three boundaries and two of them
 * depend on things the operator has to declare and on integrations that do not
 * exist yet. Each is the repository's own assessment, from docs/status.md:
 * P2 "no live IdP; Entra/Okta integration absent", P10 "OpenFGA adapter is a
 * declared seam, not an implementation", P8 "catalog ingestion absent". */
const LIMITS: [string, string][] = [
  [
    "Detection is our weakest layer",
    "66.7% recall on a held-out set, and an attacker who retries gets 73% of what we catch through. Published, not rounded.",
  ],
  [
    "It is only as good as your declarations",
    "A tool recorded as read-only that is not read-only is not covered. Nor is a person with no principal, or an agent with no knowledge boundary.",
  ],
  [
    "You declare the estate yourself",
    "No Okta, no DataHub. Principals, grants and source tiers are declared in AgentFox. The seams for those integrations exist; the integrations do not.",
  ],
  [
    "It is MVP v0.3",
    "No single sign-on, one organisation, text only. The full list is in the README.",
  ],
];

export function Limits() {
  return (
    <section id="limits" className="mk-section mk-band">
      <div className="mk-wrap">
        <div className="mk-narrow" style={{ textAlign: "center" }}>
          <span className="mk-eyebrow mk-up">What it does not do</span>
          <h2 className="mk-h2 mk-up mk-d1" style={{ marginTop: 12 }}>
            The limits, before you find them yourself.
          </h2>
        </div>
        <div className="mk-grid mk-grid-quad mk-up mk-d2" style={{ marginTop: 40 }}>
          {LIMITS.map(([t, body]) => (
            <div key={t} className="mk-card">
              <h3 className="mk-h3">{t}</h3>
              <p className="mk-body" style={{ margin: "10px 0 0", fontSize: ".96rem" }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
