import Link from "next/link";

/** Every finding type that doesn't have a bespoke evidence view (most of them —
 * unowned agent, missed hand-off, budget exceeded, model drift, disclosure risk,
 * and a dozen more) used to fall back to a raw JSON dump. This renders the same
 * data as labeled fields instead, so a non-technical reader gets sentences and a
 * list, not a blob of braces and snake_case keys to decode themselves. */
export function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function EvidenceValue({ value }: { value: any }) {
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

export function GenericEvidence({ evidence }: { evidence: any }) {
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
              <td className="small wrap" style={{ maxWidth: 460 }}><EvidenceValue value={value} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuardrailDetectionEvidence({ evidence }: { evidence: any }) {
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
            <Link href={`/app/traces/${evidence.trace_id}`}>See full detector activity on this trace →</Link>
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

export function RedteamEvidence({ evidence }: { evidence: any }) {
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

      {evidence.probes?.length > 0 ? (
        <div>
          <h3>Every prompt tried</h3>
          <p className="small muted" style={{ marginTop: -4 }}>
            The literal text sent through this agent's enforcement path for each
            probe — read it yourself rather than trusting the posture score above.
          </p>
          <div className="panel scroll-x">
            <table>
              <thead>
                <tr>
                  <th>probe</th>
                  <th>prompt tried</th>
                  <th>verdict</th>
                  <th>result</th>
                </tr>
              </thead>
              <tbody>
                {evidence.probes.map((p: any) => (
                  <tr key={p.key}>
                    <td className="small">
                      <span className="mono">{p.key}</span>
                      <div className="muted">{p.category}</div>
                    </td>
                    <td className="small mono wrap" style={{ maxWidth: 420 }}>{p.payload}</td>
                    <td className="small">
                      <span className={`tag ${p.verdict === "allow" ? "" : "warn"}`}>{p.verdict}</span>
                    </td>
                    <td className="small">
                      <span className={`tag ${p.succeeded ? "bad" : "ok"}`}>
                        {p.succeeded ? "got through" : "blocked"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        (evidence.critical_breaches || []).length > 0 && (
          <div>
            <h3>Critical breaches</h3>
            <p className="small muted" style={{ marginTop: -4 }}>
              This campaign ran before prompts were recorded per finding — only the
              probe names survived, not the text tried. Re-run the campaign to see
              the actual prompts here.
            </p>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {evidence.critical_breaches.map((p: string) => (
                <li key={p} className="mono">{p}</li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

export function FindingEvidence({ finding }: { finding: any }) {
  if (finding.type === "redteam") return <RedteamEvidence evidence={finding.evidence} />;
  if (finding.type === "guardrail_detection") return <GuardrailDetectionEvidence evidence={finding.evidence} />;
  return <GenericEvidence evidence={finding.evidence} />;
}
