import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { AgentLink, ApiDown, Empty, InfoTip, Severity, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * P11 — 31.1% of all catalogued failures, and the one control whose failure is
 * invisible from inside the system. A conversation where the agent kept going
 * instead of handing off looks entirely ordinary in the telemetry.
 */
export default async function Escalation({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; review_error?: string; review_notice?: string }>;
}) {
  const { agent, review_error, review_notice } = await searchParams;
  const agentQs = agent ? `?agent=${encodeURIComponent(agent)}` : "";
  let report: any, missed: any, handoffs: any, agents: any, policy: any;
  try {
    [report, missed, handoffs, agents, policy] = await Promise.all([
      api(`/api/escalation/report${agentQs}`),
      api(`/api/escalation/missed${agentQs}`),
      api(`/api/escalation/handoffs${agentQs}`),
      safeApi("/api/agents", { agents: [] }),
      safeApi("/api/escalation/policy", null),
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
        else asks: which conversations met an escalation condition and never got a
        human? Click any conversation below to see the actual transcript and exactly
        which turn triggered it.
      </p>

      {review_error && <div className="error">{review_error}</div>}
      {review_notice && <div className="note-panel">{review_notice}</div>}

      <form action="/escalation" method="GET" className="chipbar" style={{ marginBottom: 4 }}>
        <span className="chipbar-label">agent:</span>
        <select
          name="agent"
          defaultValue={agent ?? ""}
          style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 12, fontFamily: "inherit" }}
        >
          <option value="">all agents</option>
          {(agents.agents || []).map((a: any) => (
            <option key={a.slug} value={a.slug}>{a.slug}</option>
          ))}
        </select>
        <button type="submit" className="chip" style={{ cursor: "pointer" }}>filter</button>
        {agent && (
          <Link href="/escalation" className="chip">clear agent ×</Link>
        )}
      </form>

      <div className="cards">
        <div
          className={`card ${breaching ? "bad" : "ok"}`}
          title="Of the conversations that qualified for a hand-off (met an escalation condition), the share that never got one."
        >
          <div className="n">{(rate * 100).toFixed(1)}%</div>
          <div className="l">missed-escalation rate {breaching ? "(target &lt; 5%)" : ""}</div>
        </div>
        <div className="card" title="Conversations that met at least one escalation condition in this window, whether or not they actually escalated.">
          <div className="n">{report.qualified_for_escalation}</div>
          <div className="l">conversations that qualified</div>
        </div>
        <div
          className={`card ${report.sla_breached ? "bad" : "ok"}`}
          title="Hand-offs sitting in the queue past their SLA with nobody acknowledging them — see the queue below."
        >
          <div className="n">{report.sla_breached}</div>
          <div className="l">hand-offs past SLA</div>
        </div>
        <div
          className={`card ${report.incomplete_handoffs ? "warn" : "ok"}`}
          title="A hand-off raised without enough context for a human to act on it — the request, a summary, what was tried, why it was blocked, or a customer reference is missing."
        >
          <div className="n">{report.incomplete_handoffs}</div>
          <div className="l">hand-offs missing context</div>
        </div>
        <div
          className={`card ${report.false_resolutions ? "warn" : "ok"}`}
          title="The agent claimed the issue was resolved, but the conversation contradicts it — the user kept going, it declined in the same turn, or closing sentiment was negative."
        >
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
                <th>agent</th>
                <th>turns</th>
                <th>qualified at</th>
                <th>why a human was needed</th>
              </tr>
            </thead>
            <tbody>
              {missed.missed.map((m: any) => (
                <tr key={m.session_id}>
                  <td className="mono small">
                    <Link href={`/escalation/conversations/${encodeURIComponent(m.session_id)}`}>
                      {m.session_id}
                    </Link>
                  </td>
                  <td className="small">
                    {m.agent_slug ? (
                      <AgentLink slug={m.agent_slug} agents={agents.agents || []} />
                    ) : (
                      <span className="muted">unattributed</span>
                    )}
                  </td>
                  <td>{m.turns}</td>
                  <td>turn {m.first_qualifying_turn}</td>
                  <td className="wrap" style={{ maxWidth: 260 }}>
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
      <p className="sub">
        Every row here is a conversation someone has to act on.{" "}
        <InfoTip text="'Completeness' scores whether the hand-off carries enough for a human to act without re-interviewing the user: the original request, a summary, what was already tried, why it was blocked, and a customer reference. Missing any of these is its own failure — the hand-off happened and was still unusable." />
      </p>
      <div className="panel">
        {handoffs.handoffs?.length ? (
          <table>
            <thead>
              <tr>
                <th>conversation</th>
                <th>agent</th>
                <th>status</th>
                <th>owner</th>
                <th>context</th>
                <th>due</th>
                <th>reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {handoffs.handoffs.map((h: any) => (
                <tr key={h.id}>
                  <td className="small">
                    <Link href={`/escalation/conversations/${encodeURIComponent(h.session_id)}`}>
                      {h.summary || h.reason || "Conversation escalated"}
                    </Link>
                    <div className="mono small muted">{h.session_id}</div>
                    {h.session_id?.startsWith("seed-") && (
                      <div>
                        <span
                          className="tag"
                          title="Created by `nometria seed` for demo purposes — not a real conversation."
                        >
                          sample data
                        </span>
                      </div>
                    )}
                    {h.trace_id && (
                      <div>
                        <Link href={`/traces/${h.trace_id}`} className="small">
                          trace
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className="small">
                    {h.agent_slug ? (
                      <AgentLink slug={h.agent_slug} agents={agents.agents || []} />
                    ) : (
                      <span className="muted">unattributed</span>
                    )}
                  </td>
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
                  <td className="small">
                    {h.status === "pending" ? (
                      <form action="/api/escalation/handoffs/acknowledge" method="POST">
                        <input type="hidden" name="id" value={h.id} />
                        <button type="submit" className="chip" style={{ cursor: "pointer" }}>acknowledge</button>
                      </form>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No hand-offs raised.</Empty>
        )}
      </div>

      <h2>
        Escalation policy
        <InfoTip text="What actually qualifies a conversation for a hand-off — org-wide by default. Agent-scoped overrides exist in the API (?agent=slug) but aren't exposed here yet; this edits the default every agent inherits." />
      </h2>
      <p className="sub">
        Every condition below is a signal, not a guarantee — that's why this pillar ships
        observe-first (see the counter-metric above). Fields not present in the JSON fall
        back to the platform default shown as a placeholder.
      </p>
      <form action="/api/escalation/policy" method="POST" className="panel body stack" style={{ maxWidth: 560 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Owner role</label>
            <input
              type="text"
              name="owner_role"
              defaultValue={policy?.owner_role || "support"}
              style={{ width: "100%", padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>SLA (minutes)</label>
            <input
              type="number"
              name="sla_minutes"
              min={1}
              max={10080}
              defaultValue={policy?.sla_minutes ?? 60}
              style={{ width: "100%", padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Mode</label>
            <select
              name="mode"
              defaultValue={policy?.mode || "observe"}
              style={{ width: "100%", padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            >
              <option value="observe">observe</option>
              <option value="enforce">enforce</option>
            </select>
          </div>
        </div>
        <div>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            Conditions (JSON — explicit_request, repeated_failure, repeated_abstention,
            turn_depth, sentiment_below, regulated_topics, confidence_below)
          </label>
          <textarea
            name="conditions"
            defaultValue={JSON.stringify(policy?.conditions || policy?.defaults || {}, null, 2)}
            spellCheck={false}
            rows={9}
            style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.5, padding: 10, borderRadius: 7, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", resize: "vertical" }}
          />
        </div>
        <div>
          <button type="submit" className="btn-primary">Save escalation policy</button>
        </div>
      </form>
    </>
  );
}
