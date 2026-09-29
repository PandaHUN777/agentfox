/**
 * /control-points — open enforcement, in full.
 *
 * The home page carries a six-cell teaser of this. It needed a page because
 * the argument does not fit in six cells: the interesting part is not that
 * there are six, it is that each one sees a *different surface*, and that the
 * honest version of "we integrate with X" is "here is exactly what that
 * integration can and cannot see".
 *
 * The table on this page is therefore the inverse of every integrations page
 * in this category. Those list logos. This lists what each binding point is
 * blind to, because that is the thing a reader cannot find out any other way
 * short of reading our source.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { MarketingNav } from "@/components/marketing/nav";
import { CTA, Footer } from "@/components/marketing/sections";
import { publicPageMetadata } from "@/lib/site";

export const metadata: Metadata = publicPageMetadata({
  title: "One policy set, six places it binds",
  description:
    "No single gateway sees every agent. Write the policy once and bind it where your agents already run — with a straight account of what each binding point can and cannot see.",
  path: "/control-points",
});

const POINTS = [
  {
    where: "Your coding agent",
    how: "Claude Code hooks",
    install: "agentfox hooks install --agent my-agent --write",
    sees: ["The turn you submitted", "Each tool call before it runs", "Every tool result"],
    blind: "Anything not going through this harness, and sessions that run in the vendor's cloud rather than on the laptop.",
    href: "/hooks",
  },
  {
    where: "Any language",
    how: "HTTP gateway",
    install: "agentfox serve",
    sees: ["Whatever you post to it", "One endpoint per surface", "Model traffic, if you proxy it"],
    blind: "Calls your code makes without asking. It answers questions; it cannot intercept what it is not shown.",
    href: "/how-it-works",
  },
  {
    where: "Python",
    how: "agentfox.auto()",
    install: "import agentfox; agentfox.auto()",
    sees: ["Prompts and completions", "OpenAI, Anthropic, LiteLLM, LangChain", "Sync, async and streamed"],
    blind: "Tool calls. It patches model clients, so a tool your agent invokes directly never reaches it — use one of the other four for that.",
    href: "/how-it-works",
  },
  {
    where: "Tool servers",
    how: "MCP governor",
    install: "agentfox scan mcp",
    sees: ["The call and its arguments", "The schema it was approved under", "What the server sent back"],
    blind: "A server nobody pointed it at. An undeclared tool becomes a finding the first time it is called, not before.",
    href: "/mcp",
  },
  {
    where: "Graphs",
    how: "LangGraph tool node",
    install: "guard.tool_node(transfer, tool=\"payments.transfer\")",
    sees: ["Each tool call in the run", "Retrieved documents", "Model input and output"],
    blind: "Nodes you did not wrap. Escalation maps to LangGraph's own interrupt(), so there is one pause mechanism rather than two.",
    href: "/how-it-works",
  },
  {
    where: "CI and the terminal",
    how: "The CLI",
    install: "agentfox quickscan .",
    sees: ["A repository, without running it", "A session transcript", "A policy, before it ships"],
    blind: "Runtime. It reads code and records; it stops nothing that is already executing.",
    href: "/product",
  },
] as const;

export default function ControlPointsPage() {
  return (
    <div className="mk">
      <MarketingNav />
      <main>
        <section className="mk-section">
          <div className="mk-wrap mk-narrow">
            <p className="mk-kicker">Open enforcement</p>
            <h1 className="mk-h1" style={{ marginTop: 14 }}>
              One policy set, <em>six places it binds</em>
            </h1>
            <p className="mk-lede" style={{ marginTop: 20 }}>
              No single gateway sees every agent, and routing everything through one is
              a migration rather than a control.
            </p>
          </div>
        </section>

        <section className="mk-section mk-band mk-reveal">
          <div className="mk-wrap">
            <div className="mk-narrow">
              <h2 className="mk-h2">What each one is blind to</h2>
              <p className="mk-lede" style={{ marginTop: 16 }}>
                Every integrations page in this category lists logos. The useful
                column is the last one.
              </p>
            </div>
            <div className="cp-list mk-stagger">
              {POINTS.map((point) => (
                <article key={point.how} className="cp-item">
                  <div className="cp-item-head">
                    <span className="cp-where">{point.where}</span>
                    <h3>{point.how}</h3>
                  </div>
                  <div className="cp-item-body">
                    <code className="cp-install">{point.install}</code>
                    <ul className="cp-sees">
                      {point.sees.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <p className="cp-blind">
                      <b>Blind to</b> {point.blind}
                    </p>
                    <Link href={point.href} className="cp-more">
                      More →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-reveal">
          <div className="mk-wrap mk-narrow">
            <h2 className="mk-h2">Same engine, every one of them</h2>
            <p className="mk-lede" style={{ marginTop: 16 }}>
              This is not six products behind one name. Each binding point calls the
              same <code>Enforcer</code> against the same packs and writes the same
              decision record, so a rule you wrote for the gateway is already in force
              at the hook — and a verdict means the same thing wherever it came from.
            </p>
            <div className="mk-honest" style={{ marginTop: 32 }}>
              <div>
                <h3 className="mk-h3">Nothing blocks until you say so</h3>
                <p className="mk-body">
                  Every pack ships in observe and records the verdict it would have
                  returned, against real calls, changing nothing.
                </p>
              </div>
              <Link href="/coverage" className="mk-btn mk-btn-outline">
                What we catch
              </Link>
            </div>
          </div>
        </section>
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
