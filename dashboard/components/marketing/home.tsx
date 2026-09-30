import Link from "next/link";
import type { ReactNode } from "react";

import { BoundarySequence } from "@/components/marketing/sequence";
import { EstateScan, TraceAnatomy } from "@/components/marketing/product";
import { REPO } from "@/components/marketing/nav";
import { ThreatMarquee } from "@/components/marketing/motion";
import { Shot } from "@/components/marketing/shot";

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
    <section className="mk-hero-act">
      {/* Ambient, behind everything, and doing one job: giving the paper
          ground somewhere to be warmer, so the screenshot beside it reads as
          a lit object rather than as a rectangle pasted on a flat field.
          Two soft brand-tinted pools, no hard edge, no gradient banding. */}
      <div className="mk-hero-glow" aria-hidden />

      <div className="mk-wrap mk-hero" style={{ position: "relative" }}>
        <div>
          <p className="mk-kicker mk-up mk-d1">Runtime, on every tool call</p>
          <h1 className="mk-h1 mk-up mk-d2">
            <em>Runtime firewall</em> for AI agents
          </h1>
          <p className="mk-lede mk-up mk-d3" style={{ marginTop: 22, maxWidth: "40ch" }}>
            Your agents move money, delete records and answer for you. Every call is
            checked against what you actually granted.
          </p>
          <div className="mk-row mk-up mk-d4" style={{ marginTop: 30 }}>
            <Link href="/playground" className="mk-btn mk-btn-primary">
              Try it, no account
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="mk-btn mk-btn-outline">
              View the source
            </a>
          </div>
          <p className="mk-fine mk-up mk-d5" style={{ marginTop: 18 }}>
            Runs offline · No API key · Apache-2.0
          </p>
        </div>

        {/* Was a diagram drawn in CSS: calls approaching a line, one refused.
            Accurate, and unmistakably the work of a repository. This is the
            same event, actually happening — a real transfer, refused, with
            the rule that refused it and how long it took. A reader believes
            the second one and only follows the first. */}
        <div className="mk-up mk-d3 mk-hero-shot">
          <Shot
            src="/product/refusal.png"
            alt="A support agent asks to transfer $5,000. AgentFox refuses the call: capability.denied, in 81.8 milliseconds."
            width={1600}
            height={670}
            priority
            sizes="(max-width: 940px) 92vw, 720px"
            caption={
              <>
                A support agent, talked into asking for a transfer it was never granted.
                The first preset in the <Link href="/playground">playground</Link>.
              </>
            }
          />
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

/* --- 2a. The proof band ------------------------------------------------- */

/**
 * The slot every site in this category fills with customer logos and a
 * Gartner badge, and we have neither.
 *
 * The temptation is to leave it empty and the mistake would be to fake it.
 * What goes here instead is the thing those logos are a proxy for — a reason
 * to believe — and ours is checkable in a way a logo never is. Every figure
 * below resolves to a page that names the run it came from, which is a
 * stronger claim than a customer who cannot be asked.
 *
 * Five, because four reads as a feature grid and six starts wrapping into a
 * second row of small numbers, which is where a stat band stops being a
 * statement and becomes a table.
 */
const PROOF: { n: string; label: string; href: string }[] = [
  { n: "42 / 42", label: "attacker tool calls contained, every detector off", href: "/benchmark" },
  { n: "116", label: "failure scenarios scored — including the ones we miss", href: "/coverage" },
  { n: "43", label: "controls across seven compliance frameworks", href: "/frameworks" },
  { n: "9", label: "surfaces checked, from the prompt to the model's reasoning", href: "/runtime" },
  { n: "0", label: "network calls at request time. It runs offline", href: "/security" },
];

