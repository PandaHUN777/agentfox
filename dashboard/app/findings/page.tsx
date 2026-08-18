import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, Severity, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Findings({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ limit: "200", status: sp.status ?? "open" });
  if (sp.severity) qs.set("severity", sp.severity);

  let data: any;
  try {
    data = await api(`/api/findings?${qs}`);
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
        The cross-pillar queue: shadow agents, tool poisoning, stale credentials,
        degraded detectors, drift, silent failures, red-team breaches, chain breaks.
        Everything that needs a human eventually lands here.
      </p>

      <div className="row small" style={{ marginBottom: 14 }}>
        <span className="muted">status:</span>
        <Link href="/findings?status=open">open</Link>
        <Link href="/findings?status=resolved">resolved</Link>
        <Link href="/findings?status=suppressed">suppressed</Link>
        <span className="muted" style={{ marginLeft: 12 }}>severity:</span>
        <Link href="/findings?severity=critical">critical</Link>
        <Link href="/findings?severity=high">high</Link>
        <Link href="/findings?severity=medium">medium</Link>
      </div>

      <div className="panel scroll-x">
        {data.findings.length === 0 ? (
          <div className="body muted small">Nothing here.</div>
        ) : (
          <table>
            <thead>
              <tr><th>severity</th><th>type</th><th>finding</th><th>controls</th><th>raised</th></tr>
            </thead>
            <tbody>
              {data.findings.map((f: any) => (
                <tr key={f.id}>
                  <td><Severity value={f.severity} /></td>
                  <td className="mono small">{f.type}</td>
                  <td className="small wrap">{f.title}</td>
                  <td className="small mono muted">{(f.controls || []).join(" ")}</td>
                  <td className="small muted">{ts(f.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
