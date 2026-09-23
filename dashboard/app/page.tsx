import Link from "next/link";
import { cookies } from "next/headers";
import { api, apiErrorProps, SESSION_COOKIE } from "@/lib/api";
import { ApiDown, Severity, Stat, StatLink, findingTypeInfo, ts } from "@/components/ui";
import { PublicHeader, PublicFooter, CATEGORY, REPO } from "./how-it-works/_public";

export const dynamic = "force-dynamic";

/**
 * layout.tsx titles every page "Nometria Control Plane", which was a fourth name for
 * the product in the first viewport alongside the strapline, the landing body line
 * and the API root's own description. A page-level export overrides the layout's
 * static title for this route only, so "/" now carries the same category name the
 * body uses. layout.tsx is owned by a concurrent change and is not touched.
 */
export const metadata = {
  title: `Nometria: ${CATEGORY}`,
  description:
    "Nometria checks every tool call an agent makes against what that agent was granted, and refuses the ones outside it, even after a prompt injection has convinced the model.",
};

/**
 * Nobody opens a governance dashboard to ask "what do we have" — they open it to ask
 * "is anything wrong right now". A screen that leads with an inventory makes the
 * reader do the ranking themselves, so this one leads with what needs a human and
 * puts the inventory underneath.
 */
async function Overview() {
  let attention: any, onboarding: any, agents: any, posture: any;
  try {
    [attention, onboarding, agents, posture] = await Promise.all([
      api("/api/attention"),
      api("/api/onboarding"),
      api("/api/agents"),
      api("/api/compliance/status"),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Overview</h1>
        <ApiDown {...apiErrorProps(e)} />
      </>
    );
  }

  // Not connected and quiet are the same picture and opposite meanings. Saying which
  // one this is, is the single most useful thing this page does on day one.
  if (!onboarding.connected) {
    return (
      <>
        <h1>Overview</h1>
        <div className="hero empty">
          <div className="hero-title">Nothing is sending traffic yet</div>
          <p>
            That is not the same as nothing being wrong. Add one line to your entry point
            and this page fills in from real requests:
          </p>
          <code className="hero-code">import nometria; nometria.auto()</code>
          <p className="small muted">
            Governs every model call in the process — traced, evaluated, audited, and
            blocking nothing until you say so.
          </p>
          <Link href="/start" className="cta">
            Start here →
          </Link>
        </div>
      </>
    );
  }

  const counts = attention.counts || {};
  const inv = agents.inventory;

  return (
    <>
      <h1>Overview</h1>
      <p className="sub">What needs a person, most severe first.</p>

      {attention.quiet ? (
        <div className="hero ok">
          <div className="hero-title">Nothing needs attention</div>
          <p className="small muted">
            {onboarding.counts.traces} trace(s) governed,{" "}
            {onboarding.counts.enforcing > 0
              ? `${onboarding.counts.enforcing} decision(s) enforced`
              : "all decisions in observe mode — recorded, nothing blocked"}
            .
          </p>
        </div>
      ) : (
        <>
          <div className="cards">
            <Stat
              n={counts.critical || 0}
              label="critical problems"
              tone={counts.critical ? "bad" : "ok"}
              hint="Issues serious enough that someone should look today — a customer-facing failure, a data exposure, something a regulator would ask about."
            />
            <Stat
              n={counts.high || 0}
              label="high-priority problems"
              tone={counts.high ? "warn" : "ok"}
              hint="Worth fixing this week — not an emergency, but not fine to ignore either."
            />
            <Stat
              n={counts.blocked_in_window || 0}
              label={`stopped automatically, last ${attention.window_hours}h`}
              hint="Requests a guardrail actually refused before they reached the customer — this is the system working, not a problem to fix."
            />
            <Stat
              n={counts.observed_in_window || 0}
              label={`flagged but allowed, last ${attention.window_hours}h`}
              hint="Requests a guardrail noticed and logged but didn't stop — the policy for this kind of issue is still in 'watch, don't block' mode."
            />
          </div>

          <h2>Needs attention</h2>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>what</th>
                  <th>subject</th>
                  <th>when</th>
                </tr>
              </thead>
              <tbody>
                {attention.items.slice(0, 6).map((item: any, i: number) => {
                  const typeInfo = findingTypeInfo(item.type);
                  return (
                    <tr key={i}>
                      <td>
                        <Severity value={item.severity} />
                      </td>
                      <td>
                        <Link href={item.href}>{item.title}</Link>
                        <div className="small muted">{typeInfo.blurb || typeInfo.label}</div>
                      </td>
                      <td className="mono small">{item.subject}</td>
                      <td className="small muted">{ts(item.at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {attention.total > 6 && (
              <div className="body small muted">
                {attention.total - 6} more — <Link href="/findings">see all findings</Link>
              </div>
            )}
          </div>
        </>
      )}

      <h2>Inventory</h2>
      <div className="cards">
        <StatLink n={inv.agents} label="agents under management" href="/agents" />
        <StatLink n={inv.shadow} label="unregistered" tone={inv.shadow ? "bad" : "ok"} href="/agents" hint="Sending traffic but never registered, so nobody is accountable for them. Shown as an 'Unregistered agent' finding too." />
        <StatLink n={inv.unowned} label="without an owner" tone={inv.unowned ? "warn" : "ok"} href="/agents" />
        <StatLink
          n={onboarding.counts.boundaries}
          label="knowledge boundaries"
          tone={onboarding.counts.boundaries ? "ok" : "warn"}
          href="/start"
        />
        <StatLink
          n={`${Math.round((posture.effectiveness || 0) * 100)}%`}
          label="control effectiveness"
          href="/compliance"
          hint="Of assessed controls only (effective ÷ effective+degraded+failing) — click through for the full breakdown, including not-yet-implemented controls."
        />
      </div>

      {onboarding.next && (
        <div className="note-panel">
          <strong>Next: {onboarding.next.title}.</strong> {onboarding.next.detail}{" "}
          <Link href="/start">Start here →</Link>
        </div>
      )}

      {/* Containment is the thing this product is actually for, and until now it
          appeared once, in body text, on Start here. Three sentences on the page
          everyone lands on, with the dependency stated rather than skipped. */}
      <div className="note-panel">
        <strong>What holds when a guardrail is fooled.</strong> The numbers above
        count text that a detector caught. The control underneath them does not read
        text at all: it checks the action — which tool, what arguments, where those
        arguments came from, and how much damage the tool can do — so an irreversible
        call built out of untrusted content is refused or sent for approval even when
        nothing flagged the prompt. It depends entirely on tools being declared
        honestly; a tool recorded as read-only that isn't, is not covered.{" "}
        <Link href="/policies">See it on Policies →</Link>
      </div>
    </>
  );
}

/* --- Public landing page --------------------------------------------------
 *
 * "/" is the URL a launch audience arrives at, and until now middleware bounced
 * a signed-out visitor from it straight to /login: a sign-in wall in front of a
 * product with nothing anywhere saying what it is. The two things that need no
 * account (the playground and the benchmark evidence) existed but were only
 * reachable by someone who already knew the paths.
 *
 * Every figure below is copied from README.md or app/benchmark/page.tsx, both of
 * which name the results file each number comes from. Nothing here is restated
 * from memory, and anything that would need a new number links to /benchmark
 * instead of repeating one.
 *
 * Composed from classes already in globals.css (.pg-shell, .panel, .btn-*,
 * .hero-code, .note-panel) plus inline styles, because that file is owned by a
 * concurrent change. Every color is a token, so both themes follow for free.
 */

function Sec({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} style={{ marginTop: 46 }}>
      <h2
        style={{
          fontSize: "clamp(18px, 3.4vw, 21px)",
          margin: "0 0 12px",
          letterSpacing: "-0.015em",
          fontWeight: 650,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 14,
        lineHeight: 1.62,
        color: "var(--text-2)",
        maxWidth: "70ch",
        margin: "0 0 12px",
      }}
    >
      {children}
    </p>
  );
}

/**
 * One question a buyer actually asked, and its answer. Each of these was a gap a
 * cold reader hit on the live site, and every fact inside one is checked against a
 * named file in the repository rather than asserted here.
 */
function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="panel body" style={{ marginBottom: 12 }}>
      <strong style={{ display: "block", fontSize: 13.5, marginBottom: 7 }}>{q}</strong>
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

const QUL = {
  margin: "8px 0 0",
  paddingLeft: 18,
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--muted)",
};

/** Pill links: height:auto so a two-line label on a 375px screen wraps instead
 *  of overflowing the row, and textDecoration inline so the global a:hover
 *  underline does not fire on something shaped like a button. */
const PILL = {
  height: "auto",
  minHeight: 32,
  padding: "7px 16px",
  whiteSpace: "normal" as const,
  textAlign: "center" as const,
  textDecoration: "none",
};

/**
 * A real refusal, not a mockup.
 *
 * This is the response the hosted playground returns today for a support agent asking
 * to move money: the call is refused because the agent holds no grant for that tool,
 * with no model consulted and no detector reading any text. Reproduce it yourself
 * against the public sandbox, which is why the page says so underneath.
 */
function Proof() {
  return (
    <div className="lp-proof">
      {/* The grant, shown before the refusal.
       *
       * This box used to open with a blocked call and the machine code
       * `capability.denied`, and asked the reader to take the refusal on trust. The
       * list below is the whole explanation, and having it here retires the need to
       * define "capability grant", "containment", "ceiling" or "impact tier" before
       * the reader understands the product.
       *
       * Verified against src/nometria/seed.py: CAPABILITIES["support-triage"] holds
       * exactly kb.search, crm.lookup and tickets.*, and payments.transfer is granted
       * to a different seed agent, payments-ops. If that seed changes, change this. */}
      <div className="lp-proof-row">
        <span className="lp-proof-label">What this agent is allowed to call</span>
        <code>
          support-triage &rarr;{" "}
          <span style={{ color: "var(--ok)" }}>kb.search, crm.lookup, tickets.*</span>
        </code>
        <p style={{ marginTop: 8 }}>
          Three entries, and <code>payments.transfer</code> is not one of them.{" "}
          <code>tickets.*</code> means every tool whose name starts with{" "}
          <code>tickets.</code>, so this agent can open and update tickets but cannot
          move money, because nobody ever granted it that.
        </p>
        <small>
          support-triage is a demo agent that ships in this repository&rsquo;s seed data,
          not an agent from a real incident. Its grants are in{" "}
          <a href={`${REPO}/blob/main/src/nometria/seed.py`} target="_blank" rel="noreferrer">
            src/nometria/seed.py
          </a>
          , and you can read them before you believe anything below.
        </small>
      </div>
      <div className="lp-proof-row">
        <span className="lp-proof-label">The call an injection asks for</span>
        <code>
          support-triage &rarr; payments.transfer{" "}
          <span className="lp-args">
            {`{ "amount": 5000, "currency": "USD", "to": "acct_attacker_991" }`}
          </span>
        </code>
      </div>
      <div className="lp-proof-row">
        <span className="lp-proof-label">What came back</span>
        <div className="lp-proof-verdict">
          <span className="tag bad">block</span>
          <code>capability.denied</code>
        </div>
        <p>No capability grants this agent the requested tool and action (default deny).</p>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          In plain words: <code>payments.transfer</code> is not in the list of three
          above, so the call never runs. Anything not on an agent&rsquo;s list is refused
          by default, which is what <code>capability.denied</code> means.
        </p>
        <small>
          59ms. No model was asked, and no detector read any text. The refusal comes from
          what the agent was granted, so it holds whether or not anything recognised the
          attack. Run it yourself in the playground, or against the public API.
        </small>
      </div>
    </div>
  );
}

/**
 * Four published counts, including the one that makes the product look worse. The
 * detection figure is here on purpose: a page that only shows its wins is the thing a
 * sceptical reader discounts entirely.
 */
function Stats() {
  const stats: [string, string][] = [
    ["8 of 8", "attacks contained with every detector switched off"],
    ["4 of 4", "legitimate calls still allowed in that same run"],
    ["42 of 42", "attacker calls that act, contained in an AgentDojo replay of 617 calls"],
    ["66.7%", "held-out injection recall, published rather than rounded up"],
  ];
  return (
    <>
      <div className="lp-stats">
        {stats.map(([n, label]) => (
          <div className="lp-stat" key={label}>
            <b>{n}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--faint)", margin: "10px 0 0" }}>
        Every figure comes from a result file in the repository, with the method and the
        limits on <Link href="/benchmark">the benchmark page</Link>.
      </p>
    </>
  );
}

function Landing() {
  return (
    <div className="pg-shell">
      <PublicHeader />

      <section>
        {/* The old headline was "Your agent cannot take an action it was never
            entitled to take, even when the model has been fooled": three negations in
            seventeen words, a subject that is the reader's agent rather than this
            product, and no mention of the tool call, which is the actual unit of
            protection and the thing the box below shows. This one names the product,
            the unit and the mechanism in that order. */}
        <h1
          style={{
            fontSize: "clamp(24px, 4.6vw, 33px)",
            lineHeight: 1.2,
            letterSpacing: "-0.022em",
            margin: 0,
            maxWidth: "30ch",
          }}
        >
          Nometria checks every tool call your agent makes against what that agent was
          granted, and refuses the ones outside it, even after a prompt injection has
          convinced the model.
        </h1>
        <p
          style={{
            fontSize: 15.5,
            lineHeight: 1.6,
            color: "var(--text-2)",
            maxWidth: "64ch",
            margin: "16px 0 0",
          }}
        >
          Nometria is a {CATEGORY}. It keeps a register of every agent you run, records
          what each one is allowed to do, checks the action before a tool runs, and
          writes every decision to a record you can verify. It works across OpenAI,
          Anthropic, LiteLLM and LangChain, and it is not tied to one model vendor or
          cloud.
        </p>
        {/* The dependency used to sit eight hundred words below the headline, which
            left a hostile reader free to quote the headline as an absolute guarantee
            against a caveat they had not reached yet. It belongs next to the claim. */}
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--muted)",
            maxWidth: "64ch",
            margin: "12px 0 0",
          }}
        >
          That sentence rests on one thing, so it is here rather than further down: you
          tell Nometria what each tool does, and it believes you. A tool recorded as
          read-only that is not read-only is not covered by any of this.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
          <Link href="/playground" className="btn-primary" style={PILL}>
            Try it, no account
          </Link>
          <Link href="/benchmark" className="btn-scan" style={PILL}>
            The numbers, and where a competitor beats us
          </Link>
          <Link href="/how-it-works" className="btn-scan" style={PILL}>
            How it works
          </Link>
        </div>

        <Proof />
        <Stats />
      </section>

      <Sec title="What this is">
        <P>
          Teams are shipping agents that read email, query databases, call internal
          APIs and move money. Two questions get hard fast: what did the agent
          actually do, and what was it ever allowed to do in the first place.
        </P>
        <P>
          Nometria answers both. One line in your entry point routes every model call
          and every tool call through it. Each call is traced, checked against a
          policy you control, and written to a tamper-evident audit record. Nothing is
          blocked until you say so, because the policy that governs model traffic
          starts in observe mode: the first thing you get is a picture of what your
          agents are doing, not a refusal.
        </P>
        {/* The old version of this was "One exception, stated up front. The
            tool-containment pack enforces from the first day, for tool calls whose
            arguments came from untrusted content." Three terms a first-time reader has
            no definition for (the pack, enforcing, untrusted content) in two sentences,
            and the auditors both marked it as the first place they gave up. */}
        <P>
          There is one exception, and it is switched on from the first day. A small set
          of rules called the tool-containment pack does refuse calls, in one situation
          only: the agent is about to call a tool that can do real damage, such as
          moving money, deleting something or sending an email, and a value it wants to
          pass to that tool did not come from the person using the agent. It came from
          content nobody vouches for, such as a web page, a document that was retrieved
          to answer the question, or the output of another tool. Those calls are refused
          or sent to a human to decide. Everything else is recorded and allowed until
          you change it.
        </P>
      </Sec>

      <Sec title="The problem it solves">
        <P>
          Most products in this space are detectors. They read the text going into a
          model and try to decide whether it is an attack. That works on the attack
          you have already seen. It does not survive an attacker who can try again.
        </P>
        <P>
          <em>The Attacker Moves Second</em> (Nasr, Carlini, Schulhoff et al., 2025,
          arXiv:2510.09023) reports over 90% attack success against twelve published
          defences once the attacker is allowed to adapt. Our detectors are not an
          exception, and we measure it against ourselves: an adaptive attacker that
          reads our verdict and tries again gets 73% of the attacks we catch through
          within 50 attempts. Our held-out injection recall is 66.7%, published rather
          than rounded up.
        </P>
        <P>
          So detection is not the differentiator, and we do not sell it as one. It
          raises the cost of an attack. It is not the thing that stops one.
        </P>
      </Sec>

      <Sec title="What holds when the model has already been fooled">
        <P>
          Assume the injection worked and the agent is now trying to do what the
          attacker asked. Three checks stand between it and the action, and none of
          them reads the text.
        </P>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <div className="panel body">
            <strong style={{ display: "block", marginBottom: 6, fontSize: 13.5 }}>
              The agent holds no grant for that tool
            </strong>
            <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
              An agent can call the tools it was granted, with argument values inside
              the ceilings that were declared, and nothing else. A call outside the
              grant is refused whatever convinced the model to make it.
            </span>
          </div>
          <div className="panel body">
            <strong style={{ display: "block", marginBottom: 6, fontSize: 13.5 }}>
              The argument came from untrusted content
            </strong>
            <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
              Every message is tagged with where it came from: the user, a retrieved
              document, a tool result, a subagent, memory. An argument that traces back
              to untrusted content cannot be handed to a tool that can do damage. That
              call is refused or sent to a person.
            </span>
          </div>
          <div className="panel body">
            <strong style={{ display: "block", marginBottom: 6, fontSize: 13.5 }}>
              The tool is declared irreversible
            </strong>
            <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
              Tools carry a declared impact, so a transfer, a delete or an outbound
              email is not treated like a lookup. Generated SQL is checked for whether
              it is actually bounded before it runs.
            </span>
          </div>
        </div>
        <div className="note-panel">
          <strong>Measured with every detector switched off.</strong> That is a total
          bypass rather than a weakened threshold or a simulated miss. Under it, 8 of 8
          attacks were still contained and 4 of 4 legitimate calls still went through.
          Replaying AgentDojo end to end over 617 ground-truth calls: 42 of 42 attacker
          calls that act were contained, and 552 of 552 legitimate calls were allowed,
          identical with detectors disabled. The denominator that figure comes out of is
          65 attacker calls, of which 62 were contained. The three that got through are
          all read-only, which is the weaker half of that result and is named call by
          call on the benchmark page.{" "}
          <Link href="/benchmark">The method and the limits of each →</Link>
        </div>
        <div className="note-panel">
          <strong>What this rests on.</strong> Containment is exactly as good as the
          declarations behind it. Grants, impact tiers, ceilings and downstream
          triggers are declared by whoever operates the agent. A tool recorded as
          read-only that is not read-only is not covered by any of this, and an
          undeclared trigger is invisible by design.
        </div>
      </Sec>

      <Sec title="What you can try right now, without an account">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
            gap: 12,
          }}
        >
          <div className="panel body">
            <strong style={{ display: "block", marginBottom: 6, fontSize: 13.5 }}>
              The playground: try to break it
            </strong>
            <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
              Every visitor gets a throwaway sandbox running the same enforcement code
              the product runs in production. Send an injection and watch the baseline
              policy flag it while the call still goes through, because the sandbox
              starts in observe mode. Flip that same sandbox to enforce and watch the
              identical call blocked. The audit chain on the page records every
              decision and reports its own verification state as you go.
            </span>
            <div style={{ marginTop: 12 }}>
              <Link href="/playground" className="cta" style={{ marginTop: 0 }}>
                Open the playground →
              </Link>
            </div>
          </div>
          <div className="panel body">
            <strong style={{ display: "block", marginBottom: 6, fontSize: 13.5 }}>
              The benchmarks, including the ones we lose
            </strong>
            <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
              Three benchmarks from this repository. Two of them make the product look
              good and one does not. On detection, the axis a text scanner competes on,
              a real installed llm-guard is more precise than we are on the same 20
              cases: 81.8% against 66.7%. Every figure is copied from a results file
              checked into the repo, and the command that reproduces it is listed
              beside it.
            </span>
            <div style={{ marginTop: 12 }}>
              <Link href="/benchmark" className="cta" style={{ marginTop: 0 }}>
                Read the numbers →
              </Link>
            </div>
          </div>
        </div>
      </Sec>

      {/* Six questions two cold readers asked in this order and the site answered
          nowhere. The reassuring answers mostly existed already and were buried in
          README.md, docs/ and module docstrings; each block names where it came
          from so the claim can be checked rather than believed. */}
      <Sec title="Questions people ask before they install anything" id="questions">
        <Q q="What am I deploying, and does my traffic leave my network?">
          There are three shapes and you pick one.
          <ul style={QUL}>
            <li>
              <strong style={{ color: "var(--text)" }}>One line in a Python entry
              point.</strong>{" "}
              <code>import nometria; nometria.auto()</code> wraps the OpenAI,
              Anthropic, LiteLLM and LangChain clients already running in that
              process. Nothing else in your code changes.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>An HTTP call from any
              language.</strong>{" "}
              Run the control plane and ask it about one tool call by posting to{" "}
              <code>/v1/guard/tool_call</code>. Your application does not have to be
              Python, or contain any Nometria code at all.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>The gateway in front of your
              traffic.</strong>{" "}
              Point an existing OpenAI or Anthropic client&rsquo;s base URL at the
              gateway. It speaks the API your code already calls, so your calls flow
              through it without being rewritten.
            </li>
          </ul>
          <p style={{ margin: "10px 0 0" }}>
            All three are software you run. On the three things people ask about
            specifically:
          </p>
          <ul style={QUL}>
            <li>
              Scanning a repository for agents is <strong>static</strong>. It walks
              your source with a parser and never imports it, never executes it, and
              makes no network call. That is deliberate rather than incidental: a
              scanner that imports the codebase it is pointed at runs arbitrary code
              from a repository the operator may not trust.
            </li>
            <li>
              Onboarding a hosted API reads <strong>only that API&rsquo;s OpenAPI
              document</strong>. No operation on the live API is ever called.
            </li>
            <li>
              A local install is <strong>offline-capable</strong>. The default install
              downloads no model weights and needs no API key, and the demo and the
              quickstart run with no network egress at all. Nometria adds no
              destination of its own: if you configure a real model provider, the
              model call goes to that provider exactly as it did before.
            </li>
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--faint)" }}>
            The two scanner guarantees are the stated contract of{" "}
            <code>discovery.py</code> and <code>discovery_openapi.py</code>; the
            offline claim is the packaging rule in <code>pyproject.toml</code>.
          </p>
        </Q>

        <Q q="What does it cost, and under what licence?">
          Apache-2.0, with the full text in{" "}
          <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            LICENSE
          </a>
          . It is free, and there is nothing to buy: all of the source is in{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            the repository
          </a>
          , there is no licence key, and nothing here is gated behind a paid tier.
          Third-party notices for everything it wraps are in{" "}
          <code>THIRD_PARTY_NOTICES.md</code>.
        </Q>

        <Q q="What does it sit next to? It is not a web application firewall and not an API gateway.">
          A web application firewall reads HTTP traffic at the edge and looks for
          attacks inside requests. An API gateway routes, authenticates and rate-limits
          those requests. Neither one knows which agent made a call, what that agent
          was granted, or where the value in an argument came from. Nometria works one
          layer in, on the agent&rsquo;s own actions, and it does not replace either.
          <p style={{ margin: "10px 0 0" }}>
            It also does not replace the open-source pieces it uses. Policy evaluation
            runs on <strong>OPA and Rego</strong>, PII detection on{" "}
            <strong>Presidio</strong>, SQL parsing on <strong>sqlglot</strong> and
            tracing on <strong>OpenTelemetry</strong>, each behind an adapter you can
            swap out. What is built here is the layer above them: tracking where a tool
            argument came from, working out the blast radius of a generated SQL
            statement, carrying the end user&rsquo;s own entitlements through retrieval
            and tool calls, and the tamper-evident audit chain with its independent
            verifier.
          </p>
        </Q>

        <Q q="What are the maturity limits?">
          This is MVP v0.3, and the limits are specific.
          <ul style={QUL}>
            <li>
              <strong style={{ color: "var(--text)" }}>No single sign-on.</strong> There
              is no live identity-provider integration yet.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>One organisation.</strong>{" "}
              Multi-tenancy is enforced at the session for a single organisation. This
              is not a managed multi-region offering.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Text only.</strong> No images,
              audio or video.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Scheduled red-teaming ships
              disabled</strong>, so a deployment has to opt into it.
            </li>
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--faint)" }}>
            Live coverage is computed by probe rather than asserted, and the full
            non-goals list is in the repository.
          </p>
        </Q>

        <Q q="What happens on escalate?">
          Escalate means the call does not run and a person decides.
          <ul style={QUL}>
            <li>
              <strong style={{ color: "var(--text)" }}>The tool is not called.</strong>{" "}
              The caller gets an approval id back instead of a result.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>A named role sees it.</strong> The
              request lands on the Approvals screen for whoever holds the approver role,
              which defaults to security. It can also be decided from the command line,
              or polled over the API.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>The agent waits.</strong> Under
              LangGraph that pause is LangGraph&rsquo;s own <code>interrupt()</code>, so
              there is one pause mechanism in the graph rather than two.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>It expires, and expiry
              denies.</strong> Every request carries a clock, and the default action when
              it runs out is deny. An approval nobody answers ends in a refusal rather
              than going through.
            </li>
          </ul>
        </Q>

        <Q q="What happens if the control plane is slow or down?">
          You declare, per service, whether it fails open or fails closed. The shipped
          default is open. Neither answer is allowed to be silent, because a control
          that fails open quietly looks exactly like a control that is working: the same
          traffic flows and the same dashboards stay green.
          <ul style={QUL}>
            <li>
              <strong style={{ color: "var(--text)" }}>Fail closed</strong> refuses the
              request with a 503 rather than admitting one that nobody checked.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Fail open</strong> serves the
              request, but writes a degradation record for it, stamps the response with
              a header naming the control that was down, and converts to closed once the
              degradation outlasts its declared budget. A control that has been open for
              an hour is an absent control, not a degraded one.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Four controls can never be set to
              fail open at all</strong>: tenant isolation, entitlement filtering, data
              access scope and the audit chain. Their failure mode is a disclosure
              rather than an outage, so the setting is refused when it is constructed
              rather than warned about at runtime.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Your own screens stay up.</strong>{" "}
              The gate covers the traffic path only. An operator diagnosing an outage is
              not locked out of the dashboard by that same outage.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>The honest limit.</strong> The
              fail-open budget and the rate limit are counted per process, so a
              deployment running several workers gets that budget multiplied by the
              number of workers.
            </li>
          </ul>
        </Q>
      </Sec>

      <Sec title="What this is not">
        <ul
          style={{
            fontSize: 14,
            lineHeight: 1.62,
            color: "var(--text-2)",
            maxWidth: "70ch",
            paddingLeft: 20,
            margin: 0,
          }}
        >
          <li style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--text)" }}>Not adversarial robustness.</strong>{" "}
            We do not claim it, and we do not believe anyone can claim it honestly
            today.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--text)" }}>
              Not a detector that catches everything.
            </strong>{" "}
            A third of the held-out injection set still slips past us, and the
            classifier ensemble that raises recall also raises false positives on
            benign text.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--text)" }}>
              Not stronger than the declarations behind it.
            </strong>{" "}
            See the note above. Bad declarations produce confident, useless
            containment.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--text)" }}>
              Not a replacement for your own authorization.
            </strong>{" "}
            It bounds what an agent does with access you already granted. It does not
            grant access, and it does not make an over-permissioned service account
            safe.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--text)" }}>Not finished.</strong> This is MVP
            v0.3, and its live coverage is computed by probe rather than asserted.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Not a large evidence base yet.</strong>{" "}
            The containment benchmark is eight scenarios, each chosen to be
            structurally different from the others rather than to inflate a
            denominator.
          </li>
        </ul>
      </Sec>

      <Sec title="How to start">
        <ol
          style={{
            fontSize: 14,
            lineHeight: 1.62,
            color: "var(--text-2)",
            maxWidth: "70ch",
            paddingLeft: 20,
            margin: 0,
          }}
        >
          <li style={{ marginBottom: 10 }}>
            <Link href="/playground">Open the playground</Link> and try to break it.
            Nothing to install, no sign-up, and the enforcement code is the real one.
          </li>
          <li style={{ marginBottom: 10 }}>
            <Link href="/how-it-works">Read how it works</Link> for the request path
            and the six areas of the product in plain language.
          </li>
          <li style={{ marginBottom: 10 }}>
            <Link href="/login">Sign in with GitHub</Link> to create a workspace. The
            first sign-in creates it, and the same connection is what lets the product
            scan a repository for agents that need governing.
          </li>
          <li>
            Add one line to your entry point and watch your own traffic arrive.
            <code className="hero-code">import nometria; nometria.auto()</code>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Every model call in that process is traced, evaluated against policy and
              written to the audit log. Nothing else in your codebase changes, and no
              model call is blocked until you move a policy to enforce.
            </span>
          </li>
        </ol>
        <div className="note-panel">
          <strong>You do not need the package to start.</strong> The playground needs no
          account and no install. Signing in and pointing this at a repository or a live
          API needs neither. The Python package is for running it yourself, and any
          language can call the same checks over HTTP.
        </div>
      </Sec>

      <PublicFooter />
    </div>
  );
}

/**
 * "/" serves two different people. A signed-out visitor gets the public landing
 * page above; a signed-in user gets exactly the Overview they had before, with no
 * change to it.
 *
 * The cookie is the branch because it is the same signal middleware.ts and
 * layout.tsx use, so all three agree on one definition of "signed in" and the
 * chrome cannot disagree with the body. It is a UX branch, not a security one:
 * the landing page reads nothing and calls nothing, and Overview's own data comes
 * from the gateway, which still authenticates every request it serves.
 */
export default async function Home() {
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  if (!signedIn) return <Landing />;
  return <Overview />;
}
