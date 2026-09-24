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
 * The headline names the mechanism and the noun, because an audit found the previous
 * one stacked three negations and never said "tool call", which is the unit of
 * protection and the thing the panel underneath shows.
 */
export function Hero() {
  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <div className="mk-wash" aria-hidden />

      <div className="mk-wrap" style={{ position: "relative", paddingTop: 62, textAlign: "center" }}>
        <span className="mk-eyebrow mk-up">Open source, Apache-2.0</span>

        <h1 className="mk-h1 mk-up mk-d1" style={{ margin: "18px auto 0", maxWidth: "19ch" }}>
          Your agent can only do <em>what it was granted</em>.
        </h1>

        <p
          className="mk-lede mk-up mk-d2"
          style={{ margin: "20px auto 0", maxWidth: "62ch" }}
        >
          Nometria checks every tool call your agent makes against what that agent actually
          holds, and refuses the rest. It works after the model has been convinced, because
          the refusal never depended on recognising the attack.
        </p>

        <div
          className="mk-row mk-up mk-d3"
          style={{ justifyContent: "center", marginTop: 28 }}
        >
          <Link href="/playground" className="mk-btn mk-btn-primary">
            Try it, no account
          </Link>
          <Link href="/how-it-works" className="mk-btn mk-btn-outline">
            How it works
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
        <ToolCallMock />
        <p className="mk-fine" style={{ textAlign: "center", marginTop: 14 }}>
          A real response from the hosted sandbox. Reproduce it yourself in the{" "}
          <Link href="/playground">playground</Link>.
        </p>
      </div>
    </section>
  );
}
