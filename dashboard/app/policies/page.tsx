import { api, safeApi } from "@/lib/api";
import { ApiDown, Panel, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Policies({
  searchParams,
}: {
  searchParams: Promise<{ review_error?: string }>;
}) {
  const { review_error } = await searchParams;
  let policies: any, detectors: any, probes: any;
  try {
    [policies, detectors, probes] = await Promise.all([
      api("/api/policies"),
      safeApi("/api/detectors", { detectors: [], budget_ms: 0, detector_timeout_ms: 0 }),
      safeApi("/api/redteam/probes", { probes: [], runners: {} }),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Policies</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const proposed = policies.policies.filter((p: any) => p.proposed);

  return (
    <>
      <h1>Policy</h1>
      <p className="sub">
        One authored artefact drives both runtime enforcement and compliance
        reporting. Policies ship in <strong>observe</strong> mode: they record what
        they would have done, and promotion to <strong>enforce</strong> is a separate,
        audited act after simulating the change against recorded traffic. A false
        block is how a guardrail gets switched off for good.
      </p>

      {review_error && <div className="error">{review_error}</div>}

      {proposed.length > 0 && (
        <>
          <h2>Pending review</h2>
          <Panel
            title="Proposed by a repo scan"
            note="already in observe mode (blocks nothing) — approve to acknowledge, reject to discard"
          >
            <table>
              <thead>
                <tr>
                  <th>policy</th>
                  <th>description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {proposed.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      <div className="small muted mono">{p.key}</div>
                    </td>
                    <td className="small wrap muted" style={{ maxWidth: 420 }}>
                      {p.description}
                    </td>
                    <td>
                      <div className="review-actions">
                        <form action={`/api/policies/${p.id}/approve`} method="POST">
                          <button type="submit" className="btn-approve">
                            Approve
                          </button>
                        </form>
                        <form action={`/api/policies/${p.id}/reject`} method="POST">
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

      <h2>All policies</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr><th>policy</th><th>description</th><th>version</th><th>mode</th><th className="num">rules</th></tr>
          </thead>
          <tbody>
            {policies.policies.map((p: any) => (
              <tr key={p.key}>
                <td>
                  {p.name}
                  <div className="small muted mono">{p.key}</div>
                  {p.proposed && <div><span className="tag warn">proposed</span></div>}
                </td>
                <td className="small wrap muted" style={{ maxWidth: 420 }}>{p.description}</td>
                <td className="small">v{p.latest_version}</td>
                <td>
                  <span className={`tag ${p.mode === "enforce" ? "ok" : "warn"}`}>
                    {p.mode || "unbound"}
                  </span>
                </td>
                <td className="num">{p.rules}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="small muted" style={{ marginTop: 10 }}>
        Simulate a change before promoting it:{" "}
        <code className="mono">nometria policy simulate -f candidate.yaml</code> — it
        exits non-zero when the change would newly block production traffic.
      </p>

      <h2>Detectors</h2>
      <Panel
        title="Runtime detector pipeline"
        note={`budget ${detectors.budget_ms}ms · per-detector timeout ${detectors.detector_timeout_ms}ms`}
      >
        <table>
          <thead>
            <tr>
              <th>detector</th><th>version</th><th>surfaces</th><th>state</th>
              <th className="num">runs</th><th className="num">avg ms</th><th className="num">max ms</th>
            </tr>
          </thead>
          <tbody>
            {detectors.detectors.map((d: any) => (
              <tr key={d.key}>
                <td className="mono small">{d.key}</td>
                <td className="small muted">{d.version}</td>
                <td className="small muted">{d.surfaces.join(", ")}</td>
                <td>
                  {d.enabled && d.available ? (
                    <span className="tag ok">active</span>
                  ) : d.available ? (
                    <span className="tag">available</span>
                  ) : (
                    <span className="tag warn">not installed</span>
                  )}
                  {d.unavailable_reason && (
                    <div className="small muted wrap" style={{ maxWidth: 280, marginTop: 3 }}>
                      {d.unavailable_reason}
                    </div>
                  )}
                </td>
                <td className="num small">{d.stats?.runs ?? "—"}</td>
                <td className="num small">{d.stats?.avg_ms ?? "—"}</td>
                <td className="num small">{d.stats?.max_ms ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <p className="small muted" style={{ marginTop: 10 }}>
        Detectors that exceed the budget degrade to observe-only for that request and
        raise a finding — a control that quietly stops running while reporting
        effective is the failure mode this measurement exists to prevent.
      </p>

      <h2>Red-team probe suite</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr><th>probe</th><th>category</th><th>surface</th><th>severity</th><th>OWASP</th><th>ATLAS</th></tr>
          </thead>
          <tbody>
            {probes.probes.map((p: any) => (
              <tr key={p.key}>
                <td className="mono small">{p.key}</td>
                <td className="small muted">{p.category}</td>
                <td className="small muted">{p.surface}</td>
                <td><span className={`tag ${p.severity === "critical" ? "bad" : p.severity === "high" ? "bad" : "warn"}`}>{p.severity}</span></td>
                <td className="small mono muted">{p.owasp_id || "—"}</td>
                <td className="small mono muted">{p.atlas_id || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Wrapped runners:{" "}
        {Object.entries(probes.runners || {}).map(([n, ok]) => (
          <span key={n} className={`tag ${ok ? "ok" : ""}`} style={{ marginRight: 6 }}>
            {n}{ok ? "" : " (not installed)"}
          </span>
        ))}
      </p>
    </>
  );
}
