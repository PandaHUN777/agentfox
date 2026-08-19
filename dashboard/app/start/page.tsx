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
        Six steps from nothing to governed. Only the last one blocks anything — every
        step before it is safe to run without reading further.
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
              <code className="step-cmd">{step.command}</code>
              <div className="small muted">{step.detail}</div>
            </div>
          </li>
        ))}
      </ol>

      <h2>What is connected</h2>
      <div className="cards">
        <Mini n={counts.agents} label="agents" />
        <Mini n={counts.traces} label="traces" />
        <Mini n={counts.decisions} label="decisions" />
        <Mini n={counts.enforcing} label="enforced" />
        <Mini n={counts.boundaries} label="knowledge boundaries" />
        <Mini n={counts.sources} label="tiered sources" />
      </div>

      <div className="note-panel">
        <strong>Why observe mode is the default.</strong> A governance layer that starts
        refusing production traffic because someone added an import is indefensible,
        however correct its policy. Everything is recorded from the first request;
        nothing is refused until you run the last step.
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
