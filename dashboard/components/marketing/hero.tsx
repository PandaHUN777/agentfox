import Link from "next/link";
import { ToolCallMock } from "@/components/marketing/mocks";
import { REPO } from "@/components/marketing/nav";

/**
 * The hero.
 *
 * Rewritten for the reader who has never heard of prompt injection. The previous
 * version opened with "a control plane between your agents and the models, tools and
 * data they reach", which is an accurate sentence that teaches a newcomer nothing:
 * it names a product category before naming a problem, and it spends "control plane",
 * "guardrails", "tamper-evident" and "granted" before the reader has been told what
 * goes wrong in the world.
 *
 * So this one states the failure first, in words a competent engineer who has never
 * built an agent already owns: an agent believes the text it is given, and text is
 * something an attacker can put in front of it. The answer is one clause long, and
 * everything else the product does is left for the page underneath.
 *
 * The mockup still sits high, but its caption now explains the picture rather than
 * labelling it. "The layer that is ours" only means something to someone who has
 * already read the rest of the page, which the person we are writing for has not.
 */
export function Hero() {
  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <div className="mk-wash" aria-hidden />

      <div className="mk-wrap" style={{ position: "relative", paddingTop: 62, textAlign: "center" }}>
        <span className="mk-eyebrow mk-up">Open source, Apache-2.0</span>

        <h1 className="mk-h1 mk-up mk-d1" style={{ margin: "18px auto 0", maxWidth: "20ch" }}>
          Your agent believes what it reads. <em>Limit what it is allowed to do.</em>
        </h1>

        <p
          className="mk-lede mk-up mk-d2"
          style={{ margin: "20px auto 0", maxWidth: "62ch" }}
        >
          Hidden text in a document or a web page can tell an AI agent to move money, leak
          data or delete records, and the agent will follow it. AgentFox sits between your
          agent and its tools, and refuses any call the agent was never granted, whatever it
          has been talked into trying.
        </p>

        <div
          className="mk-row mk-up mk-d3"
          style={{ justifyContent: "center", marginTop: 28 }}
        >
          <Link href="/playground" className="mk-btn mk-btn-primary">
            Try it, no account
          </Link>
          <Link href="/#how" className="mk-btn mk-btn-outline">
            See how it works
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
        {/* The $5,000 transfer and the three granted tools are the mock's own contents,
            which mocks.tsx traces back to src/nometria/seed.py. No new figure here. */}
        <p className="mk-fine" style={{ textAlign: "center", marginTop: 18 }}>
          A support agent, talked into asking for a $5,000 transfer. It was never given the
          payments tool, so the call is refused without anything having to recognise the
          attack. Real output from the hosted sandbox, reproducible in the{" "}
          <Link href="/playground">playground</Link>.
        </p>
      </div>
    </section>
  );
}
