import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { ApiDown, Panel, Severity, Stat, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AgentDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let posture: any, lineage: any, traces: any, classification: any;
  try {
    [posture, lineage, traces, classification] = await Promise.all([
      api(`/api/agents/${slug}/posture`),
      safeApi(`/api/agents/${slug}/lineage?depth=2`, { nodes: [], links: [], blast_radius: 0 }),
      safeApi(`/api/traces?agent=${slug}&limit=15`, { traces: [] }),
      safeApi(`/api/risk/classify/${slug}`, null),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>{slug}</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const a = posture.agent;

  return (
    <>
      <h1 className="mono">{a.slug}</h1>
      <p className="sub">{a.purpose || "No business purpose recorded."}</p>

      <div className="cards">
        <Stat n={posture.traces} label="execution paths" />
        <Stat n={posture.decisions} label="decisions" />
        <Stat n={posture.blocked} label="blocked" tone={posture.blocked ? "bad" : "ok"} />
        <Stat n={posture.escalated} label="escalated" tone={posture.escalated ? "warn" : "ok"} />
        <Stat n={lineage.blast_radius} label="blast radius" />
      </div>

      <div className="grid2" style={{ marginTop: 22 }}>
        <Panel title="Registration">
          <table>
            <tbody>
              <tr><td className="muted">owner</td><td>{a.owner_email || <span className="tag warn">unowned</span>}</td></tr>
              <tr><td className="muted">team</td><td>{a.owner_team || "—"}</td></tr>
              <tr><td className="muted">environment</td><td>{a.environment}</td></tr>
              <tr><td className="muted">risk tier</td><td><span className="tag">{a.risk_tier}</span></td></tr>
              <tr><td className="muted">framework</td><td>{a.framework || "—"}</td></tr>
              <tr><td className="muted">registered</td><td>{a.registered ? <span className="tag ok">yes</span> : <span className="tag bad">shadow</span>}</td></tr>
              <tr><td className="muted">declared models</td><td className="small mono">{a.declared_models?.join(", ") || "—"}</td></tr>
              <tr><td className="muted">declared tools</td><td className="small mono wrap">{a.declared_tools?.join(", ") || "—"}</td></tr>
              <tr><td className="muted">data classes</td><td className="small">{a.data_classes?.join(", ") || "—"}</td></tr>
              <tr><td className="muted">last seen</td><td className="small muted">{ts(a.last_seen_at)}</td></tr>
            </tbody>
          </table>
        </Panel>

        <Panel
          title="Observed lineage"
          note="derived from execution paths, not config"
        >
          {lineage.links.length === 0 ? (
            <div className="body muted small">No relationships observed yet.</div>
          ) : (
            <table>
              <thead>
                <tr><th>from</th><th>relation</th><th>to</th><th className="num">seen</th></tr>
              </thead>
              <tbody>
                {lineage.links.map((l: any, i: number) => (
                  <tr key={i}>
                    <td className="mono small">{l.source}</td>
                    <td className="small muted">{l.relation}</td>
                    <td className="mono small">{l.target}</td>
                    <td className="num small">{l.observed_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {classification && (
        <>
          <h2>Proposed risk classification</h2>
          <Panel
            title={`EU AI Act — proposed: ${classification.proposed_class}`}
            note={`currently recorded as ${classification.current_class}`}
          >
            <div className="body">
              {classification.signals.length ? (
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {classification.signals.map((s: string) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : (
                <div className="muted small">No elevating signals observed.</div>
              )}
              <div className="caveat" style={{ marginBottom: 0 }}>
                <strong>Requires human confirmation</strong>
                {classification.caveat}
              </div>
            </div>
          </Panel>
        </>
      )}

      {posture.slos?.length > 0 && (
        <>
          <h2>Reliability objectives</h2>
          <div className="panel">
            <table>
              <thead>
                <tr><th>scorer</th><th>objective</th><th className="num">target</th><th className="num">attainment</th><th className="num">error budget</th><th>status</th></tr>
              </thead>
              <tbody>
                {posture.slos.map((s: any) => (
                  <tr key={s.slo_id}>
                    <td className="mono small">{s.scorer}</td>
                    <td className="small wrap">{s.objective || "—"}</td>
                    <td className="num small">{s.target ?? "—"}</td>
                    <td className="num small">{s.attainment ?? "—"}</td>
                    <td className="num small">{s.error_budget_remaining ?? "—"}</td>
                    <td><span className={`tag ${s.status === "healthy" ? "ok" : s.status === "burned" ? "bad" : ""}`}>{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {posture.open_findings?.length > 0 && (
        <>
          <h2>Open findings</h2>
          <div className="panel">
            <table>
              <thead><tr><th>severity</th><th>type</th><th>finding</th></tr></thead>
              <tbody>
                {posture.open_findings.map((f: any) => (
                  <tr key={f.id}>
                    <td><Severity value={f.severity} /></td>
                    <td className="mono small">{f.type}</td>
                    <td className="small wrap">{f.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Recent execution paths</h2>
      <div className="panel">
        {traces.traces.length === 0 ? (
          <div className="body muted small">No traffic recorded.</div>
        ) : (
          <table>
            <thead><tr><th>trace</th><th>verdict</th><th>model</th><th>intent</th><th>when</th></tr></thead>
            <tbody>
              {traces.traces.map((t: any) => (
                <tr key={t.id}>
                  <td><Link href={`/traces/${t.id}`} className="mono small">{t.id}</Link></td>
                  <td><span className={`tag ${t.verdict === "block" ? "bad" : t.verdict === "allow" ? "ok" : "warn"}`}>{t.verdict}</span></td>
                  <td className="small muted">{t.model || "—"}</td>
                  <td className="small wrap muted" style={{ maxWidth: 280 }}>{t.intent || "—"}</td>
                  <td className="small muted">{ts(t.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
