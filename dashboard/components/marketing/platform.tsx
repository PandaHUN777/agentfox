"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * The platform section — the thing this site did not have.
 *
 * The diagnosis that produced it: we were presenting a toolkit and the
 * competitors are presenting a platform. They name four or five products and
 * put a verb in front of each — "Discover with AI-SPM", "Protect with AI-DR"
 * — so a buyer reads the section once and knows what they would be buying.
 * We shipped every one of those capabilities and named none of them; the nav
 * said "discovery", "grants", "runtime guardrails", which are descriptions of
 * features, not products.
 *
 * The category names below are industry terms, not a competitor's brands.
 * AI-SPM and AI-DR are what this market calls posture management and runtime
 * detection, and a buyer searches for them by those names. Using the
 * vocabulary a reader already has is the opposite of cargo-culting: inventing
 * "AgentFox Sentinel" would be the cargo cult.
 *
 * Every bullet is a fact from the product, and the link goes to the page that
 * carries it in depth. A platform section whose claims do not resolve to
 * anything is the exact failure this project spends its credibility avoiding.
 */

type Pillar = {
  verb: string;
  product: string;
  headline: string;
  points: string[];
  href: string;
  cta: string;
};

const PILLARS: Pillar[] = [
  {
    verb: "Discover",
    product: "AI-SPM",
    headline: "Surface every agent, tool, MCP server and skill",
    points: [
      "Static scan of a repository — reads the code, never runs it",
      "Local coding-assistant sessions, so you see what is running today and not only what was committed",
      "MCP tools snapshotted with a digest, which is the only thing that makes a later change detectable",
      "An agent with no owner is a reportable finding, not a row in a table",
    ],
    href: "/discovery",
    cta: "How discovery works",
  },
  {
    verb: "Govern",
    product: "Agent Access Control",
    headline: "Decide what each agent may actually do",
    points: [
      "Impact declared per tool: read, write, high impact, irreversible",
      "Grants carry their limits — a value ceiling, an environment, a maximum taint for the data that may reach them",
      "Untrusted content may fill a value, never choose an action",
      "Anything not granted is refused by default, not by a rule somebody remembered to write",
    ],
    href: "/grants",
    cta: "How grants work",
  },
  {
    verb: "Protect",
    product: "AI-DR",
    headline: "Check every call at runtime, on nine surfaces",
    points: [
      "Prompts, tool calls, tool results, retrieved documents, memory, agent-to-agent messages — plus the model's own reasoning and its claim that it finished",
      "50 rules across four packs, as YAML in your own repository",
      "A detector over its budget is marked degraded on that decision rather than quietly skipped",
      "Observe first: it records the verdict it would have returned and changes nothing",
    ],
    href: "/runtime",
    cta: "How enforcement works",
  },
  {
    verb: "Test",
    product: "AI Red Teaming",
    headline: "Attack your own configuration before somebody else does",
    points: [
      "116 failure scenarios, built from the architecture of a request rather than from our feature list",
      "105 of them executed against the running product every night",
      "42 of 42 attacker tool calls contained with every detector switched off",
      "The scenarios we do not catch are published beside the ones we do",
    ],
    href: "/coverage",
    cta: "See the coverage",
  },
  {
    verb: "Prove",
    product: "Audit & Compliance",
    headline: "A record an auditor can check without us",
    points: [
      "Every decision hash-chained, so removing one breaks the chain from that point on",
      "Evidence packages ship with a standard-library-only verifier that imports none of our code",
      "43 controls across seven frameworks, including the EU AI Act and ISO 42001",
      "Status computed from telemetry rather than attested in a questionnaire",
    ],
    href: "/evidence",
    cta: "How evidence works",
  },
];

export function Platform() {
  const [active, setActive] = useState(0);
  const p = PILLARS[active];

  return (
    <section id="platform" className="mk-section mk-ink-act mk-reveal">
      <div className="mk-wrap">
        <div className="mk-narrow">
          <p className="mk-kicker">The control plane</p>
          <h2 className="mk-h2" style={{ marginTop: 14 }}>
            One platform for everything your agents can reach
          </h2>
          <p className="mk-lede" style={{ marginTop: 16 }}>
            Five jobs, one policy set, one decision record. Each is a page of its own
            because each is a product, not a checkbox.
          </p>
        </div>

        {/* A tablist, properly: arrow keys move between tabs and the panel is
            labelled by the tab that opened it. A row of divs with onClick is
            the usual version of this and it is unusable without a mouse. */}
        <div className="pf" style={{ marginTop: 40 }}>
          <div className="pf-tabs" role="tablist" aria-label="What the platform does">
            {PILLARS.map((pillar, i) => (
              <button
                key={pillar.product}
                role="tab"
                id={`pf-tab-${i}`}
                aria-selected={i === active}
                aria-controls={`pf-panel-${i}`}
                tabIndex={i === active ? 0 : -1}
                className={i === active ? "pf-tab pf-tab-on" : "pf-tab"}
                onClick={() => setActive(i)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const next =
                    e.key === "ArrowRight"
                      ? (i + 1) % PILLARS.length
                      : (i - 1 + PILLARS.length) % PILLARS.length;
                  setActive(next);
                  document.getElementById(`pf-tab-${next}`)?.focus();
                }}
              >
                <span className="pf-verb">{pillar.verb}</span>
                <span className="pf-product">{pillar.product}</span>
              </button>
            ))}
          </div>

          <div
            className="pf-panel"
            role="tabpanel"
            id={`pf-panel-${active}`}
            aria-labelledby={`pf-tab-${active}`}
            /* Keyed so the panel re-mounts on change and the entrance runs.
               Without it React reuses the node and the switch is a jump. */
            key={active}
          >
            <h3>{p.headline}</h3>
            <ul>
              {p.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <Link href={p.href} className="mk-btn mk-btn-outline">
              {p.cta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
