import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, Severity, findingTypeInfo, ts } from "@/components/ui";

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
        Every problem this product detected, ranked by severity — security failures,
        missing owners, drifted models, broken hand-offs, and more. See what kind of
        problem each one is in the type column below.
      </p>

      <div className="chipbar">
        <span className="chipbar-label">status:</span>
        {["open", "resolved", "suppressed"].map((s) => (
          <Link key={s} href={`/findings?status=${s}${sp.severity ? `&severity=${sp.severity}` : ""}`} className={`chip${(sp.status ?? "open") === s ? " active" : ""}`}>
            {s}
          </Link>
        ))}
        <span className="chipbar-label" style={{ marginLeft: 10 }}>severity:</span>
        {["critical", "high", "medium"].map((s) => (
          <Link key={s} href={`/findings?status=${sp.status ?? "open"}&severity=${s}`} className={`chip${sp.severity === s ? " active" : ""}`}>
            {s}
          </Link>
        ))}
        {sp.severity && (
          <Link href={`/findings?status=${sp.status ?? "open"}`} className="chip">
            clear severity ×
          </Link>
        )}
      </div>
      <div className="legend">
        <span className="legend-item"><span className="legend-swatch bad" /> critical / high severity</span>
        <span className="legend-item"><span className="legend-swatch warn" /> medium severity</span>
        <span className="legend-item"><span className="legend-swatch dim" /> low severity</span>
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
              {data.findings.map((f: any) => {
                const typeInfo = findingTypeInfo(f.type);
                return (
                  <tr key={f.id}>
                    <td><Severity value={f.severity} /></td>
                    <td className="small">{typeInfo.label}</td>
                    <td className="small wrap">
                      <Link href={`/findings/${f.id}`}>{f.title}</Link>
                      {typeInfo.blurb && <div className="small muted">{typeInfo.blurb}</div>}
                    </td>
                    <td className="small mono">
                      {(f.controls || []).map((c: string) => (
                        <Link key={c} href={`/compliance#${c}`} className="muted" style={{ marginRight: 6 }}>
                          {c}
                        </Link>
                      ))}
                    </td>
                    <td className="small muted">{ts(f.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
