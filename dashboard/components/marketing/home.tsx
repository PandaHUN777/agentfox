import Link from "next/link";
import type { ReactNode } from "react";

import { DecisionPair } from "@/components/marketing/decisions";
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
        <h1 className="mk-h1 mk-up mk-d1" style={{ margin: "16px auto 0", maxWidth: "16ch" }}>
          AI agents that only do <em>what you allow</em>.
        </h1>
        <p
          className="mk-lede mk-up mk-d2"
          style={{ margin: "20px auto 0", maxWidth: "54ch" }}
        >
          AgentFox checks the actions your agent takes and refuses the ones it was never
          given permission for, even after the model has been tricked.
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

      <div
        className="mk-wrap mk-up mk-d5"
        style={{ position: "relative", marginTop: 52, paddingBottom: 8 }}
      >
        <Shot
          src="/shots/findings.webp"
          alt="The AgentFox dashboard listing problems it found, each with a severity, the agent responsible and how often it happened."
          h={1075}
        />
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

/* --- 3. The three benefits --------------------------------------------- */

export function Benefits() {
  return (
    <>
      <Benefit
        band
        eyebrow="Containment"
        title="Stop the action, not just the text."
        lede="Other tools scan for the malicious message. If the scan misses once, the action goes through. AgentFox checks the action itself against what that agent was given."
        ticks={[
          "Refuses any tool the agent was never granted",
          "Enforces limits on the arguments, like amounts and recipients",
          "Knows whether a value came from a person or from a document",
        ]}
        visual={<DecisionPair />}
      />

      <BenefitWide
        eyebrow="Evidence"
        title="Know what it did, and prove it."
        lede="Every prompt, retrieval, tool call and decision is recorded as one auditable object, in a log that cannot be edited without the edit showing."
        ticks={[
          "One page per request, with every check that ran",
          "Auditors verify the log themselves, without trusting us",
          "Compliance status computed from real traffic, not a questionnaire",
        ]}
        visual={
          <Shot
            src="/shots/trace-detail-crop.webp"
            alt="One request in AgentFox: its span timeline, a provenance table marking both message values untrusted, and a decisions table allowing the input and blocking the tool result."
            w={1600}
            h={985}
          />
        }
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
        visual={
          <Shot
            src="/shots/agents-crop.webp"
            alt="The AgentFox agent registry: four agents, one unregistered and two with no owner, and a table naming the unregistered one as detected from traffic."
            w={1600}
            h={835}
          />
        }
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
        <p className="mk-fine mk-up mk-d4" style={{ margin: "20px auto 0", maxWidth: "60ch" }}>
          617 calls: 552 legitimate, and 65 from an agent the attacker had already
          convinced. 42 of those 65 act; the other 23 only read. Three escaped, and
          all three are read-only.
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
const LIMITS: [string, string][] = [
  [
    "Detection is our weakest layer",
    "66.7% recall on a held-out set, and an attacker who retries gets 73% of what we catch through. Published, not rounded.",
  ],
  [
    "It is only as good as your declarations",
    "A tool you record as read-only, that is not read-only, is not covered by any of this.",
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
        <div className="mk-grid mk-grid-3 mk-up mk-d2" style={{ marginTop: 40 }}>
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