export function ProofBand() {
  return (
    <section className="mk-section-tight mk-reveal" aria-label="Evidence">
      <div className="mk-wrap">
        <div className="pb mk-stagger">
          {PROOF.map((item) => (
            <Link key={item.label} href={item.href} className="pb-item">
              <b>{item.n}</b>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        {/* The honest version of a logo wall, said with a straight back.
            Announcing that we have no customers is true and is not the point;
            the point is that a figure you can trace beats a logo you cannot
            interrogate, and that is a claim worth making confidently. */}
        <p className="mk-fine" style={{ marginTop: 22 }}>
          Every figure links to the run that produced it — which is more than a
          logo can tell you.
        </p>
      </div>
    </section>
  );
}

/* --- 2b. Where the policy binds ----------------------------------------- */

/**
 * The section this page was missing, and the reason it was missing is
 * instructive: we built six binding points over a year and described them in
 * the README as a list of integrations, which reads as "supports several
 * frameworks" — a compatibility note, not an argument.
 *
 * A competitor with $132M named the same architecture "Open Enforcement" and
 * put it on their front page: no single gateway sees every agent, rerouting
 * everything through one taxes your architecture, so the policy is defined
 * once and bound wherever you already run. That is exactly what this is, and
 * naming it costs nothing.
 *
 * The rows are deliberately specific about *what each one governs*, because
 * the hero above this already had to be rewritten once for implying that
 * `agentfox.auto()` guards tool calls. It does not — autoguard.py patches
 * model clients, and the callers of Enforcer.guard_tool_call are the LangGraph
 * tool node, the MCP governor, the SDK and the gateway. A section that
 * flattened all six into "protects your agent" would reintroduce exactly the
 * overclaim that rewrite removed, so each row says what it sees.
 */
const CONTROL_POINTS: { where: string; how: string }[] = [
  { where: "Your coding agent", how: "Claude Code hooks" },
  { where: "Any language", how: "HTTP gateway" },
  { where: "Python", how: "agentfox.auto()" },
  { where: "Tool servers", how: "MCP governor" },
  { where: "Graphs", how: "LangGraph tool node" },
  { where: "CI and the terminal", how: "the CLI" },
];

export function ControlPoints() {
  return (
    <section id="control-points" className="mk-section mk-reveal">
      <div className="mk-wrap">
        <div className="mk-narrow">
          <span className="mk-eyebrow mk-up">One policy set, six places it binds</span>
          <h2 className="mk-h2 mk-up mk-d1" style={{ marginTop: 12 }}>
            You should not have to re-architect to get a guardrail
          </h2>
          <p className="mk-lede" style={{ marginTop: 16, maxWidth: "52ch" }}>
            No single gateway sees every agent. Write the policy once and bind it
            where your agents already run.
          </p>
        </div>

        <div className="mk-points mk-stagger">
          {CONTROL_POINTS.map((point) => (
            <div key={point.how} className="mk-point">
              <span className="mk-point-where">{point.where}</span>
              <b>{point.how}</b>
            </div>
          ))}
        </div>

        <p className="mk-fine" style={{ marginTop: 20 }}>
          Each one sees a different surface, and each one is blind to something.{" "}
          <Link href="/control-points">What each can and cannot see</Link>.
        </p>

        {/* The objection-killer, and until now it appeared nowhere on this site.
            Observe mode and the counterfactual verdict are both shipped; a
            reader afraid a guardrail will break their agent has no way to
            discover that from the product pages. */}
        <div className="mk-honest" style={{ marginTop: 40 }}>
          <div>
            <h3 className="mk-h3">Nothing blocks until you say so</h3>
            <p className="mk-body">
              Every pack ships in observe, recording the verdict it <em>would</em>{" "}
              have returned against real calls and changing nothing.
            </p>
          </div>
          <Link href="/hooks" className="mk-btn mk-btn-outline">
            Start with your coding agent
          </Link>
        </div>
      </div>
    </section>
  );
}

/* --- 2c. Three ways an agent goes wrong --------------------------------- */

/**
 * Why this is here at all.
 *
 * The page went straight from "runtime firewall" to a three-stage worked
 * example, which asks the reader to already believe there is a problem worth
 * three stages. The competitor pages that read most easily all do the same
 * thing first: four or five plain sentences naming the kinds of failure, one
 * line each, before any mechanism.
 *
 * The carve-up is the one now used throughout /coverage: external, internal,
 * autonomous — the first three from Zenity's public framing, which is a
 * better split than anything we had. The fourth origin on the coverage page,
 * `intrinsic`, is deliberately not here: it is two thirds of the taxonomy and
 * it is not what a reader arriving at a security product is asking about. It
 * is one click away and the link says so, rather than the page quietly
 * implying three is the whole story.
 *
 * Third one first in emphasis, because it is the one nobody else names and it
 * is the one our capability ceiling is actually for.
 */
const ORIGINS: { name: string; line: string; example: string }[] = [
  {
    name: "Someone attacked it",
    line: "Text that was not written by you, arriving where the model will read it.",
    example:
      "A line in an issue comment telling the agent to push its credentials somewhere.",
  },
  {
    name: "Someone over-granted it",
    line: "Nobody attacked anything. It was doing as it was told, holding more than it needed.",
    example: "A read-only assistant with a token that can also delete.",
  },
  {
    name: "It improvised",
    line: "No attacker and no bad grant. It hit a problem and found a way around it.",
    example:
      "Blocked on a deploy, it goes looking for a credentials file nobody handed it.",
  },
];

export function Origins() {
  return (
    <section id="origins" className="mk-section mk-reveal">
      <div className="mk-wrap">
        <div className="mk-narrow">
          <h2 className="mk-h2 mk-up">Three ways an agent does the wrong thing</h2>
          <p className="mk-lede mk-up mk-d1" style={{ marginTop: 16, maxWidth: "56ch" }}>
            Only the first is an attack. The other two are an agent working exactly as
            built, and they are the ones a text scanner cannot see.
          </p>
        </div>

        <div className="mk-origins mk-stagger">
          {ORIGINS.map((origin, index) => (
            <div key={origin.name} className="mk-origin">
              {/* Numbered because the three are ordered by how little there is
                  to blame, which is the argument the section is making. */}
              <span className="mk-origin-n">{index + 1}</span>
              <b>{origin.name}</b>
              <p>{origin.line}</p>
              <span className="mk-origin-eg">{origin.example}</span>
            </div>
          ))}
        </div>

        <p className="mk-fine" style={{ marginTop: 22 }}>
          A fourth kind has no actor at all — the model is simply wrong, or a provider
          is down. It is two thirds of what we track and most of it is not a security
          problem.{" "}
          <Link href="/coverage">All 116 scenarios, scored</Link>.
        </p>
      </div>

      {/* The concrete instances of the three abstractions above, and the one
          piece of motion on this page that is content rather than polish: a
          paragraph naming ten attacks is a paragraph people skip, and the same
          ten drifting past are absorbed without being read. Full bleed, so it
          reads as a band across the page rather than another column. */}
      <div style={{ marginTop: 44 }}>
        <ThreatMarquee />
      </div>
    </section>
  );
}

/* --- 3. One request, three boundaries ----------------------------------- */

/**
 * The centre of the page.
 *
 * This was three DecisionCards side by side — three self-contained examples with
 * three different agents and three unrelated questions. Three cards teach three
 * facts, and left the reader to infer the one thing that actually matters: these
 * are the same mechanism at three moments of a single request. That inference is
 * the product, and the page was making the visitor do it unaided.
 *
 * It is one journey now, in components/marketing/sequence.tsx: same agent, same
 * customer, stakes climbing from a withheld document to a refused transfer. The
 * third stage only carries weight because the first two happened to the same
 * request.
 */
export function Boundaries() {
  return (
    <section id="boundaries" className="mk-section mk-band mk-reveal">
      <div className="mk-wrap">
        <div className="mk-narrow">
          <h2 className="mk-h2 mk-up">Stop the call before it spends, sends or deletes</h2>
          <p className="mk-lede mk-up mk-d1" style={{ marginTop: 16, maxWidth: "58ch" }}>
            One support request, three checks, each against what this agent and the
            person behind it actually hold.
          </p>
        </div>

        <div className="mk-up mk-d2">
          <BoundarySequence />
        </div>
      </div>
    </section>
  );
}

/* --- 3b. What it keeps --------------------------------------------------- */

/**
 * Audit and discovery, in one section instead of two.
 *
 * They were two full benefit sections, 195 words between them, which made the
 * page read as three products stacked on one URL. They are one idea — what the
 * product knows about your estate once the checks above are running — so they
 * are one section with two panels, and the reader gets both in a screen.
 */
export function Around() {
  return (
    <section className="mk-section mk-band mk-reveal">
      <div className="mk-wrap">
        <div className="mk-narrow">
          <h2 className="mk-h2">Prove what happened, and find what you missed</h2>
          <p className="mk-lede" style={{ marginTop: 16, maxWidth: "50ch" }}>
            Every governed call leaves a record an auditor can check without us.
          </p>
        </div>

        <div className="mk-split mk-stagger" style={{ marginTop: 44, gap: 32 }}>
          <div>
            <TraceAnatomy />
            <p className="mk-fine" style={{ marginTop: 10 }}>
              One page per request. Tamper-evident, with an independent verifier.
            </p>
          </div>
          <div>
            <EstateScan />
            <p className="mk-fine" style={{ marginTop: 10 }}>
              Reads source without running it. An agent with no owner is a finding.
            </p>
          </div>
        </div>
      </div>
    </section>
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
const THREATS: { threat: string; detail: string; result: string; source: string }[] = [
  {
    threat: "Attacker tool calls that act",
    detail: "Write or irreversible calls made on the attacker's behalf",
    result: "42 of 42 contained",
    source: "AgentDojo replay, 617 calls",
  },
  {
    threat: "Exfiltration through an ungranted tool",
    detail: "capability.denied",
    result: "contained",
    source: "containment suite, cb1",
  },
  {
    threat: "Transfer built from attacker-controlled text",
    detail: "taint.irreversible_tool, and the declared value ceiling",
    result: "contained",
    source: "containment suite, cb2 and cb3",
  },
  {
    threat: "Unbounded DELETE in a tool argument",
    detail: "sql.unbounded_mutation, cascade.reaches_destructive",
    result: "contained",
    source: "containment suite, cb5",
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
    <section id="proof" className="mk-section mk-reveal mk-paper-act">
      <div className="mk-wrap">
        <span className="mk-eyebrow mk-up">Measured with every detector switched off</span>
        <h2 className="mk-h2 mk-up mk-d1" style={{ marginTop: 12, maxWidth: "24ch" }}>
          Detection can fail. Permissions still hold.
        </h2>
        <p className="mk-lede mk-up mk-d2" style={{ marginTop: 16, maxWidth: "56ch" }}>
          617 ground-truth tool calls from AgentDojo, replayed through the same
          tool-call guard with every detector disabled.
        </p>

        <div className="mk-threats mk-stagger">
          {THREATS.map((t) => (
            <div key={t.threat} className="mk-threat">
              <div>
                <b>{t.threat}</b>
                <span className="mk-mono">{t.detail}</span>
                {/* Named per row because these are two different experiments. The
                    42 of 42 is the AgentDojo replay; the three below it are
                    scenarios from the containment suite. Presenting all four under
                    one heading without saying so would let a reader take "42 of 42"
                    as the denominator for every row. */}
                <span className="mk-threat-src">{t.source}</span>
              </div>
              <span className="mk-threat-verdict">{t.result}</span>
            </div>
          ))}

          {/* The denominator sits with the numbers rather than one click away: "42
              of 42" invites "out of what?", and a proof section that makes the
              reader follow a link to find out is doing the opposite of its job. */}
          <div className="mk-threat-foot">
            {/* Was three sentences of caveat. The denominator has to stay — "42
                of 42" invites "out of what?" — but the reasoning behind the
                three that got through is a /benchmark paragraph, not a
                homepage one. */}
            <p>
              552 of 552 legitimate calls still ran. Three attacker reads got through,
              each one something the agent already held a grant for.
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

        {/* The rows above are the argument; this is the receipt. A reader who
            does not believe "42 of 42" is not going to be convinced by a
            fourth sentence about it — they want to see the run. */}
        <div className="proof-shot mk-up mk-d4">
          <Shot
            src="/product/benchmark.png"
            alt="The benchmark page: detector precision and recall on named public datasets, each figure naming the run it came from."
            width={1600}
            height={904}
            sizes="(max-width: 900px) 100vw, 900px"
            caption="Every figure on /benchmark names the results file it came from."
          />
        </div>

        <p className="mk-row mk-up mk-d5" style={{ marginTop: 28 }}>
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
    <section id="limits" className="mk-section-tight mk-reveal">
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
