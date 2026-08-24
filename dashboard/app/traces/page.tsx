import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, Verdict, ts } from "@/components/ui";

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

  let data: any;
  try {
    data = await api(`/api/traces?${qs}`);
  } catch (e: any) {
    return (
      <>
        <h1>Traces</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  return (
    <>
      <h1>Traces</h1>
      <p className="sub">
        Execution paths: every prompt, retrieval, tool call, delegation and guardrail
        decision, correlated into one auditable object. This is the record an auditor
        reads and the substrate policy simulation replays against.
      </p>

      <div className="chipbar">
        <span className="chipbar-label">filter:</span>
        <Link href="/traces" className={`chip${!sp.verdict && !sp.entity_type ? " active" : ""}`}>all</Link>
        <Link href="/traces?verdict=block" className={`chip${sp.verdict === "block" ? " active" : ""}`}>blocked</Link>
        <Link href="/traces?verdict=escalate" className={`chip${sp.verdict === "escalate" ? " active" : ""}`}>escalated</Link>
        <Link href="/traces?entity_type=INJECTION" className={`chip${sp.entity_type === "INJECTION" ? " active" : ""}`}>injection</Link>
        <Link href="/traces?entity_type=PII" className={`chip${sp.entity_type === "PII" ? " active" : ""}`}>PII</Link>
        <Link href="/traces?entity_type=SECRET" className={`chip${sp.entity_type === "SECRET" ? " active" : ""}`}>secrets</Link>
      </div>

      <div className="panel scroll-x">
        {data.traces.length === 0 ? (
          <div className="body muted small">No traces match.</div>
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
                  <td><Link href={`/agents/${t.agent}`} className="mono small">{t.agent}</Link></td>
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
