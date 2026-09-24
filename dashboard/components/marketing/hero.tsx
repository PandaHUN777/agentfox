import Link from "next/link";
import { ToolCallMock } from "@/components/marketing/mocks";
import { REPO } from "@/components/marketing/nav";

/**
 * The hero.
 *
 * Same shape as the one this team already ships on dayotter.com: an ambient wash, an
 * eyebrow, a display headline with the accent carrying the second clause, one paragraph,
 * two actions, a trust line, and then the product doing the job rather than a
 * description of it. The mockup sits high on purpose.
 *
 * The headline covers the whole product rather than one layer of it. An earlier
 * version led with capability grants alone, which is the differentiator but not the
 * thing: someone arriving here needs to learn that this scans model traffic, bounds
 * tool calls and records the result, before they are told which of those is novel.
 * The panel underneath then shows the layer the rest of the page argues for.
 */
export function Hero() {
  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <div className="mk-wash" aria-hidden />

      <div className="mk-wrap" style={{ position: "relative", paddingTop: 62, textAlign: "center" }}>
        <span className="mk-eyebrow mk-up">Open source, Apache-2.0</span>

        <h1 className="mk-h1 mk-up mk-d1" style={{ margin: "18px auto 0", maxWidth: "21ch" }}>
          Every call your agent makes, <em>checked and recorded</em>.
        </h1>

        <p
          className="mk-lede mk-up mk-d2"
          style={{ margin: "20px auto 0", maxWidth: "62ch" }}
        >
          A control plane between your agents and the models, tools and data they reach.
          Guardrails on the way in and out, tool calls bounded by what each agent was
          actually granted, and a tamper-evident record mapped to the frameworks you
          answer to.
        </p>

        <div
          className="mk-row mk-up mk-d3"
          style={{ justifyContent: "center", marginTop: 28 }}
        >
          <Link href="/playground" className="mk-btn mk-btn-primary">
            Try it, no account
          </Link>
          <Link href="/#pillars" className="mk-btn mk-btn-outline">
            See the product
          </Link>
        </div>

        <p className="mk-fine mk-up mk-d4" style={{ marginTop: 18 }}>
          Runs offline with no API key · One line in Python, or HTTP from any language ·{" "}
          <a href={REPO} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
            Read the source
          </a>
        </p>
      </div>

      <div
        className="mk-wrap mk-up mk-d5"
        style={{ position: "relative", marginTop: 46, paddingBottom: 18, maxWidth: 900 }}
      >
        <div style={{ borderRadius: "var(--mk-r-xl)", boxShadow: "var(--mk-shadow-float)" }}>
          <ToolCallMock />
        </div>
        <p className="mk-fine" style={{ textAlign: "center", marginTop: 18 }}>
          The layer that is ours: a refusal that never read the attack. A real response from
          the hosted sandbox, reproducible in the{" "}
          <Link href="/playground">playground</Link>.
        </p>
      </div>
    </section>
  );
}
