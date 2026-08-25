import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The page an evaluator lands on before anything is connected.
 *
 * An empty dashboard is the most common reason a governance tool is abandoned: zero
 * of everything looks identical whether nothing is wrong or nothing is connected,
 * and only one of those is good news. So this is a checklist computed from live
 * data — never a stored "completed" flag, which could disagree with the system.
 */
export default async function Start() {
  let onboarding: any;
  try {
    onboarding = await api("/api/onboarding");
  } catch (e: any) {
    return (
      <>
        <h1>Start here</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const { steps, completed, total, next, counts, connected } = onboarding;

  return (
    <>
      <h1>Start here</h1>
      <p className="sub">
        Fastest path: <Link href="/settings/integrations">connect a GitHub repo, or just
        point us at a hosted API</Link> and let a static scan propose what to govern — or
        instrument your own code with the SDK, whichever fits. One exception to "nothing
        blocks until the last step" below: tool containment (least-privilege action
        control) is on from step 1 by design — see the note under the checklist.
        Codes like <span className="mono">P7</span> below reference this product's own
        numbering — see the <Link href="/glossary">Glossary</Link> if a term doesn't
        explain itself.
      </p>

      <div className="progress-line">
        <div className="progress-track">
          <span style={{ width: `${(completed / total) * 100}%` }} />
        </div>
        <span className="small muted">
          {completed} of {total} done
          {!connected && " · nothing is sending traffic yet"}
        </span>
      </div>

      <ol className="steps">
        {steps.map((step: any, i: number) => (
          <li key={step.id} className={step.done ? "done" : next?.id === step.id ? "now" : ""}>
            <span className="marker">{step.done ? "✓" : i + 1}</span>
            <div className="step-body">
              <div className="step-title">
                {step.title}
                {next?.id === step.id && <span className="tag accent">next</span>}
              </div>
              {step.id === "connect" ? (
                <Link href="/settings/integrations" className="btn-github" style={{ display: "inline-block", marginBottom: 6 }}>
                  {step.done ? "Manage connection" : "Connect →"}
                </Link>
              ) : step.id === "boundary" ? (
                <Link href="/agents" className="cta" style={{ display: "inline-block", marginBottom: 6 }}>
                  {step.done ? "Manage knowledge boundaries →" : "Pick an agent to declare a boundary for →"}
                </Link>
              ) : (
                <code className="step-cmd">{step.command}</code>
              )}
              <div className="small muted">{step.detail}</div>
            </div>
          </li>
        ))}
      </ol>

      <h2>What is connected</h2>
      <div className="cards">
        <Mini n={counts.github_connections} label="github accounts" />
        <Mini n={counts.agents} label="agents" />
        <Mini n={counts.traces} label="traces" />
        <Mini n={counts.decisions} label="decisions" />
        <Mini n={counts.enforcing} label="enforced" />
        <Mini n={counts.boundaries} label="knowledge boundaries" />
        <Mini n={counts.sources} label="tiered sources" />
      </div>

      <div className="note-panel">
        <strong>Why observe mode is the default — with one exception.</strong> A
        governance layer that starts refusing production traffic because someone added
        an import is indefensible, however correct its policy — so the content-based
        policies (prompt injection, PII, safety) start in observe and only enforce once
        you promote them in the last step. <strong>Tool containment is different</strong>:
        it reasons about the action itself (which tool, with what arguments, from what
        provenance), not about prompt text, so it's much less prone to false positives —
        and it ships enforcing from the moment you install, on purpose, because it's the
        one control meant to hold even when everything upstream of it — including a
        content filter — got fooled. See it on the{" "}
        <Link href="/policies">Policies page</Link>.
      </div>

      <div className="note-panel">
        <strong>Not every detector is on by default.</strong> Some (Microsoft Presidio
        for PII, IBM Granite Guardian for safety, NVIDIA NeMo Guardrails, Guardrails AI)
        need extra install steps — a package extra, a self-hosted deployment, or
        licence acceptance — and aren't running in every deployment. Check what's
        actually active for yours on the <Link href="/guardrails">Guardrails page</Link>{" "}
        before assuming step 7 gives you full coverage.
      </div>
    </>
  );
}

function Mini({ n, label }: { n: number; label: string }) {
  return (
    <div className={`card ${n ? "" : "empty"}`}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
  );
}
