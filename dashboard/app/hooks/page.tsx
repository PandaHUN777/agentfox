/**
 * /hooks — the coding-agent page.
 *
 * It did not exist, which was the clearest hole in the site: the hook is the
 * thing a reader can install in one command, it is the only control point
 * where we have evidence nobody else publishes, and a competitor shipped
 * theirs the day before this page was written.
 *
 * The page is built around one table. Not the feature list — the *capability*
 * table, which says per event whether a refusal actually stops anything and
 * how we know. Every competitor page in this category claims enforcement and
 * none of them says which of its hook points is a gate and which is a
 * bystander. That difference is the page.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { MarketingNav, REPO } from "@/components/marketing/nav";
import { CTA, Footer } from "@/components/marketing/sections";
import { publicPageMetadata } from "@/lib/site";

export const metadata: Metadata = publicPageMetadata({
  title: "Govern your coding agent",
  description:
    "Three hook points in Claude Code, and a straight answer about which of them can actually stop a call. Probed against a live session, not read off a docs page.",
  path: "/hooks",
});

/**
 * Each row mirrors `src/agentfox/hooks/capability.py` exactly — the same
 * capability, the same evidence class, the same version. That file is the
 * source of truth and this page must never drift from it, which is why the
 * wording here is copied rather than paraphrased.
 */
const EVENTS = [
  {
    event: "UserPromptSubmit",
    sees: "The turn you just submitted",
    verdict: "Stops it",
    blocks: true,
    detail:
      "A refusal returns before the turn is sent, so the model never sees it. Most often this catches a pasted stack trace or issue body carrying something the person did not read.",
    evidence: "Read in the shipped bundle",
    why: "This event fires on your submission, and nothing running inside an agent's turn can trigger it. Weaker evidence than a probe, and the row says so.",
  },
  {
    event: "PreToolUse",
    sees: "The call about to run",
    verdict: "Stops it",
    blocks: true,
    detail:
      "The command does not run and the reason reaches the agent verbatim. This event can also rewrite the call — strip the credential, bound the unbounded statement — rather than only refuse it.",
    evidence: "Probed against a live session",
    why: "A hook denied one sentinel string and allowed everything else, so the session stayed usable while the deny path was exercised for real.",
  },
  {
    event: "PostToolUse",
    sees: "What the tool returned",
    verdict: "Cannot stop it",
    blocks: false,
    detail:
      "By the time this fires the call has already run. What a refusal does buy is real and smaller: the model is told, in the same turn, that the result it is holding is untrusted before it acts on it.",
    evidence: "Probed against a live session",
    why: "We emitted a block on a shell call and the command's own output came back anyway. The harness calls this event blocking; it is not, and we would rather say so than inherit its vocabulary.",
  },
] as const;

/** Why the second event is the one that matters, in three beats. */
const WHY_RESULTS = [
  ["The agent fetches an issue", "gh issue view 412 — an ordinary call, nothing to refuse"],
  ["The comment contains a directive", "addressed to the model, not to you"],
  ["A tool-call-only hook saw nothing", "the poison is in the result, not the request"],
];

