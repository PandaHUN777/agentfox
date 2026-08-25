import Link from "next/link";
import { ApiError, api, safeApi } from "@/lib/api";
import { AgentLink, ApiDown, NotFound, Severity, findingTypeInfo, ts } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const dynamic = "force-dynamic";

/** True when the evidence attached to this finding still shows the underlying
 * problem — used to warn before letting someone mark it resolved without the
 * numbers actually having changed. */
function stillLooksUnresolved(finding: any): boolean {
  const ev = finding.evidence || {};
  if (typeof ev.posture_score === "number" && ev.posture_score < 1) return true;
  if (typeof ev.attacks_succeeded === "number" && ev.attacks_succeeded > 0) return true;
  return false;
}

function GuardrailDetectionEvidence({ evidence }: { evidence: any }) {
  const detections = evidence.detections || [];
  return (
    <div className="stack">
      <p className="small muted" style={{ marginTop: -4 }}>
        Each excerpt below is masked at the moment the detector runs — enough to show
        what triggered this, never the underlying value. That's already true of every
        detector in this product; this is that same masked sample, just shown here
        instead of only on the trace it happened on.
      </p>
      <div className="row small" style={{ gap: 16 }}>
        <span><span className="muted">surface </span><span className="mono">{evidence.surface || "—"}</span></span>
        <span><span className="muted">verdict </span><span className={`tag ${evidence.verdict === "block" ? "bad" : "warn"}`}>{evidence.verdict}</span></span>
        {evidence.trace_id && (
          <span>
            <Link href={`/traces/${evidence.trace_id}`}>See full detector activity on this trace →</Link>
          </span>
        )}
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr><th>entity</th><th className="num">score</th><th>masked excerpt</th><th>reference</th></tr>
          </thead>
          <tbody>
            {detections.map((d: any, i: number) => (
              <tr key={i}>
                <td className="mono small">{d.entity_type}</td>
                <td className="num small">{d.score?.toFixed?.(2) ?? d.score}</td>
                <td className="mono small wrap" style={{ maxWidth: 360 }}>{d.sample || <span className="muted">—</span>}</td>
                <td className="small muted">
                  {d.owasp_id && <span className="tag" style={{ marginRight: 4 }}>{d.owasp_id}</span>}
                  {d.atlas_id && <span className="tag">{d.atlas_id}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {evidence.reason && <p className="small muted">{evidence.reason}</p>}
    </div>
  );
}

/** Every finding type that doesn't have a bespoke evidence view (most of them —
 * unowned agent, missed hand-off, budget exceeded, model drift, disclosure risk,
 * and a dozen more) used to fall back to a raw JSON dump. This renders the same
 * data as labeled fields instead, so a non-technical reader gets sentences and a
 * list, not a blob of braces and snake_case keys to decode themselves. */
function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function EvidenceValue({ value }: { value: any }) {
  if (value === null || value === undefined || value === "") {
    return <span className="muted">—</span>;
  }
  if (typeof value === "boolean") return <>{value ? "yes" : "no"}</>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="muted">none</span>;
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {value.map((v, i) => (
          <li key={i} className="small">
            {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="stack" style={{ gap: 2 }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="small">
            <span className="muted">{humanizeKey(k)}: </span>
            <EvidenceValue value={v} />
          </div>
        ))}
      </div>
    );
  }
  return <>{String(value)}</>;
}

function GenericEvidence({ evidence }: { evidence: any }) {
  const entries = Object.entries(evidence || {});
  if (entries.length === 0) {
    return <p className="small muted">No further detail was recorded with this finding.</p>;
  }
  return (
    <div className="panel">
      <table>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td className="small muted" style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                {humanizeKey(key)}
              </td>
              <td className="small wrap"><EvidenceValue value={value} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
  let finding: any, agents: any;
  try {
    [finding, agents] = await Promise.all([
      api(`/api/findings/${id}`),
      safeApi("/api/agents", { agents: [] }),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Finding</h1>
        {e instanceof ApiError && e.status === 404 ? (
          <NotFound what="finding" detail={id} back={{ href: "/findings", label: "Findings" }} />
        ) : (
          <ApiDown error={String(e?.message || e)} />
        )}
      </>
    );
  }

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
          <span className="muted">agent </span>
          {finding.agent_slug ? (
            <AgentLink slug={finding.agent_slug} agents={agents.agents || []} />
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
        <>
          {stillLooksUnresolved(finding) && (
            <div className="caveat" style={{ marginBottom: 14 }}>
              <strong>The evidence below still shows the problem.</strong>
              This finding's own numbers (blocked/succeeded, posture) haven't changed
              since it was raised. If you haven't actually fixed the underlying issue,
              use <em>Suppress</em> instead — marking this resolved will make it
              disappear from dashboards as if it were fixed.
            </div>
          )}
          <div className="row" style={{ gap: 8, marginBottom: 20, alignItems: "flex-start" }}>
            <form action={`/api/findings/${id}`} method="POST" className="row" style={{ gap: 6 }}>
              <input type="hidden" name="status" value="resolved" />
              <input
                type="text"
                name="note"
                placeholder="what did you do to fix this? (required)"
                required
                style={{ minWidth: 260, padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
              />
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
          <p className="small muted" style={{ marginTop: -12, marginBottom: 20 }}>
            <strong>Resolved</strong> means the underlying problem is actually fixed.{" "}
            <strong>Suppressed</strong> means you've decided not to act on it right now —
            it stays flagged as a known, accepted issue rather than looking fixed.
          </p>
        </>
      )}
      {finding.status === "suppressed" && (
        <div className="note-panel" style={{ marginBottom: 20 }}>
          <strong>Suppressed (not fixed) by {finding.suppressed_by}</strong>
          {finding.suppression_reason}
        </div>
      )}
      {finding.status === "resolved" && (
        <div className="note-panel" style={{ marginBottom: 20 }}>
          <strong>Resolved by {finding.resolved_by}</strong>
          {finding.resolution_note}
        </div>
      )}

      <h2>What we found</h2>
      {finding.type === "redteam" ? (
        <RedteamEvidence evidence={finding.evidence} />
      ) : finding.type === "guardrail_detection" ? (
        <GuardrailDetectionEvidence evidence={finding.evidence} />
      ) : (
        <GenericEvidence evidence={finding.evidence} />
      )}
    </>
  );
}
