import Link from "next/link";
import { PublicHeader, PublicFooter } from "./_public";

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

export const metadata = {
  title: "How it works — Nometria",
  description:
    "The path one agent call takes, what is checked before a tool runs, and what the six areas of the product are for.",
};

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
    <div className="pg-shell">
      <PublicHeader current="/how-it-works" />

      <div className="bm-doc">
        <h1>How it works</h1>
        <p className="lede">
          Nometria sits on the path between your agent and everything it can act on.
          This page walks one call through it, then says what each of the six areas of
          the product is for and what you would actually do in each one.
        </p>

        <h2>The path one call takes</h2>
        <p>
          You get on this path in one of two ways: a line in your entry point that
          wraps the model clients already in the process, or by pointing an agent at
          the gateway, which speaks the same API your agent already calls. Either way
          the sequence below is the same, and it runs for tool calls and retrieval
          steps as well as model calls.
        </p>
        <ol>
          <Step title="A call arrives, and we work out who is behind it">
            Which agent is this, and which end user is it acting for. If the agent has
            been quarantined by the kill switch, it stops here and never reaches a
            model.
          </Step>
          <Step title="Questions it should not answer are stopped before they cost anything">
            If you have declared a knowledge boundary for an agent, a question outside
            it gets a templated refusal with no model call made.
          </Step>
          <Step title="Retrieval is filtered for the person asking">
            Documents the end user is not entitled to see never reach the prompt, so
            the model cannot leak what it was never given.
          </Step>
          <Step title="Every piece of text is tagged with where it came from">
            The user, a retrieved document, a tool result, a subagent, memory, and
            whether that source is trusted. This tag does nothing on its own. It is
            what step 6 uses, and it is the reason step 6 keeps working after step 5
            has failed.
          </Step>
          <Step title="Detectors read the text">
            Prompt injection, PII, and the rest, each running under a time budget, with
            the worst verdict carried forward. This is the layer we trust least, and we{" "}
            <Link href="/benchmark">publish how well it does</Link>, including where a
            competing scanner is more precise than ours.
          </Step>
          <Step title="The policy decides">
            Your rules resolve in a hierarchy down to one verdict: allow, block, or
            hand off to a person. Each policy has a mode. In observe it records what it
            would have done and lets the call through. In enforce it acts. Moving a
            policy from observe to enforce is a deliberate step you take when the
            findings look right, not a default.
          </Step>
          <Step title="Before a tool runs, the action itself is checked">
            This check does not read the text at all. It asks whether this agent holds
            a grant for this tool, whether the argument values are inside the declared
            ceilings, where those arguments came from, whether the tool is declared
            irreversible, and whether a generated SQL statement is actually bounded. An
            irreversible call built out of untrusted content is refused or escalated
            even when nothing flagged the prompt. This is the part of the product that
            still works on the day the model is successfully fooled.
          </Step>
          <Step title="What comes back is checked too">
            The response goes through an output pass for things like PII before it
            reaches the customer, and the answer is bound to the sources it was built
            from.
          </Step>
          <Step title="Everything lands in a record you can verify">
            A trace of the whole path and an entry in a tamper-evident audit chain, and
            this happens whether the call was allowed or blocked. The chain has an
            independent verifier, so the record does not rest on trusting the process
            that wrote it.
          </Step>
        </ol>
        <p>
          Steps 1 to 6 are the part most products in this space also do. Step 7 is the
          part the design actually rests on, because an attacker who can keep trying
          eventually gets past step 5.{" "}
          <Link href="/benchmark">The measurements for both are here →</Link>
        </p>

        <h2>The six areas of the product</h2>
        <p>
          Each of these is a set of screens once you have signed in. They are listed in
          the order you tend to need them.
        </p>

        <Area n={1} title="Discovery and registry" question="What agents do we actually have?">
          You cannot govern what you have not found. Connect a repository or run the
          scan locally, and you get a list of what in your code talks to a model and
          which of it is ungoverned. You register each agent and give it an owner.
          Anything that sends traffic without being registered shows up as a finding,
          because the problem with an unregistered agent is that nobody is accountable
          for it.
        </Area>
        <Area
          n={2}
          title="Identity, access and authorization"
          question="What is this agent allowed to touch?"
        >
          You grant each agent the tools it needs and nothing more, put ceilings on the
          argument values where a number matters, and declare which tools are
          irreversible. You also carry the end user&rsquo;s own entitlements through
          retrieval and tool calls, so an agent answering for one customer cannot reach
          another customer&rsquo;s records. These declarations are what step 7 enforces,
          and they are also its weak point: a tool declared wrongly is enforced wrongly.
        </Area>
        <Area n={3} title="Runtime guardrails" question="Stop the bad thing while it happens">
          The detectors and the policies that act on them. You start in observe, read
          what gets flagged against real traffic, tune the detectors per policy when
          they are noisy, and switch to enforce when you believe the findings. The
          tuning screen shows precision, latency and suppressions per detector, because
          a guardrail nobody can tune gets turned off.
        </Area>
        <Area n={4} title="Evaluation and reliability" question="Does this deployment still work?">
          Adversarial probes fired at your agents&rsquo; real capability grants and
          policy bindings, plus the ordinary quality checks. You run them after a
          change to see whether this deployment got weaker than it was last week. This
          is configuration regression testing. It is not a robustness certificate, and
          we do not present it as one.
        </Area>
        <Area n={5} title="Audit and traceability" question="Show me exactly what happened">
          One trace holds the whole path: what was asked, what was retrieved, which
          rule fired, what the tool was called with, what came back. When somebody asks
          why an agent did something three weeks ago, this is the screen that answers
          it, and the audit chain behind it is tamper-evident and independently
          verifiable.
        </Area>
        <Area n={6} title="Policy and compliance" question="Prove we meet the rules">
          You map controls to the framework you answer to, and the status of each
          control is computed from telemetry rather than from a claim someone typed
          into a spreadsheet. Where a mapping does not cover something, the coverage
          table says so rather than leaving a gap unmarked.
        </Area>

        <h2>What this does not do</h2>
        <ul>
          <li>
            It does not make your agent robust to attack. Detection loses to an
            attacker who is allowed to adapt, ours included, and we measure that
            against ourselves rather than waiting for someone else to.
          </li>
          <li>
            It does not know anything you have not declared. Grants, impact tiers,
            ceilings and downstream triggers are operator-declared, and an irreversible
            tool recorded as read-only is invisible to the check that would have
            stopped it.
          </li>
          <li>
            It does not grant or revoke access in your own systems. It bounds what an
            agent does with the access you already gave it.
          </li>
          <li>
            It does not block anything you have not asked it to block. The policy that
            governs model traffic ships in observe mode. The tool-containment pack is
            the one exception, and it enforces on tool calls whose arguments came from
            untrusted content.
          </li>
        </ul>

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
      </div>

      <PublicFooter />
    </div>
  );
}
