import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/site";
import Link from "next/link";
import { CATEGORY, REPO } from "./_public";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/sections";
import { DraftCaveat } from "@/components/ui";

/**
 * Public explainer for someone who has never seen this product, reached from the
 * landing page at "/" and from the public header on every signed-out page.
 *
 * Public because it is useless if it is behind the sign-in wall: it exists for the
 * reader who arrived at the root URL from a link and does not yet know what any of
 * this is. See middleware.ts (PUBLIC_PATHS) and layout.tsx (isChromelessPage).
 *
 * The request path below is the sequence in docs/hld.md §6, which is itself
 * verified against enforcement.py's preflight/evaluate/call_provider and the
 * gateway's chat_completions handler. It is compressed into plain language and
 * loses some ordering detail (budget caps, circuit breaker, attribution graph) on
 * purpose; it does not add anything that is not in that sequence. The six areas
 * are the six pillars in README.md. Numbers appear only where README.md or
 * app/benchmark/page.tsx already publishes them, and everything else links to
 * /benchmark rather than restating a figure.
 */

export const metadata: Metadata = publicPageMetadata({
  title: "How it works",
  description:
    "The path one call takes through the control plane, and what each of the six areas of the product is for.",
  path: "/how-it-works",
});

/** The <ol> renders the number; the title must not repeat it. */
function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li style={{ marginBottom: 14 }}>
      <strong style={{ color: "var(--text)" }}>{title}</strong>
      <br />
      {children}
    </li>
  );
}

