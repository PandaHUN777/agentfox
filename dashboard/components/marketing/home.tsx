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
 *   3. One picture per section, large, and drawn rather than captured: a
 *      screenshot of a dense dashboard at column width is a picture of a document.
 *   4. Sections alternate shape and ground, so the page has a rhythm instead of
 *      eight identical grids.
 *   5. No jargon before its plain-English meaning has been given.
 */

/* --- Shared ------------------------------------------------------------- */


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
  eyebrow?: string;
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
          {eyebrow && <span className="mk-eyebrow">{eyebrow}</span>}
          <h2 className="mk-h2" style={{ marginTop: eyebrow ? 12 : 0 }}>
            {title}
          </h2>
          <p className="mk-body" style={{ marginTop: 16, fontSize: "var(--t-body)", maxWidth: "46ch" }}>
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
  eyebrow?: string;
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
            {eyebrow && <span className="mk-eyebrow">{eyebrow}</span>}
            <h2 className="mk-h2" style={{ marginTop: eyebrow ? 12 : 0 }}>
              {title}
            </h2>
          </div>
          <p className="mk-body" style={{ margin: 0, fontSize: "var(--t-body)" }}>
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

/**
 * One screen, two elements: the sentence and the evidence.
 *
 * The rendered DOM measured the old hero as a 70px centred sentence, a 21px lede
 * and three capsule buttons, with the first refused tool call 1,272px down the
 * page — below the fold on every laptop. A developer-tools buyer decides in the
 * first screen, and the first screen contained no evidence, only a claim.
 *
 * So: left edge, display size, no full stop, the install line the reader would
 * actually type, and the live decision stream beside it already showing a call
 * being refused. Two CTAs, because the audit found nine on this page with four of
 * them styled primary — when four things are primary, nothing is.
 */
