import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { AgentLink, ApiDown, Verdict, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Traces({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; verdict?: string; entity_type?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ limit: "150" });
  if (sp.agent) qs.set("agent", sp.agent);
  if (sp.verdict) qs.set("verdict", sp.verdict);
  if (sp.entity_type) qs.set("entity_type", sp.entity_type);

  let data: any, agents: any;
  try {
    [data, agents] = await Promise.all([
      api(`/api/traces?${qs}`),
      safeApi("/api/agents", { agents: [] }),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Traces</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const agentQs = sp.agent ? `&agent=${sp.agent}` : "";

  return (
    <>
      <h1>Traces</h1>
      <p className="sub">
        Execution paths: every prompt, retrieval, tool call, delegation and guardrail
        decision, correlated into one auditable object — the full record of what an
        agent actually did on one request, not a summary of it. This is what an
        auditor reads, and what a candidate policy change is replayed against on the{" "}
        <Link href="/policies">Policies</Link> page before it can be promoted.
      </p>

      <div className="chipbar">
        <span className="chipbar-label">filter:</span>
        <Link href={`/traces?${agentQs.replace(/^&/, "")}`} className={`chip${!sp.verdict && !sp.entity_type ? " active" : ""}`}>all</Link>
        <Link href={`/traces?verdict=block${agentQs}`} className={`chip${sp.verdict === "block" ? " active" : ""}`}>blocked</Link>
        <Link href={`/traces?verdict=escalate${agentQs}`} className={`chip${sp.verdict === "escalate" ? " active" : ""}`}>escalated</Link>
        <Link href={`/traces?entity_type=INJECTION${agentQs}`} className={`chip${sp.entity_type === "INJECTION" ? " active" : ""}`}>injection</Link>
        <Link href={`/traces?entity_type=PII${agentQs}`} className={`chip${sp.entity_type === "PII" ? " active" : ""}`}>PII</Link>
        <Link href={`/traces?entity_type=SECRET${agentQs}`} className={`chip${sp.entity_type === "SECRET" ? " active" : ""}`}>secrets</Link>
      </div>
      <form action="/traces" method="GET" className="chipbar" style={{ marginTop: -4 }}>
        <span className="chipbar-label">agent:</span>
        {sp.verdict && <input type="hidden" name="verdict" value={sp.verdict} />}
        {sp.entity_type && <input type="hidden" name="entity_type" value={sp.entity_type} />}
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
          <Link href={`/traces?${sp.verdict ? `verdict=${sp.verdict}` : ""}${sp.entity_type ? `${sp.verdict ? "&" : ""}entity_type=${sp.entity_type}` : ""}`} className="chip">
            clear agent ×
          </Link>
        )}
      </form>

      <div className="panel scroll-x">
        {data.traces.length === 0 ? (
          <div className="body muted small">
            No traces match{sp.agent || sp.verdict || sp.entity_type ? " this filter" : ""}.
            Either nothing has run yet — check <Link href="/start">Start here</Link> — or try
            clearing the filter above.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>trace</th><th>agent</th><th>verdict</th><th>env</th>
                <th>model</th><th>intent</th><th>when</th>
              </tr>
            </thead>
            <tbody>
              {data.traces.map((t: any) => (
                <tr key={t.id}>
                  <td><Link href={`/traces/${t.id}`} className="mono small">{t.id}</Link></td>
                  <td><AgentLink slug={t.agent} agents={agents.agents || []} className="small" /></td>
                  <td><Verdict value={t.verdict} /></td>
                  <td className="small muted">{t.environment}</td>
                  <td className="small muted">{t.model || "—"}</td>
                  <td className="small wrap muted" style={{ maxWidth: 300 }}>{t.intent || "—"}</td>
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
