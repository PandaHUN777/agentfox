import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, Panel, Severity, findingTypeInfo, ts } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const dynamic = "force-dynamic";

function RedteamEvidence({ evidence }: { evidence: any }) {
  const byCategory = evidence.by_category || {};
  return (
    <div className="stack">
      <div className="cards">
        <div className="card">
          <div className="n">{evidence.probes_run ?? "—"}</div>
          <div className="l">probes run</div>
        </div>
        <div className="card ok">
          <div className="n">{evidence.attacks_blocked ?? "—"}</div>
          <div className="l">blocked</div>
        </div>
        <div className="card bad">
          <div className="n">{evidence.attacks_succeeded ?? "—"}</div>
          <div className="l">got through</div>
        </div>
        <div className="card">
          <div className="n">
            {evidence.posture_score !== undefined ? `${Math.round(evidence.posture_score * 100)}%` : "—"}
          </div>
          <div className="l">posture</div>
        </div>
      </div>

      {Object.keys(byCategory).length > 0 && (
        <div className="panel">
          <div className="head">By category</div>
          <table>
            <thead>
              <tr><th>category</th><th className="num">run</th><th className="num">blocked</th><th className="num">succeeded</th></tr>
            </thead>
            <tbody>
              {Object.entries(byCategory).map(([cat, v]: [string, any]) => (
                <tr key={cat}>
                  <td className="small">{cat}</td>
                  <td className="num small">{v.run}</td>
                  <td className="num small">{v.blocked}</td>
                  <td className="num small">{v.succeeded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(evidence.critical_breaches || []).length > 0 && (
        <div>
          <h3>Critical breaches</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {evidence.critical_breaches.map((p: string) => (
              <li key={p} className="mono">{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function FindingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review_error?: string }>;
}) {
  const { id } = await params;
  const { review_error } = await searchParams;
  let finding: any;
  try {
    finding = await api(`/api/findings/${id}`);
  } catch (e: any) {
    return (
      <>
        <h1>Finding</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const subjectLink =
    finding.subject_type === "agent" && finding.subject_id ? `/agents/${finding.subject_id}` : null;

  return (
    <>
      <Breadcrumbs crumbs={[{ label: "Findings", href: "/findings" }]} />
      <h1 className="wrap">{finding.title}</h1>
      <p className="sub">
        <Severity value={finding.severity} />{" "}
        <span className="small muted">{findingTypeInfo(finding.type).label}</span>{" "}
        <span className="small muted">raised {ts(finding.created_at)}</span>
      </p>
      {findingTypeInfo(finding.type).blurb && (
        <p className="small muted" style={{ marginTop: -16, marginBottom: 18 }}>
          {findingTypeInfo(finding.type).blurb}
        </p>
      )}

      {review_error && <div className="error">{review_error}</div>}

      <div className="row small" style={{ marginBottom: 14, gap: 16 }}>
        <span>
          <span className="muted">status </span>
          <span className={`tag ${finding.status === "open" ? "warn" : finding.status === "resolved" ? "ok" : ""}`}>
            {finding.status}
          </span>
        </span>
        <span>
          <span className="muted">subject </span>
          {subjectLink ? (
            <Link href={subjectLink} className="mono">{finding.subject_id}</Link>
          ) : (
            <span className="mono">{finding.subject_id || "—"}</span>
          )}
        </span>
        {finding.controls?.length > 0 && (
          <span>
            <span className="muted">controls </span>
            {finding.controls.map((c: string) => (
              <Link key={c} href={`/compliance#${c}`} className="mono" style={{ marginRight: 6 }}>
                {c}
              </Link>
            ))}
          </span>
        )}
      </div>

      {finding.status === "open" && (
        <div className="row" style={{ gap: 8, marginBottom: 20 }}>
          <form action={`/api/findings/${id}`} method="POST">
            <input type="hidden" name="status" value="resolved" />
            <button type="submit" className="btn-approve">Mark resolved</button>
          </form>
          <form action={`/api/findings/${id}`} method="POST" className="row" style={{ gap: 6 }}>
            <input type="hidden" name="status" value="suppressed" />
            <input
              type="text"
              name="suppression_reason"
              placeholder="reason for suppressing (required)"
              required
              style={{ minWidth: 260, padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            />
            <button type="submit" className="btn-reject">Suppress</button>
          </form>
        </div>
      )}
      {finding.status === "suppressed" && (
        <div className="note-panel" style={{ marginBottom: 20 }}>
          <strong>Suppressed by {finding.suppressed_by}</strong>
          {finding.suppression_reason}
        </div>
      )}

      <h2>Evidence</h2>
      {finding.type === "redteam" ? (
        <RedteamEvidence evidence={finding.evidence} />
      ) : (
        <Panel title="Raw evidence">
          <pre className="small" style={{ margin: 0, padding: 14 }}>
            {JSON.stringify(finding.evidence, null, 2)}
          </pre>
        </Panel>
      )}
    </>
  );
}
