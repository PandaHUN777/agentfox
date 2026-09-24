import Link from "next/link";

/**
 * The lower half of the public landing page: what it does, what was measured, how you
 * get from nothing to governed, what it does not do, the questions a developer asks
 * before installing anything, and the closing block.
 *
 * Presentational only. No state, no data fetching, so these stay server components and
 * the marketing page keeps rendering without a client bundle.
 *
 * Every figure here is copied from a file in this repository rather than written for
 * the page: README.md for the containment and detection results and the MVP status
 * line, app/benchmark/page.tsx for the AgentDojo denominator and the llm-guard
 * comparison, app/page.tsx and app/how-it-works/page.tsx for the behavioural claims
 * (observe by default, the tool-containment exception, the fail-open contract, the two
 * scanner guarantees). Nothing is rounded, and the numbers that make the product look
 * worse are on the page next to the ones that do not, because leading with those is the
 * reason the rest is believed.
 *
 * Colours come from the --mk-* tokens in app/marketing.css only, so light and dark are
 * both correct without a second set of values here.
 */

/** Duplicated rather than imported: nav.tsx owns its own copy and is edited elsewhere. */
const REPO = "https://github.com/architsharm/guardrails";
const LICENSE = `${REPO}/blob/main/LICENSE`;
const SECURITY = `${REPO}/blob/main/SECURITY.md`;

