import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, Panel, Stat, ts } from "@/components/ui";

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
        <Stat n={inv.shadow} label="shadow" tone={inv.shadow ? "bad" : "ok"} />
        <Stat n={inv.unowned} label="unowned" tone={inv.unowned ? "warn" : "ok"} />
        <Stat n={inv.tools} label="tools" />
        <Stat n={inv.lineage_edges} label="lineage edges" />
      </div>

      {review_error && <div className="error">{review_error}</div>}

      {drafts.length > 0 && (
        <>
          <h2>Pending review</h2>
          <Panel
            title="Proposed by a repo scan"
            note="inert until approved — see /settings/integrations"
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
              <th>last seen</th>
            </tr>
          </thead>
          <tbody>
            {agents.agents.map((a: any) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/agents/${a.slug}`} className="mono">{a.slug}</Link>
                  {a.status === "shadow" && <div><span className="tag bad">shadow</span></div>}
                  {a.status === "draft" && <div><span className="tag warn">draft</span></div>}
                </td>
                <td className="small wrap muted" style={{ maxWidth: 320 }}>
                  {a.purpose || "—"}
                </td>
                <td className="small">
                  {a.owner_email || <span className="tag warn">unowned</span>}
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
    </>
  );
}
