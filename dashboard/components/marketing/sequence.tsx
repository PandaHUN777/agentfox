/*
 * One request, three boundaries.
 *
 * What this replaces: three DecisionCards side by side, each a self-contained
 * example with its own agent, its own question and its own verdict. Three cards
 * teach three facts. The reader has to work out for themselves that these are
 * the same mechanism at three moments of one request — which is the single most
 * important thing this product has to say, and the page was leaving it as an
 * inference.
 *
 * So it is one journey now. Same agent, same session, same customer, three
 * stages in the order they actually happen, with the stakes climbing: a document
 * the requester may not see is held back, a question the agent has no standing
 * to answer is refused, and finally a tool call that arrived inside retrieved
 * text is blocked. The third stage is the product's whole argument, and it only
 * lands because the reader watched the first two happen to the same request.
 *
 * Every value is real. The rules (`not_entitled`, `answerable: false`,
 * `capability.denied`) and the verdict vocabulary are the ones the gateway
 * emits; see decisions.tsx, whose Decision records carry the same values in the
 * card format used elsewhere on the site.
 *
 * Motion: a pulse travels the rail and each stage's verdict lands as it passes.
 * The scene is complete and legible before the first frame plays — the withheld
 * chunk is already shown as withheld, every verdict is already on screen — so
 * the animation only decides the ORDER things are noticed in, never whether they
 * are there. That matters more here than anywhere else on the site: this is the
 * section a reader screenshots, and a screenshot catches one frame.
 */

import type { ReactNode } from "react";

type Stage = {
  n: string;
  /** The question this boundary answers, in the reader's words. */
  question: string;
  /** What arrives at this stage. */
  input: ReactNode;
  /** What the check did about it. */
  outcome: ReactNode;
  rule: string;
  verdict: string;
  tone: "hold" | "stop";
  /** What the operator has to have done for this stage to exist. */
  requires: string;
};

const STAGES: Stage[] = [
  {
    n: "01",
    question: "Can it read this?",
    input: (
      <>
        <code className="mk-mono">alex@example.com</code> asks the agent to pull
        everything on a customer. Retrieval returns three chunks.
      </>
    ),
    outcome: (
      <>
        Two come back. <code className="mk-mono">hr/salaries-2026</code> does not —
        no grant gives this person that source, so it never reaches the prompt.
      </>
    ),
    rule: "not_entitled",
    verdict: "withhold",
    tone: "hold",
    requires: "You call the filter from your retrieval code.",
  },
  {
    n: "02",
    question: "Can it answer this?",
    input: (
      <>
        &ldquo;Will this customer&rsquo;s refund definitely be approved?&rdquo; The
        agent holds the refund policy, and the question asks for an outcome.
      </>
    ),
    outcome: (
      <>
        Outside <code className="mk-mono">help-center-articles</code>, so it says
        what it can support and stops there. No model call is made.
      </>
    ),
    rule: "answerable: false",
    verdict: "abstain",
    tone: "hold",
    requires: "You declare a knowledge boundary and set it to enforce.",
  },
  {
    n: "03",
    question: "Can it do this?",
    input: (
      <>
        One retrieved document carries an instruction the model follows:{" "}
        <code className="mk-mono">payments.transfer</code>,{" "}
        <code className="mk-mono">amount: 5000</code>, destination taken from that
        same document.
      </>
    ),
    outcome: (
      <>
        The agent holds no grant for that tool, and the argument&rsquo;s value came
        from tool output. Refused without reading the text that caused it.
      </>
    ),
    rule: "capability.denied",
    verdict: "block",
    tone: "stop",
    requires: "Nothing, on a governed tool path. Containment ships enforcing.",
  },
];

export function BoundarySequence() {
  return (
    <div className="seq">
      {/* The rail sits behind the stages and the pulse travels it, so the reader
          sees one request moving rather than three things that happen to be
          next to each other. Desktop only: stacked on a phone, the numbering
          already carries the sequence and a horizontal rail would be a lie. */}
      <div className="seq-rail" aria-hidden>
        <span className="seq-pulse" />
      </div>

      <ol className="seq-stages">
        {STAGES.map((s, i) => (
          <li
            key={s.n}
            className={s.tone === "stop" ? "seq-stage seq-stage-stop" : "seq-stage"}
            style={{ ["--d" as string]: `${0.5 + i * 0.9}s` }}
          >
            <div className="seq-head">
              <span className="seq-n">{s.n}</span>
              <h3 className="mk-h3">{s.question}</h3>
            </div>

            <p className="seq-in">{s.input}</p>
            <p className="seq-out">{s.outcome}</p>

            <div className="seq-verdict">
              <span className="seq-chip">{s.verdict}</span>
              <code className="mk-mono">{s.rule}</code>
            </div>

            {/* The condition, on the stage it applies to. A copy audit found the
                page implying all three of these happen automatically when only
                the third does. */}
            <p className="seq-req">{s.requires}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