/** External links all carry the same two attributes; this stops them drifting apart. */
function Out({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

function SectionHead({
  eyebrow,
  title,
  lede,
  center = false,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  center?: boolean;
}) {
  return (
    <div
      className={center ? "mk-narrow mk-up" : "mk-up"}
      style={{ textAlign: center ? "center" : "left", maxWidth: center ? undefined : "34ch" }}
    >
      <span className="mk-eyebrow">{eyebrow}</span>
      <h2 className="mk-h2" style={{ marginTop: 14 }}>
        {title}
      </h2>
      {lede && (
        <p className="mk-lede" style={{ margin: "14px auto 0", maxWidth: "62ch" }}>
          {lede}
        </p>
      )}
    </div>
  );
}

/* --- 1. Features -------------------------------------------------------- */

const FEATURES: { title: string; body: string; chip?: string }[] = [
  {
    title: "It finds the agents you already have",
    body: "Point it at a repository and it walks the source with a parser to report what talks to a model and which of it is ungoverned. It never imports or runs your code, and onboarding a hosted API reads that API's OpenAPI document without calling a single operation on it.",
  },
  {
    title: "It refuses the call, not the sentence",
    body: "Each agent holds explicit grants for the tools it may call with ceilings on the argument values, each tool carries a declared impact tier, and every argument carries the provenance of where its value came from. A transfer whose recipient came out of a retrieved document is refused or sent to a person because of where the value came from, with no detector involved.",
  },
  {
    title: "The record shows when it has been edited",
    body: "Every decision lands in a tamper-evident audit chain, whether the call was allowed or blocked, next to a trace of the whole path it took. Evidence packages ship with a stdlib-only verifier, so the record does not rest on trusting the process that wrote it.",
  },
  {
    title: "It tests this deployment, not a model in general",
    body: "Adversarial probes fire at your own agents' capability grants and policy bindings in enforce mode, and eval suites can gate CI so a regression fails the build. It tells you whether this deployment got weaker than it was last week, which is configuration regression testing rather than a robustness certificate.",
  },
  {
    title: "Compliance status is computed, not asserted",
    body: "Controls map to the frameworks you answer to, and each control's status comes from telemetry rather than from a claim someone typed into a spreadsheet. The mappings themselves were produced from framework texts by engineers and not reviewed by compliance counsel, so they ship labelled as draft rather than being quietly left out.",
    chip: "Draft mappings",
  },
];

export function Features() {
  return (
    <section id="features" className="mk-section">
      <div className="mk-wrap">
        <SectionHead
          eyebrow="What it does"
          title="Five things, and the last one admits what it is."
          lede="One line in your entry point puts every model call and every tool call on this path. What follows is what each layer is actually for."
          center
        />
        <div className="mk-grid mk-grid-2" style={{ marginTop: 44 }}>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`mk-card mk-up mk-d${Math.min(i + 1, 5)}`}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div className="mk-row" style={{ gap: 8 }}>
                <h3 className="mk-h3">{f.title}</h3>
                {f.chip && <span className="mk-chip mk-chip-hold">{f.chip}</span>}
              </div>
              <p className="mk-body" style={{ margin: 0, fontSize: ".94rem" }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- 2. Evidence -------------------------------------------------------- */

const STATS: { n: string; label: string; tone?: string }[] = [
  { n: "8 of 8", label: "attacks contained with every detector switched off" },
  { n: "4 of 4", label: "legitimate calls still allowed in that same run" },
  { n: "42 of 42", label: "AgentDojo attacker calls that act, contained" },
  { n: "62 of 65", label: "attacker calls contained overall, three read-only escapes" },
  { n: "66.7%", label: "held-out prompt-injection recall, our weakest layer", tone: "weak" },
];

export function Evidence() {
  return (
    <section id="evidence" className="mk-band">
      <div className="mk-section mk-wrap">
        <SectionHead
          eyebrow="Evidence"
          title="Measured with every detector switched off."
          lede="Switching the detectors off is a total bypass rather than a weakened threshold or a simulated miss. What is left is capability grants, argument provenance and declared impact tiers, which is the whole design."
          center
        />
        <div className="mk-grid mk-grid-5 mk-up mk-d2" style={{ marginTop: 40 }}>
          {STATS.map((s) => (
            <div key={s.n} className="mk-card mk-stat">
              <b style={{ color: s.tone === "weak" ? "var(--mk-muted)" : "var(--mk-text)" }}>
                {s.n}
              </b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <p
          className="mk-fine mk-up mk-d3"
          style={{ maxWidth: "70ch", margin: "24px auto 0", textAlign: "center" }}
        >
          The three calls that escaped the AgentDojo replay are all read-only, and they are
          named one by one on the benchmark page. The detection figure stays on this page on
          purpose: it is the number that makes the product look worse, and publishing it is
          the reason the rest is worth believing.
        </p>
        <div
          className="mk-row mk-up mk-d4"
          style={{ justifyContent: "center", marginTop: 22, gap: 10 }}
        >
          <Link href="/benchmark" className="mk-btn mk-btn-outline">
            The numbers, and where a competitor beats us
          </Link>
        </div>
      </div>
    </section>
  );
}

/* --- 3. How it works ---------------------------------------------------- */

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Point it at a repository or a live API",
    body: "It proposes what it found: what in your code talks to a model, what is ungoverned, and which tools exist. You register each agent, give it an owner, and correct anything the scan got wrong.",
  },
  {
    title: "Put one line in your entry point, or call it over HTTP",
    body: (
      <>
        <code className="mk-mono">import nometria; nometria.auto()</code> wraps the OpenAI,
        Anthropic, LiteLLM and LangChain clients already running in that process. From any
        other language, post a single tool call to{" "}
        <code className="mk-mono">/v1/guard/tool_call</code>, or point an existing client&rsquo;s
        base URL at the gateway and change nothing else.
      </>
    ),
  },
  {
    title: "Watch in observe mode, where nothing is blocked",
    body: "The policy that governs model traffic starts in observe: it records what it would have done and lets the call through. You read what gets flagged against your own traffic and tune the detectors per policy before anything is refused.",
  },
  {
    title: "Turn enforcement on when the findings look right",
    body: (
      <>
        <code className="mk-mono">nometria policy enforce baseline</code> is the one step that
        starts blocking model traffic, and the one-liner picks it up with no code change.{" "}
        <code className="mk-mono">nometria policy observe baseline</code> puts it back.
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mk-section">
      <div className="mk-wrap mk-split mk-split-wide">
        <div className="mk-up">
          <span className="mk-eyebrow">Getting there</span>
          <h2 className="mk-h2" style={{ marginTop: 14 }}>
            From nothing to governed, in the order you would actually do it.
          </h2>
          <p className="mk-body" style={{ marginTop: 14, maxWidth: "48ch" }}>
            Nothing in the first three steps refuses a call. The point of starting in observe
            is that a library which begins rejecting production traffic because someone added
            an import gets switched off within a day.
          </p>
          <div
            className="mk-card"
            style={{ marginTop: 22, background: "var(--mk-surface-2)", maxWidth: "48ch" }}
          >
            <span className="mk-label">One exception, from day one</span>
            <p className="mk-body" style={{ margin: "8px 0 0", fontSize: ".94rem" }}>
              Tool containment enforces from the moment you install. In one situation only: the
              agent is about to call a tool that can do real damage, such as moving money,
              deleting something or sending an email, and a value it wants to pass to that tool
              did not come from the person using the agent. It came from a web page, a retrieved
              document or another tool&rsquo;s output. Those calls are refused, or sent to a
              human to decide.
            </p>
          </div>
        </div>
        <ol className="mk-steps mk-up mk-d2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {STEPS.map((s, i) => (
            <li key={s.title} className="mk-step">
              <span className="mk-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="mk-h3">{s.title}</h3>
                <p className="mk-body" style={{ margin: "6px 0 0", fontSize: ".94rem" }}>
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --- 4. Honesty --------------------------------------------------------- */

const LIMITS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Detection is a speed bump, and we measure it against ourselves",
    body: (
      <>
        An adaptive attacker that reads our verdict and tries again gets 73% of the attacks we
        do catch through within 50 attempts, using only mutations a model can still read. Our
        held-out injection recall is 66.7%, published rather than rounded up.
      </>
    ),
  },
  {
    title: "On detection, a competitor beats us",
    body: (
      <>
        On indirect injection through tool output, a real installed{" "}
        <code className="mk-mono">llm-guard</code> is more precise than we are on the same 20
        cases: 81.8% against our 66.7%. That is the axis a text scanner competes on, and it is
        why the containment numbers are the ones we lead with.
      </>
    ),
  },
  {
    title: "Containment is only as good as the declarations behind it",
    body: (
      <>
        Grants, impact tiers, ceilings and downstream triggers are declared by whoever operates
        the agent, and every check above believes them. A tool recorded as read-only that is
        not read-only is not covered by any of this.
      </>
    ),
  },
  {
    title: "It is MVP v0.3",
    body: (
      <>
        No single sign-on, so there is no live identity-provider integration yet. Multi-tenancy
        is enforced at the session for one organisation, and text is the only modality: no
        images, no audio, no video.
      </>
    ),
  },
];

export function Honesty() {
  return (
    <section id="limits" className="mk-section mk-band">
      <div className="mk-wrap">
        <SectionHead
          eyebrow="What it does not do"
          title="The limits, in our own words, before you find them yourself."
          lede="We do not claim adversarial robustness and we do not believe anyone can claim it honestly today. Here is everything that follows from that."
          center
        />
        <div className="mk-grid mk-grid-4" style={{ marginTop: 40 }}>
          {LIMITS.map((l, i) => (
            <div key={l.title} className={`mk-card mk-up mk-d${Math.min(i + 1, 5)}`}>
              <h3 className="mk-h3">{l.title}</h3>
              <p className="mk-body" style={{ margin: "8px 0 0", fontSize: ".94rem" }}>
                {l.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- 5. FAQ ------------------------------------------------------------- */

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does it cost, and under what licence?",
    a: (
      <>
        Apache-2.0, with the full text in <Out href={LICENSE}>LICENSE</Out>. It is free and
        there is nothing to buy: all of the source is in the repository, there is no licence
        key, and nothing is gated behind a paid tier.
      </>
    ),
  },
  {
    q: "Does my traffic or my source leave the machine?",
    a: (
      <>
        Scanning a repository is static. It walks your source with a parser, never imports it,
        never executes it and makes no network call, and onboarding a hosted API reads only
        that API&rsquo;s OpenAPI document without calling any operation on it. A local install
        downloads no model weights and needs no API key, and Nometria adds no destination of
        its own: if you configure a real model provider, the model call goes to that provider
        exactly as it did before.
      </>
    ),
  },
  {
    q: "Where does this sit relative to a gateway or a web application firewall?",
    a: (
      <>
        A web application firewall reads HTTP traffic at the edge and looks for attacks inside
        requests. An API gateway routes, authenticates and rate-limits those requests. Neither
        knows which agent made a call, what that agent was granted, or where the value in an
        argument came from, so Nometria works one layer in, on the agent&rsquo;s own actions,
        and replaces neither.
      </>
    ),
  },
  {
    q: "What does it cost in latency?",
    a: (
      <>
        There is no published latency or throughput benchmark, and no hardware is recorded in
        any of the results files, so we are not going to quote you a number. What is written
        down is the shape: detectors run under a shipped 40ms per-detector timeout and a
        detector that times out is scored as raising nothing, while the tool-call check reads
        no text and consults no model at all.
      </>
    ),
  },
  {
    q: "What happens if the control plane is slow or down?",
    a: (
      <>
        You declare per service whether it fails open or fails closed, and the shipped default
        is open. Fail open still serves the request but writes a degradation record, stamps the
        response with a header naming the control that was down, and converts to closed once
        the degradation outlasts its budget. Four controls can never be set to fail open at
        all: tenant isolation, entitlement filtering, data access scope and the audit chain.
      </>
    ),
  },
  {
    q: "What happens on escalate?",
    a: (
      <>
        The tool is not called. The caller gets an approval id back instead of a result, the
        request lands on the Approvals screen for whoever holds the approver role, and it can
        also be decided from the command line or polled over the API. Every request carries a
        clock and the default action when it runs out is deny, so an approval nobody answers
        ends in a refusal.
      </>
    ),
  },
  {
    q: "Does it work outside Python?",
    a: (
      <>
        Yes, two ways, neither of which puts Nometria code in your application. Post a single
        tool call to <code className="mk-mono">/v1/guard/tool_call</code> and read the verdict
        back, or point an existing OpenAI or Anthropic client&rsquo;s base URL at the gateway,
        which speaks the API your code already calls.
      </>
    ),
  },
  {
    q: "How do I try it without installing anything?",
    a: (
      <>
        Open the <Link href="/playground">playground</Link>. There is no account and nothing to
        install, every visitor gets a throwaway sandbox running the same enforcement code the
        product runs in production, and the audit chain on the page reports its own
        verification state as you go. If you would rather point something at your own code
        without a permanent install, <code className="mk-mono">quickscan.sh</code> installs
        into a virtualenv it removes on exit.
      </>
    ),
  },
];

export function FAQ() {
  return (
    <section id="faq" className="mk-section">
      <div className="mk-wrap">
        <SectionHead
          eyebrow="Before you install anything"
          title="The questions developers actually ask."
          center
        />
        <div className="mk-narrow mk-up mk-d2" style={{ marginTop: 36 }}>
          {QUESTIONS.map((item) => (
            <div key={item.q} className="mk-faq">
              <h3 className="mk-h3">{item.q}</h3>
              <p className="mk-body" style={{ margin: "8px 0 0", fontSize: ".94rem" }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- 6. CTA ------------------------------------------------------------- */

export function CTA() {
  return (
    <section className="mk-section">
      <div className="mk-wrap">
        <div
          className="mk-card mk-card-raised mk-up"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            borderRadius: "var(--mk-r-xl)",
            background:
              "radial-gradient(70% 130% at 50% 0%, color-mix(in srgb, var(--mk-accent) 14%, var(--mk-surface)) 0%, var(--mk-surface) 72%)",
          }}
        >
          <div className="mk-narrow">
            <h2 className="mk-h2">Try to break it before you trust it.</h2>
            <p className="mk-lede" style={{ marginTop: 14 }}>
              The playground needs no account and no install, and it runs the same enforcement
              code as the product. If you would rather run it yourself, the demo is two commands
              and finishes offline in about six seconds.
            </p>
            <div className="mk-row" style={{ justifyContent: "center", marginTop: 24, gap: 10 }}>
              <Link href="/playground" className="mk-btn mk-btn-primary">
                Open the playground
              </Link>
              <Out href={REPO} className="mk-btn mk-btn-outline">
                Read the source
              </Out>
            </div>
            <pre
              className="mk-mono"
              style={{
                marginTop: 26,
                padding: "14px 16px",
                textAlign: "left",
                overflowX: "auto",
                background: "var(--mk-surface-2)",
                border: "1px solid var(--mk-border)",
                borderRadius: "var(--mk-r-md)",
                color: "var(--mk-muted)",
                lineHeight: 1.7,
              }}
            >
              {`pip install git+https://github.com/architsharm/guardrails.git\nnometria init && nometria demo`}
            </pre>
            <p className="mk-fine" style={{ marginTop: 12 }}>
              <code className="mk-mono">init</code> creates a SQLite database and loads 43
              controls and three policy packs. <code className="mk-mono">demo</code> runs a
              thirteen-step walkthrough. Both are offline: no API key, no downloaded weights, no
              network egress.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --- 7. Footer ---------------------------------------------------------- */

const FOOT_INTERNAL: [string, string][] = [
  ["How it works", "/how-it-works"],
  ["Playground", "/playground"],
  ["Benchmarks", "/benchmark"],
];

const FOOT_EXTERNAL: [string, string][] = [
  ["Source", REPO],
  ["Licence: Apache-2.0", LICENSE],
  ["Report a vulnerability", SECURITY],
];

export function Footer() {
  return (
    <footer className="mk-footer">
      <div
        className="mk-wrap"
        style={{ display: "flex", flexWrap: "wrap", gap: 28, justifyContent: "space-between" }}
      >
        <div style={{ maxWidth: "34ch" }}>
          <span className="mk-brand-name">Nometria</span>
          <p className="mk-fine" style={{ margin: "8px 0 0" }}>
            An open-source control plane for AI agents. Maintained in the open by one
            developer.
          </p>
          <p className="mk-label" style={{ marginTop: 12 }}>
            MVP v0.3
          </p>
        </div>
        <nav
          aria-label="Footer"
          style={{ display: "flex", flexWrap: "wrap", gap: 40, fontSize: ".9rem" }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <span className="mk-label">Product</span>
            {FOOT_INTERNAL.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <span className="mk-label">Project</span>
            {FOOT_EXTERNAL.map(([label, href]) => (
              <Out key={href} href={href}>
                {label}
              </Out>
            ))}
          </div>
        </nav>
      </div>
      <div className="mk-wrap">
        <p className="mk-fine" style={{ margin: "28px 0 0" }}>
          Apache-2.0. Security reports go through GitHub&rsquo;s private advisories rather than
          a public issue; the route is in SECURITY.md.
        </p>
      </div>
    </footer>
  );
}
