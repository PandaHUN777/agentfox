import { api } from "@/lib/api";
import { ApiDown, DraftCaveat, Panel, Stat, pct } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Board() {
  let v: any;
  try {
    v = await api("/api/board");
  } catch (e: any) {
    return (
      <>
        <h1>Board view</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const inv = v.inventory;
  const f = v.open_findings;

  return (
    <>
      <h1>AI risk posture</h1>
      <p className="sub">
        The up-and-out view: agent population by risk class, control effectiveness,
        open findings, and the regulatory clock. Generated {v.generated_at?.slice(0, 19)}.
      </p>

      <div className="cards">
        <Stat n={inv.agents} label="agents under management" />
        <Stat n={v.high_risk_agents.length} label="high-risk agents" tone={v.high_risk_agents.length ? "warn" : "ok"} />
        <Stat n={inv.shadow} label="ungoverned" tone={inv.shadow ? "bad" : "ok"} />
        <Stat n={v.unassessed_agents.length} label="unassessed" tone={v.unassessed_agents.length ? "warn" : "ok"} />
        <Stat n={f.total} label="open findings" tone={f.by_severity?.critical ? "bad" : f.total ? "warn" : "ok"} />
        <Stat n={pct(v.overall_posture.effectiveness)} label="control effectiveness" />
      </div>

      <div className="grid2" style={{ marginTop: 22 }}>
        <Panel title="Agents by risk class">
          <table>
            <tbody>
              {Object.entries(v.agents_by_risk_class).map(([k, n]: any) => (
                <tr key={k}>
                  <td>
                    <span className={`tag ${k === "high" || k === "prohibited" ? "bad" : ""}`}>{k}</span>
                  </td>
                  <td className="num">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {v.high_risk_agents.length > 0 && (
            <div className="body small muted">
              high-risk: <span className="mono">{v.high_risk_agents.join(", ")}</span>
            </div>
          )}
        </Panel>

        <Panel title="Open findings by severity">
          <table>
            <tbody>
              {Object.entries(f.by_severity || {}).map(([k, n]: any) => (
                <tr key={k}>
                  <td>
                    <span className={`tag ${k === "critical" || k === "high" ? "bad" : k === "medium" ? "warn" : ""}`}>{k}</span>
                  </td>
                  <td className="num">{n}</td>
                </tr>
              ))}
              {Object.keys(f.by_severity || {}).length === 0 && (
                <tr><td className="muted small">none open</td></tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      <h2>Control effectiveness by framework</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr>
              <th>framework</th><th className="num">controls</th><th className="num">effective</th>
              <th className="num">degraded</th><th className="num">failing</th>
              <th className="num">not implemented</th><th className="num">effectiveness</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(v.control_posture).map(([fw, p]: any) => (
              <tr key={fw}>
                <td className="mono small">{fw}</td>
                <td className="num">{p.controls}</td>
                <td className="num"><span className="tag ok">{p.counts.effective}</span></td>
                <td className="num"><span className="tag warn">{p.counts.degraded}</span></td>
                <td className="num">
                  {p.counts.failing ? <span className="tag bad">{p.counts.failing}</span> : "0"}
                </td>
                <td className="num muted">{p.counts.not_implemented}</td>
                <td className="num">{pct(p.effectiveness)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Regulatory clock</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr><th>date</th><th>obligation</th><th>status</th><th className="num">days</th><th className="num">agents in scope</th></tr>
          </thead>
          <tbody>
            {[...v.live_obligations, ...v.upcoming_obligations].map((o: any, i: number) => (
              <tr key={i}>
                <td className="small mono">{(o.effective_date || "").slice(0, 10)}</td>
                <td className="small">
                  {o.title} <span className="muted mono">{o.reference}</span>
                </td>
                <td><span className={`tag ${o.status === "live" ? "ok" : "warn"}`}>{o.status}</span></td>
                <td className="num small muted">{o.days_until > 0 ? o.days_until : "—"}</td>
                <td className="num">{o.agents_in_scope_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DraftCaveat text={v.caveat} />
    </>
  );
}
