import Link from "next/link";

/*
 * The homepage's index of the product.
 *
 * This replaces six full sections that ran 660, 373, 399, 594 and 699 words each.
 * A visitor deciding whether to try this does not read five thousand words first,
 * and the six equal-weight sections gave them no way to tell which part of the
 * product is the one nobody else has. Six cards, one line each, one of them marked
 * as the differentiator, and the long version a click away on /product.
 *
 * Each card carries a thumbnail of the screen that pillar actually produces. At this
 * size the screenshot is an index entry rather than evidence, which is its job here.
 * The full-size capture, where the text is legible, is on the page the card links to.
 *
 * Pillar names, the question each answers, and the built-on column come from the
 * "The six pillars" table in README.md.
 */

type Card = {
  n: number;
  name: string;
  line: string;
  shot: string;
  alt: string;
  href: string;
  lead?: boolean;
};

const CARDS: Card[] = [
  {
    n: 3,
    name: "Guardrails on model traffic",
    line: "Prompt injection, PII, secrets and unsafe content, checked on input, output, retrieved documents and tool results.",
    shot: "/shots/findings.webp",
    alt: "The Findings screen, listing problems raised from detector runs by severity.",
    href: "/product#guardrails",
  },
  {
    n: 2,
    name: "Tool calls bounded by grants",
    line: "Explicit grants with argument limits, and every argument carrying where its value came from. This is the layer that holds after the model has been convinced.",
    shot: "/shots/policies.webp",
    alt: "The Policies screen, showing the three shipped policy packs and the mode each is running in.",
    href: "/product#containment",
    lead: true,
  },
  {
    n: 1,
    name: "Discovery and agent registry",
    line: "Point it at a repository or a live API. It reports what talks to a model and what is ungoverned.",
    shot: "/shots/agents.webp",
    alt: "The Agents screen, listing registered and shadow agents with owner, risk tier and status.",
    href: "/product#discovery",
  },
  {
    n: 4,
    name: "Evals and red-teaming",
    line: "Gate CI on a regression, and fire red-team probes at this deployment's own grants rather than at a model in general.",
    shot: "/shots/evals.webp",
    alt: "The Evaluation screen, showing a suite, its cases and the scores from the latest run.",
    href: "/product#assurance",
  },
  {
    n: 5,
    name: "A record you can verify",
    line: "Every decision lands in a hash chain beside the trace it came from. Editing history breaks the chain, and the verifier says where.",
    shot: "/shots/trace-detail.webp",
    alt: "One trace end to end: the span timeline, argument provenance and every rule that fired.",
    href: "/product#audit",
  },
  {
    n: 6,
    name: "Compliance from telemetry",
    line: "One control set mapped to seven frameworks, each control's status computed from your own traffic rather than attested on a form.",
    shot: "/shots/compliance.webp",
    alt: "The Compliance screen, with control status computed from telemetry and the DRAFT mapping banner.",
    href: "/product#audit",
  },
];

export function Capabilities() {
  return (
    <section id="capabilities" className="mk-section">
      <div className="mk-wrap">
        <div style={{ textAlign: "center" }}>
          <span className="mk-eyebrow mk-up">What is in it</span>
          <h2 className="mk-h2 mk-up mk-d1" style={{ margin: "14px auto 0", maxWidth: "20ch" }}>
            Six things, and one of them is ours alone.
          </h2>
          <p className="mk-lede mk-up mk-d2" style={{ margin: "16px auto 0", maxWidth: "56ch" }}>
            Every card is a real screen. Open one for the long version.
          </p>
        </div>

        <div
          className="mk-grid mk-grid-2 mk-up mk-d3"
          style={{ marginTop: 40, gap: 20, alignItems: "stretch" }}
        >
          {CARDS.map((c) => (
            <Link
              key={c.name}
              href={c.href}
              className="mk-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                padding: 0,
                overflow: "hidden",
                textDecoration: "none",
                color: "inherit",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  display: "block",
                  aspectRatio: "16 / 9",
                  overflow: "hidden",
                  borderBottom: "1px solid var(--mk-border)",
                  background: "var(--mk-surface-2)",
                }}
              >
                <img
                  src={c.shot}
                  alt={c.alt}
                  loading="lazy"
                  width={1600}
                  height={1075}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center top",
                    display: "block",
                  }}
                />
              </span>
              <span style={{ display: "grid", gap: 8, padding: "2px 18px 20px", minWidth: 0 }}>
                <span className="mk-row" style={{ gap: 8 }}>
                  <span className="mk-label">Pillar {c.n}</span>
                  {c.lead && <span className="mk-chip mk-chip-accent">The differentiator</span>}
                </span>
                <span className="mk-h3">{c.name}</span>
                <span className="mk-body" style={{ fontSize: ".92rem" }}>
                  {c.line}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <p className="mk-fine mk-up mk-d4" style={{ marginTop: 26, textAlign: "center" }}>
          <Link href="/product">All six, with the detectors, the grants and the chain in full</Link>
        </p>
      </div>
    </section>
  );
}
