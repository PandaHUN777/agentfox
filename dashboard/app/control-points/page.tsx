/**
 * /control-points — open enforcement, in full.
 *
 * Same template as the other seven. The distinctive part, and the `feature`,
 * is the last column: every integrations page in this category lists logos,
 * and none of them tells you what each integration cannot see.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { CapabilityPage } from "@/components/marketing/capability";
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

export default function Page() {
  return (
    <CapabilityPage
      kicker="Open enforcement"
      title={["One policy set,", "six places it binds"]}
      lede="No single gateway sees every agent, and routing everything through one is a migration rather than a control."
      challenge={
        <p>
          Agents do not arrive through one door. One team is in LangGraph, one is
          calling an API from Go, one is running Claude Code on a laptop — and a
          guardrail that only works if all three move onto your gateway is a migration
          plan wearing a product&rsquo;s clothes.
        </p>
      }
      feature={{
        title: "What each one is blind to",
        lede: "Every integrations page in this category lists logos. The useful column is the last one.",
        body: (
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
                    More &rarr;
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) }}
      steps={[
        {
          title: "One engine behind all six",
          body: (
            <p>
              This is not six products under one name. Each binding point calls the
              same <code>Enforcer</code> against the same packs and writes the same
              decision record, so a verdict means the same thing wherever it came from.
            </p>
          ),
        },
        {
          title: "Write the rule once",
          body: (
            <p>
              A rule you wrote for the gateway is already in force at the hook. Packs
              are YAML in the repository, so the policy travels with the code rather
              than living in a console somebody has to remember to update.
            </p>
          ),
          code: "agentfox policy lint",
        },
        {
          title: "Add a binding point without moving traffic",
          body: (
            <p>
              Each one is independent. Starting with the hook on one laptop and adding
              the gateway six months later changes nothing about the policy — which is
              the whole reason not to demand the gateway on day one.
            </p>
          ),
        },
        {
          title: "Nothing blocks until you say so",
          body: (
            <p>
              Every pack ships in observe and records the verdict it would have
              returned, against real calls, changing nothing until you promote it.
            </p>
          ),
          code: "agentfox policy observe baseline",
        },
      ]}
      gaps={{
        title: "Six doors is not every door",
        body: (
          <p>
            Traffic that goes through none of them is ungoverned, and we would rather
            say that than imply coverage we do not have. The honest use of this page is
            to find which door your agents already use — not to assume the list is
            exhaustive.
          </p>
        ) }}
      related={["/hooks", "/mcp", "/runtime"]}
    />
  );
}
