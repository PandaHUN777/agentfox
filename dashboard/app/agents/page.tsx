import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, InfoTip, Panel, Stat, ts } from "@/components/ui";
import { Modal } from "@/components/Modal";

export const dynamic = "force-dynamic";

export default async function Agents({
  searchParams,
}: {
  searchParams: Promise<{ review_error?: string }>;
}) {
  const { review_error } = await searchParams;
  let agents: any, shadow: any;
  try {
    [agents, shadow] = await Promise.all([
      api("/api/agents"),
      api("/api/discovery/shadow"),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Agents</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const inv = agents.inventory;
  const drafts = agents.agents.filter((a: any) => a.status === "draft");

  // A repo scan registers one "agent" per directory with governable code in it,
  // including test suites and utility scripts — those aren't things that talk to
  // customers, and listing them next to real production agents with no distinction
  // makes it impossible to tell which of N rows is the one that actually matters.
  const looksLikeTestOrScript = (slug: string) => /(^|-)(tests?|specs?|scripts?|examples?|demo|fixtures?)($|-)/i.test(slug);
  const realAgents = agents.agents.filter((a: any) => !looksLikeTestOrScript(a.slug));
  const testLikeAgents = agents.agents.filter((a: any) => looksLikeTestOrScript(a.slug));

  return (
    <>
      <h1>Agent registry</h1>
      <p className="sub">
        Every agent, its accountable owner and risk tier, and the models and tools it
        actually uses. Lineage is derived from observed execution paths rather than
        self-reported configuration — a registry that only knows what someone typed
        into it is a spreadsheet.
      </p>

      <div className="cards">
        <Stat n={inv.agents} label="agents" />
        <Stat n={inv.registered} label="registered" tone="ok" />
        <Stat
          n={inv.shadow}
          label="shadow"
          tone={inv.shadow ? "bad" : "ok"}
          hint="Seen making calls but never registered here — either through a repo scan or the form below. An agent nobody registered is an agent nobody is accountable for."
        />
        <Stat
          n={inv.unowned}
          label="unowned"
          tone={inv.unowned ? "warn" : "ok"}
          hint="Registered, but with no owner_email set — see the 'unowned — assign' links in the table below."
        />
        <Stat n={inv.tools} label="tools" />
        <Stat
          n={inv.lineage_edges}
          label="lineage edges"
          hint="Observed agent-to-tool and agent-to-model calls, not declared config — this is what actually ran, not what someone typed into a form."
        />
      </div>

      {review_error && <div className="error">{review_error}</div>}

      <div style={{ marginBottom: 16 }}>
        <Modal trigger="+ Register an agent manually" title="Register an agent manually">
          <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
            For an agent that doesn't live in a scanned repo, or hasn't been connected yet — see{" "}
            <Link href="/start?tab=connect">Connect</Link> for the repo-scan path instead.
          </p>
          <form action="/api/agents" method="POST" className="stack">
            <div>
              <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Slug (unique, lowercase)</label>
              <input type="text" name="slug" required placeholder="e.g. billing-support" style={{ width: "100%", padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />
            </div>
            <div>
              <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Name</label>
              <input type="text" name="name" placeholder="e.g. Billing Support Agent" style={{ width: "100%", padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />
            </div>
            <div>
              <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Purpose</label>
              <input type="text" name="purpose" placeholder="e.g. answers billing questions from account history" style={{ width: "100%", padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />
            </div>
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Owner email</label>
                <input type="email" name="owner_email" placeholder="owner@company.com" style={{ width: "100%", padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Risk tier</label>
                <select name="risk_tier" defaultValue="limited" style={{ width: "100%", padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}>
                  <option value="minimal">minimal</option>
                  <option value="limited">limited</option>
                  <option value="high">high</option>
                  <option value="prohibited">prohibited</option>
                </select>
              </div>
            </div>
            <div>
              <button type="submit" className="btn-primary">Register agent</button>
            </div>
          </form>
        </Modal>
      </div>

      {drafts.length > 0 && (
        <>
          <h2>Pending review</h2>
          <Panel
            title="Proposed by a repo scan"
            note="inert until approved — see the Connect tab on Start here"
          >
            <table>
              <thead>
                <tr>
                  <th>agent</th>
                  <th>purpose</th>
                  <th>framework</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((a: any) => (
                  <tr key={a.id}>
                    <td className="mono">{a.slug}</td>
                    <td className="small wrap muted" style={{ maxWidth: 360 }}>
                      {a.purpose || "—"}
                    </td>
                    <td className="small muted">{a.framework || "—"}</td>
                    <td>
                      <div className="review-actions">
                        <form action={`/api/agents/${a.id}/approve`} method="POST">
                          <button type="submit" className="btn-approve">
                            Approve
                          </button>
                        </form>
                        <form action={`/api/agents/${a.id}/reject`} method="POST">
                          <button type="submit" className="btn-reject">
                            Reject
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {shadow.shadow_agents.length > 0 && (
        <>
          <h2>Shadow agents</h2>
          <Panel
            title="Observed but never registered"
            note="detected from traffic, not from a form"
          >
            <table>
              <thead>
                <tr>
                  <th>agent</th>
                  <th>environment</th>
                  <th className="num">calls</th>
                  <th>models</th>
                  <th>framework</th>
                  <th>first seen</th>
                </tr>
              </thead>
              <tbody>
                {shadow.shadow_agents.map((s: any) => (
                  <tr key={s.slug}>
                    <td className="mono">{s.slug}</td>
                    <td className="small">{s.environment}</td>
                    <td className="num">{s.calls}</td>
                    <td className="small muted">{s.models.join(", ") || "—"}</td>
                    <td className="small muted">{s.framework || "—"}</td>
                    <td className="small muted">{ts(s.first_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      <h2>All agents</h2>
      {realAgents.length === 0 ? (
        <div className="body muted small" style={{ marginBottom: 8 }}>
          No agents that look like real, customer-facing code yet.
        </div>
      ) : (
        <div className="panel scroll-x">
          <table>
            <thead>
              <tr>
                <th>agent</th>
                <th>purpose</th>
                <th>owner</th>
                <th>env</th>
                <th>risk</th>
                <th>framework</th>
                <th>
                  last seen
                  <InfoTip text="Timestamp of the most recent traced call from this agent. '—' means no traffic has been recorded for it yet — not that something is broken." />
                </th>
              </tr>
            </thead>
            <tbody>
              {realAgents.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/agents/${a.slug}`}>{a.name || a.slug}</Link>
                    {a.name && <div className="mono small muted">{a.slug}</div>}
                    {a.status === "shadow" && <div><span className="tag bad">shadow</span></div>}
                    {a.status === "draft" && <div><span className="tag warn">draft</span></div>}
                    {a.is_seed && (
                      <div>
                        <span className="tag" title="Created by `nometria seed` for demo purposes — not a real registration.">
                          sample data
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="small wrap muted" style={{ maxWidth: 320 }}>
                    {a.purpose || "—"}
                  </td>
                  <td className="small">
                    {a.owner_email || (
                      <Link href={`/agents/${a.slug}`} className="tag warn">
                        unowned — assign
                      </Link>
                    )}
                  </td>
                  <td className="small">{a.environment}</td>
                  <td>
                    <span className={`tag ${a.risk_tier === "high" || a.risk_tier === "prohibited" ? "bad" : ""}`}>
                      {a.risk_tier}
                    </span>
                  </td>
                  <td className="small muted">{a.framework || "—"}</td>
                  <td className="small muted">{ts(a.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {testLikeAgents.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary className="small muted" style={{ cursor: "pointer" }}>
            {testLikeAgents.length} more that look like internal code (tests, scripts,
            examples) rather than real agents — click to show
          </summary>
          <div className="panel scroll-x" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr><th>agent</th><th>owner</th><th>env</th><th>framework</th><th>last seen</th></tr>
              </thead>
              <tbody>
                {testLikeAgents.map((a: any) => (
                  <tr key={a.id}>
                    <td><Link href={`/agents/${a.slug}`} className="mono small">{a.slug}</Link></td>
                    <td className="small muted">{a.owner_email || "unowned"}</td>
                    <td className="small muted">{a.environment}</td>
                    <td className="small muted">{a.framework || "—"}</td>
                    <td className="small muted">{ts(a.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