export function Hero() {
  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <div className="mk-wash" aria-hidden />
      <div className="mk-wrap mk-hero" style={{ position: "relative" }}>
        <div>
          {/* Four attempts to get this line right, and what each one got wrong:
                "The injection worked. The transfer didn't." was a riddle — it
              needs you to know what a prompt injection is before the sentence
              parses, and "the transfer" referred to nothing on screen yet.
                "Your agent can only call the tools you gave it" was plain but
              inert: it describes how anyone would assume agents already work,
              so it reads as a restatement rather than a product.
                "Prompt injection stops at the tool call" named the threat, but
              in a practitioner's vocabulary — a CISO reads it cold, a VP Eng
              skims past it.
                This one borrows a category every buyer already understands and
              does the differentiating in one word. "Runtime" is what separates
              it from both neighbours a reader might file it under: a WAF reads
              HTTP at the edge, a text scanner grades a string offline, and this
              sits inline on the call itself. See /compare, which draws the line
              against an actual network firewall — the two pages have to agree,
              so that passage says "not a network firewall, an action-layer one"
              rather than "not a firewall". */}
          <h1 className="mk-h1 mk-up mk-d1">
            <em>Runtime firewall</em> for AI agents
          </h1>
          {/* Three things were wrong with the line this replaces. "so it cannot be
              argued with" is a clever closer hung off an em-dash pivot, which is the
              most recognisable tell there is. "grants" is our internal word — the
              reader has not met it yet and will not until /product. And the fragment
              opener ("One line of Python.") was doing rhetorical work that the
              install block six inches below does literally.
              Three short sentences instead, each stating one fact, in the words a
              reader would use to repeat it to someone else. */}
          <p className="mk-lede mk-up mk-d2" style={{ marginTop: 20, maxWidth: "50ch" }}>
            AgentFox sits between your agent and its tools. Every call is checked
            against the permissions you set, and anything outside them is refused
            before it runs. The prompt is never read.
          </p>
          <pre className="mk-install mk-up mk-d3">
            <code>pip install git+https://github.com/architsharm/agentfox.git</code>
            <code className="mk-install-2">import agentfox; agentfox.auto()</code>
          </pre>
          <div className="mk-row mk-up mk-d4" style={{ marginTop: 24 }}>
            <Link href="/playground" className="mk-btn mk-btn-primary">
              Try it, no account
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="mk-btn mk-btn-outline">
              View the source
            </a>
          </div>
          <p className="mk-fine mk-up mk-d5" style={{ marginTop: 16 }}>
            Runs offline · No API key · Apache-2.0
          </p>
        </div>

        {/* Was a 1600px capture of the findings table. At this width it rendered a
            sidebar, a help paragraph, a filter row and seven columns of 8px grey —
            a picture of a document, with nothing for the eye to land on. */}
        <div className="mk-up mk-d3">
          <DecisionStream />
        </div>
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
      <div className="mk-wrap">
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
        <div className="mk-narrow">
          <h2 className="mk-h2 mk-up">Three places a request can be stopped</h2>
          <p className="mk-lede mk-up mk-d1" style={{ marginTop: 16, maxWidth: "56ch" }}>
            Each one checks what this agent, and the person behind it, were granted.
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
                <p className="mk-body" style={{ margin: "6px 0 0", fontSize: "var(--t-small)" }}>
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
        title="Every decision lands in a chain you can verify without us"
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
        title="Find the agents nobody told you about"
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

/**
 * The same run, said in the reader's vocabulary instead of the benchmark's.
 *
 * This section used to be three tiles reading "42 of 42", "552 of 552" and "0
 * detectors switched on". Those are the right numbers and they were the wrong
 * unit: a denominator only means something to someone who already knows what
 * AgentDojo is, and "0 detectors switched on" reads as a missing feature to
 * anyone who does not yet know that is the whole point.
 *
 * So the left column is the attack shape, in the words the reader would use for
 * it, and the number sits beside it as the evidence. Every row is a real
 * scenario from a results file, not a category invented for a marketing grid:
 *
 *   Prompt injection -> tool call   the 42/42 acting-call result,
 *                                   benchmarks/agentdojo_e2e/results
 *   Exfiltration via a tool         containment cb1, capability.denied
 *   Unauthorised transfer           containment cb2/cb3, taint.irreversible_tool
 *                                   and the value constraint
 *   Destructive DELETE              containment cb5, sql.unbounded_mutation
 *                                   and cascade.reaches_destructive
 *
 * The framework line is not decoration either: every identifier on it is a key
 * in src/agentfox/compliance_data/controls.yaml. LLM01 Prompt Injection, LLM02
 * Sensitive Information Disclosure and LLM06 Excessive Agency are the three
 * that map to what this section shows; ATLAS and the Art. 14 rule are named
 * because they are the ones a security reviewer asks about first.
 */
const THREATS: { threat: string; detail: string; result: string }[] = [
  {
    threat: "Prompt injection reaching a tool call",
    detail: "The model is already convinced; the call is refused anyway",
    result: "42 of 42 contained",
  },
  {
    threat: "Data exfiltration through a tool argument",
    detail: "A tool the agent was never granted",
    result: "contained",
  },
  {
    threat: "Unauthorised transfer",
    detail: "Destination or amount taken from attacker-controlled text",
    result: "contained",
  },
  {
    threat: "Destructive delete",
    detail: "An unbounded DELETE carried in a tool argument",
    result: "contained",
  },
];

/* Framework ids, each one a key in compliance_data/controls.yaml. Written out
   rather than abbreviated because a reviewer scans for the exact string. */
const FRAMEWORKS = [
  "OWASP LLM01 Prompt Injection",
  "LLM02 Sensitive Information Disclosure",
  "LLM06 Excessive Agency",
  "MITRE ATLAS",
  "EU AI Act Art. 14",
];

export function Proof() {
  return (
    <section id="proof" className="mk-section">
      <div className="mk-wrap">
        <span className="mk-eyebrow mk-up">Measured with every detector switched off</span>
        <h2 className="mk-h2 mk-up mk-d1" style={{ marginTop: 12, maxWidth: "24ch" }}>
          What a compromised agent still could not do
        </h2>
        <p className="mk-lede mk-up mk-d2" style={{ marginTop: 16, maxWidth: "56ch" }}>
          617 real agent calls replayed from AgentDojo, with our detection disabled
          entirely, against an agent the attacker had already talked round.
        </p>

        <div className="mk-threats mk-up mk-d3">
          {THREATS.map((t) => (
            <div key={t.threat} className="mk-threat">
              <div>
                <b>{t.threat}</b>
                <span>{t.detail}</span>
              </div>
              <span className="mk-threat-verdict">{t.result}</span>
            </div>
          ))}

          {/* The denominator sits with the numbers rather than one click away: "42
              of 42" invites "out of what?", and a proof section that makes the
              reader follow a link to find out is doing the opposite of its job. */}
          <div className="mk-threat-foot">
            <p>
              552 of 552 legitimate calls still ran. Of the 65 the attacker sent, 42
              act and 23 only read — three reads got through, and all three were
              things the agent already held a grant for. This measures whether an
              action runs, and nothing else.
            </p>
            <div className="mk-row" style={{ gap: 6 }}>
              {FRAMEWORKS.map((f) => (
                <span key={f} className="mk-chip">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="mk-row mk-up mk-d5" style={{ marginTop: 24 }}>
          <Link href="/benchmark" className="mk-btn mk-btn-outline">
            See every number
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

export function Limits() {
  return (
    /*
     * One line and a link, where four cards used to be.
     *
     * The cards were right to exist and wrong to be here. They sat between the
     * product story and the pricing — exactly where a visitor decides whether to
     * try the thing — and the last of them existed only to say the product is
     * version 0.3. Publishing the limits is this project's best trait, and it
     * survives in full on /how-it-works, on /benchmark and on /compare, where the
     * reader has come to check rather than to be convinced. A link costs nothing
     * in credibility; a wall of caveats at the point of decision costs a sign-up.
     */
    <section id="limits" className="mk-section-tight">
      <div className="mk-wrap">
        <div className="mk-honest mk-up">
          <div>
            <h2 className="mk-h3">We publish what this does not do</h2>
            <p className="mk-body">
              Every limit of the benchmark above, and the detection numbers where a
              competing scanner is more precise than ours.
            </p>
          </div>
          <Link href="/how-it-works#limits" className="mk-btn mk-btn-outline">
            Read the limits
          </Link>
        </div>
      </div>
    </section>
  );
}
