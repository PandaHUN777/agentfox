import { api } from "@/lib/api";
import { ApiDown, Empty, Severity, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * P11 — 31.1% of all catalogued failures, and the one control whose failure is
 * invisible from inside the system. A conversation where the agent kept going
 * instead of handing off looks entirely ordinary in the telemetry.
 */
export default async function Escalation() {
  let report: any, missed: any, handoffs: any;
  try {
    [report, missed, handoffs] = await Promise.all([
      api("/api/escalation/report"),
      api("/api/escalation/missed"),
      api("/api/escalation/handoffs"),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Escalation</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const rate = report.missed_rate ?? 0;
  const breaching = rate > 0.05;

  return (
    <>
      <h1>Escalation</h1>
      <p className="sub">
        Everyone ships the mechanism to escalate. This page answers the question nobody
        else asks: which conversations met an escalation condition and never got a human?
      </p>

      <div className="cards">
        <div className={`card ${breaching ? "bad" : "ok"}`}>
          <div className="n">{(rate * 100).toFixed(1)}%</div>
          <div className="l">missed-escalation rate {breaching ? "(target &lt; 5%)" : ""}</div>
        </div>
        <div className="card">
          <div className="n">{report.qualified_for_escalation}</div>
          <div className="l">conversations that qualified</div>
        </div>
        <div className={`card ${report.sla_breached ? "bad" : "ok"}`}>
          <div className="n">{report.sla_breached}</div>
          <div className="l">hand-offs past SLA</div>
        </div>
        <div className={`card ${report.incomplete_handoffs ? "warn" : "ok"}`}>
          <div className="n">{report.incomplete_handoffs}</div>
          <div className="l">hand-offs missing context</div>
        </div>
        <div className={`card ${report.false_resolutions ? "warn" : "ok"}`}>
          <div className="n">{report.false_resolutions}</div>
          <div className="l">false resolutions</div>
        </div>
      </div>

      <h2>Missed escalations</h2>
      <p className="sub">
        Detected after the fact, because at runtime there is nothing to see — the failure
        is the <em>absence</em> of an event.
      </p>
      <div className="panel">
        {missed.missed?.length ? (
          <table>
            <thead>
              <tr>
                <th>conversation</th>
                <th>turns</th>
                <th>qualified at</th>
                <th>why a human was needed</th>
              </tr>
            </thead>
            <tbody>
              {missed.missed.map((m: any) => (
                <tr key={m.session_id}>
                  <td className="mono">{m.session_id}</td>
                  <td>{m.turns}</td>
                  <td>turn {m.first_qualifying_turn}</td>
                  <td>
                    {m.triggers.slice(0, 2).map((t: any, i: number) => (
                      <div key={i} className="small">
                        <Severity value={t.severity} /> {t.detail}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>
            No missed escalations in the window. Either escalation is working, or no
            conversation has been recorded yet — check <a href="/start">Start here</a>.
          </Empty>
        )}
      </div>

      <h2>Hand-off queue</h2>
      <div className="panel">
        {handoffs.handoffs?.length ? (
          <table>
            <thead>
              <tr>
                <th>status</th>
                <th>owner</th>
                <th>context</th>
                <th>due</th>
                <th>reason</th>
              </tr>
            </thead>
            <tbody>
              {handoffs.handoffs.map((h: any) => (
                <tr key={h.id}>
                  <td>
                    <span className={`tag ${h.status === "breached" ? "bad" : h.status === "resolved" ? "ok" : ""}`}>
                      {h.status}
                    </span>
                    {h.detected_retroactively && <span className="tag warn">retroactive</span>}
                  </td>
                  <td>{h.owner_role}</td>
                  <td>
                    <span className={h.completeness.complete ? "tag ok" : "tag warn"}>
                      {Math.round(h.completeness.score * 100)}%
                    </span>
                    {!h.completeness.complete && (
                      <span className="small muted"> missing {h.completeness.missing.join(", ")}</span>
                    )}
                  </td>
                  <td className="small muted">{ts(h.due_at)}</td>
                  <td className="small">{h.reason?.slice(0, 80)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No hand-offs raised.</Empty>
        )}
      </div>
    </>
  );
}
