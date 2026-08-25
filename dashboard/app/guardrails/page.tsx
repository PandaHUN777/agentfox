import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { ApiDown, Empty, InfoTip, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * P3-12/13/14 — the tuning surface, which had an API and no page.
 *
 * The question this answers is not "is a detector configured" but "should I trust
 * it, and what is it costing me" — precision beside its sample size, latency as
 * percentiles rather than a mean, and every suppression with an expiry date.
 */
export default async function Guardrails({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; review_error?: string; review_notice?: string }>;
}) {
  const { agent, review_error, review_notice } = await searchParams;
  const agentQs = agent ? `agent=${encodeURIComponent(agent)}` : "";
  let detectors: any, latency: any, precision: any, recommendations: any, suppressions: any, agents: any, feedback: any;
  try {
    [detectors, latency, precision, recommendations, suppressions, agents, feedback] = await Promise.all([
      api("/api/detectors"),
      api(`/api/guardrails/latency?${agentQs}`),
      api(`/api/guardrails/precision?${agentQs}`),
      api("/api/guardrails/recommendations"),
      api(`/api/guardrails/suppressions?${agentQs}`),
      safeApi("/api/agents", { agents: [] }),
      api("/api/guardrails/feedback?limit=50"),
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
        Guardrails are the automated checks that run on every message an agent sends
        or receives — catching things like a leaked password, a manipulated prompt,
        or an unsafe answer before a person sees it. This page is for tuning them:
        are they actually catching real problems, are they slowing agents down, and
        are any of them wrong often enough that someone quietly turned them off (a
        "suppression," below) — which is worth knowing, since a check nobody trusts
        might as well not exist.
      </p>

      {review_error && <div className="error">{review_error}</div>}
      {review_notice && <div className="note-panel">{review_notice}</div>}

      <form action="/guardrails" method="GET" className="chipbar" style={{ marginBottom: 4 }}>
        <span className="chipbar-label">agent:</span>
        <select
          name="agent"
          defaultValue={agent ?? ""}
          style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 12, fontFamily: "inherit" }}
        >
          <option value="">all agents</option>
          {(agents.agents || []).map((a: any) => (
            <option key={a.slug} value={a.slug}>{a.name || a.slug}</option>
          ))}
        </select>
        <button type="submit" className="chip" style={{ cursor: "pointer" }}>filter</button>
        {agent && <Link href="/guardrails" className="chip">clear agent ×</Link>}
      </form>

      <div className="cards">
        <Stat
          n={detectors.detectors.filter((d: any) => d.available).length}
          label="checks turned on"
          hint="How many of the built-in safety checks are actually installed and running in this deployment."
        />
        <Stat
          n={`${(degraded * 100).toFixed(1)}%`}
          label="checks that ran late or got skipped"
          tone={degraded > 0.01 ? "warn" : "ok"}
          hint="A check that took too long (degraded, only partly ran) or got skipped entirely to keep the agent responsive under load. High here means the safety net has holes, not that anything caught a real problem."
        />
        <Stat
          n={latency.runs}
          label={`checks run, last ${latency.window_days} days`}
          hint="Total volume — how much traffic these checks have actually looked at."
        />
        <Stat
          n={health.active || 0}
          label="checks someone turned off for a specific case"
          tone={health.never_hit?.length ? "warn" : "ok"}
          hint="A 'suppression' — someone decided this check was wrong often enough for a specific agent/pattern that they silenced it there. Worth reviewing periodically so a silenced check doesn't stay silenced forever by accident."
        />
        <Stat
          n={health.expiring_within_7_days?.length || 0}
          label="of those expiring this week"
          tone={health.expiring_within_7_days?.length ? "warn" : undefined}
          hint="Suppressions are time-boxed on purpose — these will start enforcing again automatically unless someone renews them."
        />
      </div>

      <h2>How much each check slows things down</h2>
      <p className="sub">
        Shown as "typical" (p50), "slow" (p95), and "worst case" (max) — an average
        would hide the slow outliers, and those outliers are exactly what gets a
        safety check disabled for being too slow. See{" "}
        <Link href="/policies">Policies</Link> for which checks are installed at all.
      </p>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>check</th>
              <th>version</th>
              <th>runs</th>
              <th>typical (p50)</th>
              <th>slow (p95)</th>
              <th>worst case</th>
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
                    {d.unavailable_reason && (
                      <div className="small muted wrap" style={{ maxWidth: 340, marginTop: 3 }}>
                        {d.unavailable_reason}
                      </div>
                    )}
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

      <h2>How often each check is actually right</h2>
      <p className="sub">
        "Precision" here means: of the times this check flagged something, how often
        was it actually a real problem versus a false alarm. Shown together with how
        many flags that's based on — a check that's "right" 3 times out of 4 isn't a
        real number yet; a check that's right 300 times out of 400 is.
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
            No feedback yet. File it from a detection on a <Link href="/traces">trace</Link> —
            the alternative is that somebody turns the detector off instead, and nobody finds
            out.
          </Empty>
        )}
      </div>

      <h2>Feedback log</h2>
      <p className="sub">
        Every verdict a human has filed on a detection, most recent first. A false
        positive here is one click from becoming a scoped, expiring suppression.
      </p>
      <div className="panel scroll-x">
        {feedback.feedback?.length ? (
          <table>
            <thead>
              <tr>
                <th>detector</th>
                <th>entity</th>
                <th>label</th>
                <th>note</th>
                <th>actor</th>
                <th>status</th>
                <th>trace</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {feedback.feedback.slice(0, 20).map((f: any) => (
                <tr key={f.id}>
                  <td className="mono small">{f.detector_key || <span className="muted">—</span>}</td>
                  <td className="mono small">{f.entity_type || <span className="muted">—</span>}</td>
                  <td>
                    <span className={`tag ${f.label === "false_positive" ? "bad" : f.label === "true_positive" ? "ok" : "warn"}`}>
                      {f.label.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="small muted wrap" style={{ maxWidth: 260 }}>{f.note || "—"}</td>
                  <td className="small muted">{f.actor || "—"}</td>
                  <td className="small">
                    <span className={`tag ${f.status === "applied" ? "ok" : f.status === "rejected" ? "bad" : ""}`}>{f.status}</span>
                  </td>
                  <td className="small">
                    {f.trace_id ? <Link href={`/traces/${f.trace_id}`}>trace</Link> : <span className="muted">—</span>}
                  </td>
                  <td className="small">
                    {f.label === "false_positive" && f.status === "open" && f.detector_key ? (
                      <form action="/api/guardrails/suppressions" method="POST" className="row" style={{ gap: 4, alignItems: "center" }}>
                        <input type="hidden" name="feedback_id" value={f.id} />
                        <input type="hidden" name="ttl_days" value="30" />
                        <button type="submit" className="chip" style={{ cursor: "pointer" }}>suppress 30d</button>
                      </form>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No feedback filed yet.</Empty>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppressions.suppressions.map((s: any) => (
                <tr key={s.id}>
                  <td className="mono">{s.detector_key}</td>
                  <td className="small">
                    {s.agent === "*" ? (
                      <span className="muted">all agents</span>
                    ) : (
                      <Link href={`/agents/${s.agent}`}>{s.agent}</Link>
                    )}
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
                  <td className="small">
                    {s.active && (
                      <form action="/api/guardrails/suppressions/revoke" method="POST">
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="chip" style={{ cursor: "pointer" }}>revoke</button>
                      </form>
                    )}
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
