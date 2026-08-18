import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, Panel, Verdict, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TraceDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let d: any;
  try {
    d = await api(`/api/traces/${id}`);
  } catch (e: any) {
    return (
      <>
        <h1>Trace</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const t = d.trace;

  return (
    <>
      <h1 className="mono" style={{ fontSize: 17 }}>{t.id}</h1>
      <p className="sub">
        <Link href={`/agents/${t.agent}`} className="mono">{t.agent}</Link> ·{" "}
        {t.environment} · {ts(t.started_at)} · <Verdict value={t.verdict} />
      </p>

      {t.intent && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="body small">
            <span className="muted">declared intent: </span>
            {t.intent}
          </div>
        </div>
      )}

      <div className="grid2">
        <Panel title="Span timeline" note={`${d.spans.length} spans`}>
          <div className="body span-tree">
            {d.spans.map((s: any) => (
              <div className="line" key={s.id}>
                <span className="kind">{s.kind}</span>
                <span>{s.name}</span>
                <span className="dur">{s.duration_ms?.toFixed(1)}ms</span>
              </div>
            ))}
            {d.spans.length === 0 && <span className="muted">no spans</span>}
          </div>
        </Panel>

        <Panel title="Argument provenance" note="taint tracking (P3-4)">
          {d.taint.length === 0 ? (
            <div className="body muted small">Nothing tainted.</div>
          ) : (
            <table>
              <thead><tr><th>path</th><th>source</th><th>trust</th></tr></thead>
              <tbody>
                {d.taint.map((x: any, i: number) => (
                  <tr key={i}>
                    <td className="mono small wrap">{x.path}</td>
                    <td className="small">{x.source}</td>
                    <td>
                      <span className={`tag ${x.trust === "untrusted" ? "warn" : "ok"}`}>
                        {x.trust}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <h2>Decisions</h2>
      <div className="panel scroll-x">
        {d.decisions.length === 0 ? (
          <div className="body muted small">No decisions recorded.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>surface</th><th>tool</th><th>verdict</th><th>mode</th>
                <th>rules fired</th><th className="num">latency</th>
              </tr>
            </thead>
            <tbody>
              {d.decisions.map((x: any) => (
                <tr key={x.id}>
                  <td className="small">{x.surface}</td>
                  <td className="mono small">{x.tool || "—"}</td>
                  <td><Verdict value={x.verdict} /></td>
                  <td className="small muted">{x.mode}</td>
                  <td className="small wrap">
                    {(x.rules_fired || []).length === 0 ? (
                      <span className="muted">none</span>
                    ) : (
                      x.rules_fired.map((r: any, i: number) => (
                        <div key={i} style={{ marginBottom: 4 }}>
                          <span className="mono">{r.rule_id}</span>{" "}
                          <span className="tag">{r.effect}</span>
                          <div className="muted small">{r.reason}</div>
                          {r.controls?.length > 0 && (
                            <div className="mono muted" style={{ fontSize: 11 }}>
                              {r.controls.join(" ")}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </td>
                  <td className="num small muted">{x.latency_ms?.toFixed(1)}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Detector runs</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr>
              <th>detector</th><th>surface</th><th>status</th>
              <th className="num">score</th><th className="num">ms</th><th>findings</th>
            </tr>
          </thead>
          <tbody>
            {d.detector_runs.map((r: any) => (
              <tr key={r.id}>
                <td className="mono small">{r.detector}</td>
                <td className="small muted">{r.surface}</td>
                <td>
                  <span className={`tag ${r.status === "ok" ? "ok" : "warn"}`}>{r.status}</span>
                </td>
                <td className="num small">{r.score?.toFixed(2)}</td>
                <td className="num small muted">{r.duration_ms?.toFixed(2)}</td>
                <td className="small wrap">
                  {r.findings.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    r.findings.map((f: any, i: number) => (
                      <div key={i}>
                        <span className="mono">{f.entity_type}</span>{" "}
                        <span className="muted">{f.score?.toFixed(2)}</span>{" "}
                        {f.owasp_id && <span className="tag">{f.owasp_id}</span>}
                        <div className="muted mono" style={{ fontSize: 11 }}>{f.sample}</div>
                      </div>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Detector samples are redacted at capture — entity type, location and a masked
        excerpt, never the underlying value. The audit log must not become a new
        liability.
      </p>
    </>
  );
}
