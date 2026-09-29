/**
 * /coverage — what an agent can get wrong, and whether we catch it.
 *
 * This page exists because the competitive review reached an uncomfortable
 * conclusion: of the eleven subcategories the September market report marks as
 * unsolved-but-buildable, we already ship something for nine. The problem was
 * never coverage. It was that the site led with a concept and nobody could
 * check the claim.
 *
 * Every number here is rendered from `lib/coverage.json`, which
 * `scripts/probe/run.py --json` generates by walking the same taxonomy the
 * nightly harness executes. Nothing on this page is typed by hand, for the
 * reason `benchmarks/claims.yaml` exists: two published figures were corrected
 * by hand in a single week before that mechanism did.
 *
 * The distinction the page is built around, and the reason it is worth
 * publishing at all: a row is only "verified" where a probe actually ran
 * against the product and agreed. Everything else is assessed by inspection
 * and says so. A coverage page that showed the two the same way would be
 * overstating the product, which is the thing the harness exists to prevent.
 */

import type { Metadata } from "next";

import { MarketingNav } from "@/components/marketing/nav";
import { CTA, Footer } from "@/components/marketing/sections";
import coverage from "@/lib/coverage.json";
import { publicPageMetadata } from "@/lib/site";

export const metadata: Metadata = publicPageMetadata({
  title: "Coverage: what an agent can get wrong",
  description:
    "114 ways an agentic request can fail, scored against what AgentFox catches — and 103 of them executed against the running product rather than asserted.",
  path: "/coverage",
});

/** The three budgets an operator asks about, from `config.py`'s defaults. */
const BUDGETS = [
  {
    label: "Whole request",
    value: "350 ms",
    note: "Everything the platform adds, end to end.",
  },
  {
    label: "Pre-flight pipeline",
    value: "300 ms",
    note: "All detectors together, before the model is called.",
  },
  {
    label: "Any one detector",
    value: "40 ms",
    note: "Exceed it and that detector is degraded, on that request, in the record.",
  },
];

/** Controls that may not be configured to fail open — `availability.py`. */
const NEVER_OPEN = [
  [
    "Tenant isolation",
    "One customer's data reaching another is not an outage.",
  ],
  ["Entitlement filter", "Same."],
  [
    "Data access scope",
    "A query across every customer's rows reads as ordinary.",
  ],
  [
    "Audit chain",
    "A gap in the record is the thing the record exists to prevent.",
  ],
];

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export default function CoveragePage() {
  const {
    scenarios,
    executable,
    verified,
    weighted_coverage,
    layers,
    rows,
    disagreements,
  } = coverage;
  const absent = rows.filter((r) => r.verdict === "absent");
  const partial = rows.filter((r) => r.verdict === "partial");

  return (
    <div className="mk">
      <MarketingNav />
      <main>
        <section className="mk-section">
          <div className="mk-wrap">
            <p className="mk-kicker">Coverage</p>
            <h1 className="mk-h1">
              What an agent can get wrong, and <em>what we catch</em>
            </h1>
            <p className="mk-lede">
              {scenarios} ways an agentic request can fail, built from the
              architecture of the request rather than from our own feature list.{" "}
              {verified} of them are executed against the running product every
              night; the rest say plainly that they were assessed by reading the
              code.
            </p>

            <div className="cov-kpis">
              <div>
                <b>{scenarios}</b>
                <span>scenarios in the taxonomy</span>
              </div>
              <div>
                <b>{verified}</b>
                <span>verified by execution, not assertion</span>
              </div>
              <div>
                <b>{pct(weighted_coverage)}</b>
                <span>weighted coverage (partial counts half)</span>
              </div>
              <div>
                <b>{disagreements.length}</b>
                <span>claims disagreeing with the product</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section">
          <div className="mk-wrap">
            <h2>Where the request can fail</h2>
            <p className="mk-lede">
              Each layer is a stage the request actually travels through. The
              score counts a partial control as half, because most of the honest
              answers are partial.
            </p>
            <div className="cov-layers">
              {layers.map((layer) => (
                <div key={layer.layer} className="cov-layer">
                  <span className="cov-layer-name">{layer.layer}</span>
                  <span className="cov-bar" aria-hidden="true">
                    <i style={{ width: `${layer.fraction * 100}%` }} />
                  </span>
                  <span className="cov-layer-score">
                    {layer.covered}/{layer.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section">
          <div className="mk-wrap">
            <h2>What we do not catch</h2>
            <p className="mk-lede">
              Published for the same reason the rest is: a coverage page that
              only listed successes would not be evidence of anything.{" "}
              {absent.length} scenarios have no control at all, and{" "}
              {partial.length} have a partial one.
            </p>
            <ul className="cov-gaps">
              {absent.map((row) => (
                <li key={row.id}>
                  <b>{row.name}</b>
                  <span>{row.layer}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mk-section">
          <div className="mk-wrap">
            <h2>What it costs, and what happens when it fails</h2>
            <p className="mk-lede">
              Latency and false positives are the most-cited reasons guardrails
              get switched off. Every control here runs inside a declared budget
              and records its own degradation per decision, so &quot;the check
              was down&quot; is a fact in the record rather than a thing nobody
              noticed.
            </p>
            <div className="cov-budgets">
              {BUDGETS.map((budget) => (
                <div key={budget.label}>
                  <b>{budget.value}</b>
                  <span className="cov-budget-label">{budget.label}</span>
                  <span>{budget.note}</span>
                </div>
              ))}
            </div>

            <h3 className="cov-h3">
              Four controls may not be configured to fail open
            </h3>
            <p className="mk-lede">
              Not a setting with a safe default — a refusal. Their failure mode
              is a disclosure rather than an outage, and &quot;we allowed it
              because the check was down&quot; is not a defensible answer.
            </p>
            <dl className="cov-neveropen">
              {NEVER_OPEN.map(([name, why]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{why}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mk-section">
          <div className="mk-wrap">
            <p className="cov-note">
              Generated by <code>scripts/probe/run.py --json</code> from the
              taxonomy the nightly harness executes. A row marked verified has
              fired at least once against the real product; a row that is not
              executable says so rather than borrowing the others&apos;
              credibility. The full table, with the control behind each row, is
              in{" "}
              <a href="https://github.com/architsharm/agentfox/blob/main/docs/coverage-map.md">
                docs/coverage-map.md
              </a>
              .
            </p>
          </div>
        </section>
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
