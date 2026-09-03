import Link from "next/link";
import { ApiError, api } from "@/lib/api";
import { ApiDown, ControlChip, InfoTip, NotFound, Panel, Verdict, ts } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { controlTitleMap } from "@/lib/controls";

export const dynamic = "force-dynamic";

export default async function TraceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review_error?: string; review_notice?: string }>;
}) {
  const { id } = await params;
  const { review_error, review_notice } = await searchParams;
  let d: any, controlTitles: Record<string, string>;
  try {
    [d, controlTitles] = await Promise.all([api(`/api/traces/${id}`), controlTitleMap()]);
  } catch (e: any) {
    return (
      <>
        <h1>Trace</h1>
        {e instanceof ApiError && e.status === 404 ? (
          <NotFound what="trace" detail={id} back={{ href: "/traces", label: "Traces" }} />
        ) : (
          <ApiDown error={String(e?.message || e)} />
        )}
      </>
    );
  }

  const t = d.trace;

  return (
    <>
      <Breadcrumbs crumbs={[{ label: "Traces", href: "/traces" }]} />
      <h1>
        {t.intent || "Untitled trace"} <Verdict value={t.verdict} />
      </h1>
      <p className="sub">
        <Link href={`/agents/${t.agent}`}>{t.agent_name || t.agent}</Link> ·{" "}
        {t.environment} · {ts(t.started_at)}
      </p>
      <p className="mono small muted" style={{ marginTop: -8 }}>{t.id}</p>

      {review_error && <div className="error">{review_error}</div>}
      {review_notice && <div className="note-panel">{review_notice}</div>}

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

        <Panel
          title="Argument provenance"
          note={
            <InfoTip text="Where each argument's value actually came from — the user, a retrieved document, a prior tool's result — and how much that source is trusted. A value that arrived from an untrusted source (like a document the agent read) is tracked everywhere it resurfaces, so an irreversible tool can't be handed data that was never actually authorized." />
          }
        >
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
                  <td className="small wrap" style={{ maxWidth: 380 }}>
                    {(x.rules_fired || []).length === 0 ? (
                      <span className="muted">none</span>
                    ) : (
                      x.rules_fired.map((r: any, i: number) => (
                        <div key={i} style={{ marginBottom: 4 }}>
                          <span className="mono">{r.rule_id}</span>{" "}
                          <span className="tag">{r.effect}</span>
                          <div className="muted small">{r.reason}</div>
                          {r.controls?.length > 0 && (
                            <div className="muted" style={{ fontSize: 11 }}>
                              {r.controls.map((c: string) => (
                                <ControlChip key={c} code={c} titles={controlTitles} />
                              ))}
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
              <th>
                was this right?
                <InfoTip text="Filed against the decision this detector run fed — the input to precision reporting and threshold recommendations on the Guardrails page. The alternative to filing it is someone quietly turning the detector off." />
              </th>
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
                <td className="small">
                  {r.decision_id ? (
                    <form action="/api/guardrails/feedback" method="POST" className="row" style={{ gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <input type="hidden" name="decision_id" value={r.decision_id} />
                      <input type="hidden" name="detector_key" value={r.detector} />
                      {r.findings.length === 1 && (
                        <input type="hidden" name="entity_type" value={r.findings[0].entity_type} />
                      )}
                      <input type="hidden" name="return_to" value={`/traces/${t.id}`} />
                      <select
                        name="label"
                        defaultValue=""
                        required
                        style={{ padding: "2px 6px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 11.5 }}
                      >
                        <option value="" disabled>rate this call…</option>
                        <option value="true_positive">correct — true positive</option>
                        <option value="false_positive">wrong — false positive</option>
                        <option value="false_negative">missed something</option>
                      </select>
                      <button type="submit" className="chip" style={{ cursor: "pointer" }}>file feedback</button>
                    </form>
                  ) : (
                    <span className="muted small">not tied to a decision</span>
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
