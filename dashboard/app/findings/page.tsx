import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { ApiDown } from "@/components/ui";
import { ExpandableFindingRow } from "@/components/ExpandableFindingRow";

export const dynamic = "force-dynamic";

export default async function Findings({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; agent?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ limit: "200", status: sp.status ?? "open" });
  if (sp.severity) qs.set("severity", sp.severity);
  if (sp.agent) qs.set("agent", sp.agent);

  let data: any, agents: any;
  try {
    [data, agents] = await Promise.all([
      api(`/api/findings?${qs}`),
      safeApi("/api/agents", { agents: [] }),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Findings</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  return (
    <>
      <h1>Findings</h1>
      <p className="sub">
        Every problem this product detected, ranked by severity — security failures,
        missing owners, drifted models, broken hand-offs, and more. See what kind of
        problem each one is in the type column below.
      </p>

      <div className="chipbar">
        <span className="chipbar-label">status:</span>
        {["open", "resolved", "suppressed"].map((s) => (
          <Link
            key={s}
            href={`/findings?status=${s}${sp.severity ? `&severity=${sp.severity}` : ""}${sp.agent ? `&agent=${sp.agent}` : ""}`}
            className={`chip${(sp.status ?? "open") === s ? " active" : ""}`}
          >
            {s}
          </Link>
        ))}
        <span className="chipbar-label" style={{ marginLeft: 10 }}>severity:</span>
        {["critical", "high", "medium", "low"].map((s) => (
          <Link
            key={s}
            href={`/findings?status=${sp.status ?? "open"}&severity=${s}${sp.agent ? `&agent=${sp.agent}` : ""}`}
            className={`chip${sp.severity === s ? " active" : ""}`}
          >
            {s}
          </Link>
        ))}
        {sp.severity && (
          <Link href={`/findings?status=${sp.status ?? "open"}${sp.agent ? `&agent=${sp.agent}` : ""}`} className="chip">
            clear severity ×
          </Link>
        )}
      </div>
      <form action="/findings" method="GET" className="chipbar" style={{ marginTop: -4 }}>
        <span className="chipbar-label">agent:</span>
        <input type="hidden" name="status" value={sp.status ?? "open"} />
        {sp.severity && <input type="hidden" name="severity" value={sp.severity} />}
        <select
          name="agent"
          defaultValue={sp.agent ?? ""}
          style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 12, fontFamily: "inherit" }}
        >
          <option value="">all agents</option>
          {(agents.agents || []).map((a: any) => (
            <option key={a.slug} value={a.slug}>{a.slug}</option>
          ))}
        </select>
        <button type="submit" className="chip" style={{ cursor: "pointer" }}>filter</button>
        {sp.agent && (
          <Link href={`/findings?status=${sp.status ?? "open"}${sp.severity ? `&severity=${sp.severity}` : ""}`} className="chip">
            clear agent ×
          </Link>
        )}
      </form>
      <div className="legend">
        <span className="legend-item"><span className="legend-swatch bad" /> critical / high severity</span>
        <span className="legend-item"><span className="legend-swatch warn" /> medium severity</span>
        <span className="legend-item"><span className="legend-swatch dim" /> low severity</span>
      </div>

      <div className="panel scroll-x">
        {data.findings.length === 0 ? (
          <div className="body muted small">
            No findings match. Either nothing has tripped a detector, or no traffic has been
            recorded yet — check <Link href="/start">Start here</Link>.
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>severity</th><th>agent</th><th>type</th><th>finding</th><th>controls</th><th>raised</th></tr>
            </thead>
            <tbody>
              {data.findings.map((f: any) => (
                <ExpandableFindingRow key={f.id} finding={f} agents={agents.agents || []} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
