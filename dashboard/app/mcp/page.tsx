/**
 * /mcp — the MCP governance page.
 *
 * It deserves its own page for two reasons. It is a category people search
 * for by name, and the thing we do here is genuinely unusual: the rug-pull
 * check runs *at call time*, comparing the digest in force when the agent was
 * authorised against the digest at the moment of the call. Hygiene scanning —
 * which is what most tools in this space mean by MCP security — cannot catch
 * that by construction, because the server was clean when it was scanned.
 *
 * The six risks are the ones a competitor enumerates on their own MCP page.
 * Four of them we cover and two we do not, and both columns are here, because
 * a page that listed only the four would be the marketing this project spends
 * its credibility refusing to write.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { MarketingNav } from "@/components/marketing/nav";
import { CTA, Footer } from "@/components/marketing/sections";
import { publicPageMetadata } from "@/lib/site";

export const metadata: Metadata = publicPageMetadata({
  title: "Govern the MCP call path",
  description:
    "Rug-pull detection at call time, undeclared tools as findings, and results treated as untrusted context — plus the two MCP risks we do not cover.",
  path: "/mcp",
});

const RISKS = [
  {
    risk: "Tool drift, or the rug pull",
    what: "A server passes review, an agent is authorised against it, and the tool's schema or description changes afterwards.",
    us: "Checked at call time",
    covered: true,
    how: "The digest in force when the agent was authorised is compared against the digest at the moment of the call. A scan on Monday says nothing about a call on Thursday; only a check at the call can.",
  },
  {
    risk: "Tool poisoning",
    what: "A manipulated tool description steers the agent into leaking data or taking an action nobody asked for.",
    us: "Covered",
    covered: true,
    how: "Descriptions are scanned, and the description is part of the digest above — so poisoning an approved tool is also drift.",
  },
  {
    risk: "A poisoned result",
    what: "Content authored by a third party arrives as trusted context through a tool the agent was allowed to call.",
    us: "Covered",
    covered: true,
    how: "Results are evaluated on the tool_result surface and the taint is propagated, so an argument later derived from that text cannot exceed the ceiling for tool-sourced data.",
  },
  {
    risk: "An undeclared tool",
    what: "The agent calls a tool nobody registered. Hygiene scanning never sees it, because nobody pointed a scan at that server.",
    us: "Becomes a finding",
    covered: true,
    how: "It is recorded as an observed tool and raised as a discovery finding — visible rather than invisible. The first call is still the first call, and we do not pretend otherwise.",
  },
  {
    risk: "An over-scoped server",
    what: "One server can read sensitive data or trigger destructive actions far beyond what the agent using it needs.",
    us: "Partly",
    covered: false,
    how: "Impact inference and the capability ceiling bound what any single call can do. What we do not yet say is 'this server can do far more than this agent has ever needed', which is the posture finding worth having.",
  },
  {
    risk: "Credential sprawl",
    what: "Every agent holds its own upstream credentials, multiplying the blast radius of any one leak.",
    us: "Not covered",
    covered: false,
    how: "We do not broker or hold upstream credentials, so we cannot consolidate them. Listed because it is a real MCP risk and leaving it out would make this table a sales sheet.",
  },
] as const;

export default function McpPage() {
  return (
    <div className="mk">
      <MarketingNav />
      <main>
        <section className="mk-section">
          <div className="mk-wrap mk-narrow">
            <p className="mk-kicker">Model Context Protocol</p>
            <h1 className="mk-h1" style={{ marginTop: 14 }}>
              The tool was safe <em>when you approved it</em>
            </h1>
            <p className="mk-lede" style={{ marginTop: 20 }}>
              A scan tells you what a server was. Agents call tools later, and servers
              change.
            </p>
            <div className="mk-code-block" style={{ marginTop: 28 }}>
              <code>agentfox scan mcp</code>
            </div>
          </div>
        </section>

        <section className="mk-section mk-band mk-reveal">
          <div className="mk-wrap">
            <div className="mk-narrow">
              <h2 className="mk-h2">Six risks, and the two we miss</h2>
              <p className="mk-lede" style={{ marginTop: 16 }}>
                Scored against the list a well-funded competitor publishes on their
                own MCP page, because their list is a good one.
              </p>
            </div>
            <div className="mcp-risks mk-stagger">
              {RISKS.map((row) => (
                <article
                  key={row.risk}
                  className={row.covered ? "mcp-risk" : "mcp-risk mcp-risk-gap"}
                >
                  <div className="mcp-risk-head">
                    <h3>{row.risk}</h3>
                    <span className={row.covered ? "mcp-chip mcp-chip-on" : "mcp-chip"}>
                      {row.us}
                    </span>
                  </div>
                  <p className="mcp-what">{row.what}</p>
                  <p className="mcp-how">{row.how}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-reveal">
          <div className="mk-wrap mk-narrow">
            <h2 className="mk-h2">Transport-agnostic on purpose</h2>
            <p className="mk-lede" style={{ marginTop: 16 }}>
              The governor wraps any callable that speaks list-tools and call-tool, so
              it works with the official SDK, a hand-rolled client, or the
              gateway&rsquo;s proxy route — and the <code>mcp</code> package is never a
              dependency of ours.
            </p>
            <div className="mk-honest" style={{ marginTop: 32 }}>
              <div>
                <h3 className="mk-h3">Same policy as everywhere else</h3>
                <p className="mk-body">
                  MCP is one of six binding points on one policy set, not a separate
                  product with its own rules.
                </p>
              </div>
              <Link href="/control-points" className="mk-btn mk-btn-outline">
                The other five
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