function Area({
  n,
  title,
  question,
  children,
}: {
  n: number;
  title: string;
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel body" style={{ marginBottom: 12 }}>
      <strong style={{ display: "block", fontSize: 13.5 }}>
        {n}. {title}
      </strong>
      <span style={{ display: "block", fontSize: 12.5, color: "var(--faint)", margin: "3px 0 8px" }}>
        {question}
      </span>
      <span style={{ display: "block", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
        {children}
      </span>
    </div>
  );
}

export default function HowItWorks() {
  return (
    /* The site's own nav and footer, and the hero the other public pages open with.
       This page kept a header of its own from before there was a marketing layer,
       which meant the one page explaining the product was also the one page that did
       not look like the product's site. The article underneath is unchanged. */
    <div className="mk">
      <MarketingNav />
      <main>
        <section className="mk-section-tight">
          <div className="mk-wrap">
            <div style={{ maxWidth: 760 }}>
              <span className="mk-eyebrow">How it works</span>
              <h1
                className="mk-h2"
                style={{ marginTop: 12, fontSize: "clamp(2rem, 4.4vw, 3rem)" }}
              >
                One call, all the way through.
              </h1>
              <p className="mk-lede" style={{ marginTop: 18, maxWidth: "58ch" }}>
                AgentFox is a {CATEGORY}. It sits between your agent and everything it
                can act on.
              </p>
            </div>
          </div>
        </section>

      <div className="mk-wrap">
        <article className="bm-doc">

        <h2>The path one call takes</h2>
        <p>
          Three ways on: a line in your Python entry point that wraps the model clients
          in that process; an HTTP call from any language about a single tool call; or
          the gateway, which speaks the API your agent already calls. The sequence is
          the same for all three, and covers tool calls and retrieval steps as well as
          model calls.
        </p>
        <ol>
          <Step title="A call arrives, and we work out who is behind it">
            Which agent, and which end user it acts for. An agent quarantined by the
            kill switch stops here, and never reaches a model.
          </Step>
          <Step title="Questions it should not answer are stopped before they cost anything">
            A question outside an agent&rsquo;s declared knowledge boundary gets a
            templated refusal, and no model call is made.
          </Step>
          <Step title="Retrieval is filtered for the person asking">
            Documents the end user is not entitled to see never reach the prompt.
          </Step>
          <Step title="Every piece of text is tagged with where it came from">
            The user, a retrieved document, a tool result, a subagent, memory, and
            whether that source is trusted. Step 6 uses the tag, which is why it keeps
            working after step 5 has failed.
          </Step>
          <Step title="Detectors read the text">
            Prompt injection, PII and the rest, each under a time budget, worst verdict
            carried forward. This is the layer we trust least, and we{" "}
            <Link href="/benchmark">publish how well it does</Link>, including where a
            competing scanner is more precise than ours.
          </Step>
          <Step title="The policy decides">
            Your rules resolve down to one verdict: allow, block, or hand off to a
            person. Observe records what it would have done; enforce acts. Moving a
            policy to enforce is deliberate, not a default.
          </Step>
          <Step title="Before a tool runs, the action itself is checked">
            It does not read the text. It asks whether the agent holds a grant for the
            tool, whether argument values are inside the declared ceilings, where those
            arguments came from, whether the tool is declared irreversible, and whether
            a generated SQL statement is bounded. An irreversible call built out of
            untrusted content is refused or escalated even when nothing flagged the
            prompt.
          </Step>
          <Step title="What comes back is checked too">
            An output pass checks the response for things like PII, and the answer is
            bound to its sources.
          </Step>
          <Step title="Everything lands in a record you can verify">
            A trace of the whole path and an entry in a tamper-evident audit chain,
            allowed or blocked. The chain has an independent verifier.
          </Step>
        </ol>
        <p>
          Steps 1 to 6 are what most products in this space also do. Step 7 is what the
          design rests on, because an attacker who keeps trying eventually gets past
          step 5.{" "}
          <Link href="/benchmark">The measurements for both are here →</Link>
        </p>

        <h2>The six areas of the product</h2>
        <p>
          Each is a set of screens once you have signed in.
        </p>

        <Area n={1} title="Discovery and registry" question="What agents do we actually have?">
          Connect a repository or scan locally to find what talks to a model and which
          of it is ungoverned. Register each agent with an owner; unregistered traffic
          shows up as a finding.
        </Area>
        <Area
          n={2}
          title="Identity, access and authorisation"
          question="What is this agent allowed to touch?"
        >
          Grant each agent only the tools it needs, put ceilings on argument values,
          declare which tools are irreversible, and carry the end user&rsquo;s own
          entitlements through retrieval and tool calls. Step 7 enforces these
          declarations, and a tool declared wrongly is enforced wrongly.
        </Area>
        <Area n={3} title="Runtime guardrails" question="Stop the bad thing while it happens">
          The detectors and the policies that act on them. Start in observe, tune per
          policy against real traffic, switch to enforce when you believe the findings.
          The tuning screen shows precision, latency and suppressions per detector.
        </Area>
        <Area n={4} title="Evaluation and reliability" question="Does this deployment still work?">
          Adversarial probes fired at your agents&rsquo; real capability grants and
          policy bindings, plus the ordinary quality checks. This is configuration
          regression testing. It is not a robustness certificate, and we do not present
          it as one.
        </Area>
        <Area n={5} title="Audit and traceability" question="Show me exactly what happened">
          One trace holds the whole path: what was asked, what was retrieved, which
          rule fired, what the tool was called with, what came back. The audit chain
          behind it is tamper-evident and independently verifiable.
        </Area>
        <Area n={6} title="Policy and compliance" question="Prove we meet the rules">
          Controls map to the framework you answer to, and each status is computed from
          telemetry rather than from a claim someone typed into a spreadsheet. Where a
          mapping does not cover something, the coverage table says so.
        </Area>
        {/* Every compliance screen inside the product carries this warning, and the
            public page carried none of it, which made the marketing page less honest
            than the product it was selling. Rendered through the same component the
            signed-in screens use, so the public wording cannot drift from the
            in-product wording. */}
        <div style={{ margin: "-4px 0 12px" }}>
          <DraftCaveat />
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: -4 }}>
          That warning is on every compliance screen inside the product, and the draft
          mappings ship inside evidence packages carrying the same chip.
        </p>

        <h2>What this does not do</h2>
        <ul>
          <li>
            It does not make your agent robust to attack. Detection loses to an
            attacker who is allowed to adapt, ours included, and we measure that against
            ourselves.
          </li>
          <li>
            It does not know anything you have not declared. An irreversible tool
            recorded as read-only is invisible to the check that would have stopped it.
          </li>
          <li>
            It does not grant or revoke access in your own systems. It bounds what an
            agent does with access you already gave it.
          </li>
          <li>
            It does not block anything you have not asked it to block. The policy that
            governs model traffic ships in observe mode: it records what it would have
            done and lets the call through. One exception is on from the first day. The
            tool-containment pack refuses calls in one situation only: a tool that can do
            real damage, such as moving money, deleting something or sending an email, is
            about to be passed a value that came not from the person using the agent but
            from content nobody vouches for, such as a web page, a retrieved document or
            another tool&rsquo;s output. Those calls are refused or sent to a human.
          </li>
        </ul>
        <div className="note-panel">
          <strong>What all of this rests on.</strong> Grants, impact tiers, ceilings and
          downstream triggers are declared by whoever operates the agent, and the checks
          above believe them. A tool recorded as read-only that is not read-only is not
          covered.{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            The source, the licence and the limits are all in the repository.
          </a>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
          <Link
            href="/playground"
            className="btn-primary"
            style={{ height: "auto", minHeight: 32, padding: "7px 16px", textDecoration: "none" }}
          >
            Try it, no account
          </Link>
          <Link
            href="/benchmark"
            className="btn-scan"
            style={{
              height: "auto",
              minHeight: 32,
              padding: "7px 16px",
              whiteSpace: "normal",
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            The numbers, and where a competitor beats us
          </Link>
        </div>
        </article>
      </div>
      </main>
      <Footer />
    </div>
  );
}
