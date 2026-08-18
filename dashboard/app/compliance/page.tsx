import { api } from "@/lib/api";
import { ApiDown, ControlStatus, DraftCaveat, Gaps, Panel, Stat, pct } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Compliance() {
  let controls: any, frameworks: any, obligations: any, register: any;
  try {
    [controls, frameworks, obligations, register] = await Promise.all([
      api("/api/controls"),
      api("/api/frameworks"),
      api("/api/obligations"),
      api("/api/risk/register"),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Compliance</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const counts = controls.posture.counts || {};

  return (
    <>
      <h1>Compliance</h1>
      <p className="sub">
        One control set mapped to seven frameworks. Control status is{" "}
        <strong>computed from telemetry</strong> — detector coverage, decision coverage,
        audit-chain verification — not attested on a form. That is a claim only an
        inline, agent-native platform can make.
      </p>

      <DraftCaveat />

      <div className="cards">
        <Stat n={controls.controls.length} label="controls" />
        <Stat n={counts.effective || 0} label="effective" tone="ok" />
        <Stat n={counts.degraded || 0} label="degraded" tone="warn" />
        <Stat n={counts.failing || 0} label="failing" tone={counts.failing ? "bad" : "ok"} />
        <Stat n={pct(controls.posture.effectiveness)} label="effectiveness" />
      </div>

      <h2>Frameworks</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr>
              <th>framework</th><th className="num">controls mapped</th>
              <th className="num">mappings</th><th className="num">reviewed</th><th>status</th>
            </tr>
          </thead>
          <tbody>
            {frameworks.frameworks.map((f: any) => (
              <tr key={f.framework}>
                <td>
                  <div>{f.title}</div>
                  <div className="small muted wrap" style={{ maxWidth: 460 }}>{f.description}</div>
                </td>
                <td className="num">{f.controls_mapped}/{f.controls_total}</td>
                <td className="num">{f.mappings_total}</td>
                <td className="num">{f.mappings_reviewed}</td>
                <td>
                  <span className={`tag ${f.review_status === "reviewed" ? "ok" : "warn"}`}>
                    {f.review_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {frameworks.frameworks.map((f: any) =>
        f.declared_gaps?.length ? (
          <div key={f.framework} style={{ marginTop: 18 }}>
            <h3>{f.title} — declared gaps</h3>
            <ul className="small muted" style={{ marginTop: 0 }}>
              {f.declared_gaps.map((g: string) => <li key={g}>{g}</li>)}
            </ul>
          </div>
        ) : null,
      )}

      <h2>Controls</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr><th>control</th><th>objective</th><th>status</th><th>evidence / rationale</th></tr>
          </thead>
          <tbody>
            {controls.controls.map((c: any) => (
              <tr key={c.key}>
                <td>
                  <div className="mono small">{c.key}</div>
                  <div className="small muted">{c.title}</div>
                  <div className="mono muted" style={{ fontSize: 11 }}>
                    {(c.implemented_by || []).join(" ")}
                  </div>
                </td>
                <td className="small wrap muted" style={{ maxWidth: 330 }}>{c.objective}</td>
                <td><ControlStatus value={c.status} /></td>
                <td className="small wrap muted" style={{ maxWidth: 380 }}>{c.rationale || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Regulatory obligations</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr>
              <th>date</th><th>framework</th><th>obligation</th><th>status</th>
              <th className="num">agents in scope</th><th>build by</th>
            </tr>
          </thead>
          <tbody>
            {obligations.obligations.map((o: any, i: number) => (
              <tr key={i}>
                <td className="small mono">{(o.effective_date || "").slice(0, 10)}</td>
                <td className="small muted">{o.framework}</td>
                <td>
                  <div className="small">{o.title}</div>
                  <div className="small muted wrap" style={{ maxWidth: 400 }}>{o.description}</div>
                </td>
                <td>
                  <span className={`tag ${o.status === "live" ? "ok" : "warn"}`}>{o.status}</span>
                </td>
                <td className="num">{o.agents_in_scope_count}</td>
                <td className="small muted">{(o.target_readiness || "—").slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Risk register</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr><th>agent</th><th>risk tier</th><th>EU class</th><th>residual</th><th>assessor</th><th>next review</th></tr>
          </thead>
          <tbody>
            {register.register.map((r: any) => (
              <tr key={r.agent}>
                <td className="mono small">{r.agent}</td>
                <td><span className={`tag ${r.risk_tier === "high" ? "bad" : ""}`}>{r.risk_tier}</span></td>
                <td className="small">
                  {r.eu_ai_act_class || <span className="tag warn">not assessed</span>}
                </td>
                <td className="small muted">{r.residual_risk || "—"}</td>
                <td className="small muted">{r.assessor || "—"}</td>
                <td className="small muted">
                  {r.review_overdue ? (
                    <span className="tag bad">overdue</span>
                  ) : (r.next_review_at || "—").slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