export default function HooksPage() {
  return (
    <div className="mk">
      <MarketingNav />
      <main>
        <section className="mk-section">
          <div className="mk-wrap mk-narrow">
            <p className="mk-kicker">Claude Code</p>
            <h1 className="mk-h1" style={{ marginTop: 14 }}>
              Govern the agent <em>on your machine</em>
            </h1>
            <p className="mk-lede" style={{ marginTop: 20 }}>
              Two commands. Three checkpoints. And a straight answer about which of
              them can actually stop a call.
            </p>
            <div className="mk-code-block" style={{ marginTop: 28 }}>
              <code>agentfox hooks daemon</code>
              <code>agentfox hooks install --agent my-agent --write</code>
            </div>
            <p className="mk-fine" style={{ marginTop: 14 }}>
              Dry by default — it prints what it would write and waits to be told twice.
            </p>
          </div>
        </section>

        <section className="mk-section mk-band mk-reveal">
          <div className="mk-wrap">
            <div className="mk-narrow">
              <h2 className="mk-h2">Three checkpoints, and they are not equal</h2>
              <p className="mk-lede" style={{ marginTop: 16 }}>
                Every product in this category claims enforcement at a hook. None of
                them tells you which hook is a gate and which is a bystander.
              </p>
            </div>

            <div className="hk-events mk-stagger">
              {EVENTS.map((row) => (
                <div
                  key={row.event}
                  className={row.blocks ? "hk-event" : "hk-event hk-event-observe"}
                >
                  <div className="hk-event-head">
                    <code>{row.event}</code>
                    <span className={row.blocks ? "hk-verdict hk-blocks" : "hk-verdict"}>
                      {row.verdict}
                    </span>
                  </div>
                  <p className="hk-sees">{row.sees}</p>
                  <p className="hk-detail">{row.detail}</p>
                  <p className="hk-evidence">
                    <b>{row.evidence}</b> · Claude Code 2.1.220
                  </p>
                  <p className="hk-why">{row.why}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-reveal">
          <div className="mk-wrap">
            <div className="mk-narrow">
              <h2 className="mk-h2">The one a tool-call hook cannot see</h2>
              <p className="mk-lede" style={{ marginTop: 16 }}>
                Most guardrails watch the request. The attack arrives in the answer.
              </p>
            </div>
            <ol className="hk-beats mk-stagger">
              {WHY_RESULTS.map(([beat, note], i) => (
                <li key={beat}>
                  <span className="hk-beat-n">{i + 1}</span>
                  <b>{beat}</b>
                  <span className="hk-beat-note">{note}</span>
                </li>
              ))}
            </ol>
            <p className="mk-body" style={{ marginTop: 32, maxWidth: "58ch" }}>
              So <code>PostToolUse</code> evaluates the result on the{" "}
              <code>tool_result</code> surface, with the taint propagated: an argument
              later derived from that text cannot exceed the ceiling for
              tool-sourced data, whatever the model decided in between.
            </p>
          </div>
        </section>

        <section className="mk-section mk-band mk-reveal">
          <div className="mk-wrap mk-narrow">
            <h2 className="mk-h2">Turn on the pack built for this</h2>
            <p className="mk-lede" style={{ marginTop: 16 }}>
              Not a standard — a job. A coding agent&rsquo;s inputs are diffs, stack
              traces and JSON, so instruction-shaped English arriving in a tool result
              is far more anomalous here than in a support agent&rsquo;s mailbox, and
              is caught at a threshold that would be intolerable there.
            </p>
            <div className="mk-code-block" style={{ marginTop: 24 }}>
              <code>agentfox policy observe coding-agent</code>
            </div>
            <p className="mk-fine" style={{ marginTop: 14 }}>
              Observe first. It records the verdict it would have returned against
              every real call, and changes nothing until you promote it.
            </p>
          </div>
        </section>

        <section className="mk-section mk-reveal">
          <div className="mk-wrap">
            <div className="mk-honest">
              <div>
                <h2 className="mk-h3">What a hook is not</h2>
                <p className="mk-body">
                  It governs the agent on this machine. Anything not going through this
                  harness is not going through this — and a session that runs in the
                  vendor&rsquo;s cloud rather than on your laptop is not visible to it
                  at all. One harness is probed; the others have no row.
                </p>
              </div>
              <Link href="/coverage" className="mk-btn mk-btn-outline">
                See the gaps
              </Link>
            </div>
            <p className="mk-fine" style={{ marginTop: 22 }}>
              Every claim on this page comes from{" "}
              <a
                href={`${REPO}/blob/main/src/agentfox/hooks/capability.py`}
                target="_blank"
                rel="noreferrer"
              >
                hooks/capability.py
              </a>
              , where an event nobody has checked has no row rather than a plausible
              one.
            </p>
          </div>
        </section>
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
