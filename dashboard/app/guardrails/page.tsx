import { api } from "@/lib/api";
import { ApiDown, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * P3-12/13/14 — the tuning surface, which had an API and no page.
 *
 * The question this answers is not "is a detector configured" but "should I trust
 * it, and what is it costing me" — precision beside its sample size, latency as
 * percentiles rather than a mean, and every suppression with an expiry date.
 */
export default async function Guardrails() {
  let detectors: any, latency: any, precision: any, recommendations: any, suppressions: any;
  try {
    [detectors, latency, precision, recommendations, suppressions] = await Promise.all([
      api("/api/detectors"),
      api("/api/guardrails/latency"),
      api("/api/guardrails/precision"),
      api("/api/guardrails/recommendations"),
      api("/api/guardrails/suppressions"),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Guardrails</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const health = suppressions.health || {};
  const degraded = latency.degraded_rate || 0;

  return (
    <>
      <h1>Guardrails</h1>
      <p className="sub">
        Whether the detectors are working, what they cost, and where they are wrong.
        Detection is commoditised — tuning is the part that decides whether anyone
        leaves them switched on.
      </p>

      <div className="cards">
        <div className="card">
          <div className="n">{detectors.detectors.filter((d: any) => d.available).length}</div>
          <div className="l">detectors live</div>
        </div>
        <div className={`card ${degraded > 0.01 ? "warn" : "ok"}`}>
          <div className="n">{(degraded * 100).toFixed(1)}%</div>
          <div className="l">runs degraded or shed</div>
        </div>
        <div className="card">
          <div className="n">{latency.runs}</div>
          <div className="l">detector runs ({latency.window_days}d)</div>
        </div>
        <div className={`card ${health.never_hit?.length ? "warn" : "ok"}`}>
          <div className="n">{health.active || 0}</div>
          <div className="l">active suppressions</div>
        </div>
        <div className={`card ${health.expiring_within_7_days?.length ? "warn" : ""}`}>
          <div className="n">{health.expiring_within_7_days?.length || 0}</div>
          <div className="l">expiring this week</div>
        </div>
      </div>

      <h2>Cost per detector</h2>
      <p className="sub">
        Percentiles, not means. A mean hides the tail, and the tail is what gets a
        governance layer removed for being slow.
      </p>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>detector</th>
              <th>version</th>
              <th>runs</th>
              <th>p50</th>
              <th>p95</th>
              <th>max</th>
            </tr>
          </thead>
          <tbody>
            {detectors.detectors.map((d: any) => {
              const stats = latency.per_detector?.[d.key] || {};
              const slow = (stats.p95_ms || 0) > detectors.detector_timeout_ms;
              return (
                <tr key={d.key}>
                  <td>
                    <span className="mono">{d.key}</span>
                    {!d.available && <span className="tag warn">unavailable</span>}
                    {!d.enabled && <span className="tag">off</span>}
                  </td>
                  <td className="small muted">{d.version}</td>
                  <td className="mono small">{stats.runs ?? 0}</td>
                  <td className="mono small">{stats.p50_ms ?? "—"}</td>
                  <td className={`mono small ${slow ? "bad" : ""}`}>{stats.p95_ms ?? "—"}</td>
                  <td className="mono small">{stats.max_ms ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="body small muted">
          Budget {detectors.budget_ms} ms per call, {detectors.detector_timeout_ms} ms per
          detector.
        </div>
      </div>

      <h2>Are they right?</h2>
      <p className="sub">
        Precision is shown with its denominator. Precision over four labels is noise,
        and publishing it without the sample size is how a tuning surface starts lying.
      </p>
      <div className="panel">
        {Object.keys(precision.detectors || {}).length ? (
          <table>
            <thead>
              <tr>
                <th>detector</th>
                <th>labelled</th>
                <th>false pos</th>
                <th>precision</th>
                <th>recommendation</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(precision.detectors).map(([key, stats]: [string, any]) => {
                const rec = (recommendations.recommendations || []).find(
                  (r: any) => r.detector_key === key
                );
                return (
                  <tr key={key}>
                    <td className="mono">{key}</td>
                    <td className="mono small">
                      {stats.labelled}
                      {!stats.sufficient_sample && (
                        <span className="tag warn">too few</span>
                      )}
                    </td>
                    <td className="mono small">{stats.false_positive}</td>
                    <td className="mono small">
                      {stats.precision === null ? "—" : `${Math.round(stats.precision * 100)}%`}
                    </td>
                    <td className="small">
                      {rec ? (
                        <>
                          <span
                            className={`tag ${
                              rec.action === "raise_threshold"
                                ? "ok"
                                : rec.action === "no_clean_separation"
                                ? "bad"
                                : ""
                            }`}
                          >
                            {rec.action.replace(/_/g, " ")}
                          </span>
                          <div className="muted">{rec.rationale}</div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty>
            No feedback yet. When a detector is wrong, file it — the alternative is
            that somebody turns the detector off instead, and nobody finds out.
          </Empty>
        )}
      </div>

      <h2>Suppressions</h2>
      <p className="sub">
        Every exception expires. A permanent silent exception is indistinguishable from
        a detector that stopped working.
      </p>
      <div className="panel">
        {suppressions.suppressions?.length ? (
          <table>
            <thead>
              <tr>
                <th>detector</th>
                <th>scope</th>
                <th>reason</th>
                <th>hits</th>
                <th>expires</th>
              </tr>
            </thead>
            <tbody>
              {suppressions.suppressions.map((s: any) => (
                <tr key={s.id}>
                  <td className="mono">{s.detector_key}</td>
                  <td className="small">
                    {s.agent}
                    {s.entity_type && <span className="tag">{s.entity_type}</span>}
                  </td>
                  <td className="small muted">{s.reason || "—"}</td>
                  <td className="mono small">
                    {s.hits}
                    {s.hits === 0 && <span className="tag warn">never used</span>}
                  </td>
                  <td className="small muted">
                    {s.expires_at ? s.expires_at.slice(0, 10) : "—"}
                    {!s.active && <span className="tag">inactive</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No suppressions. Every detection is currently acted on.</Empty>
        )}
      </div>
    </>
  );
}
