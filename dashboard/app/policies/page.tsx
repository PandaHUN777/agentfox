import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { ApiDown, Empty, InfoTip, Panel, Stat } from "@/components/ui";
import { Countdown } from "@/components/Countdown";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string }[] = [
  { key: "rules", label: "Rules" },
  { key: "guardrails", label: "Guardrail tuning" },
];

export default async function Policies({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; review_error?: string; review_notice?: string; agent?: string }>;
}) {
  const { tab: rawTab, review_error, review_notice, agent } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab! : "rules";

  return (
    <>
      <h1>Policies</h1>
      <p className="sub">
        The rules an agent has to follow, and how well the checks behind them are
        actually working. Rule and control codes are decoded on the{" "}
        <Link href="/glossary">Glossary</Link> page.
      </p>

      {review_error && <div className="error">{review_error}</div>}
      {review_notice && <div className="note-panel">{review_notice}</div>}

      <div className="tabbar">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "rules" ? "/policies" : `/policies?tab=${t.key}`}
            className={tab === t.key ? "active" : ""}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "rules" ? <RulesTab agent={agent} /> : <GuardrailTuningTab agent={agent} />}
    </>
  );
}

async function RulesTab({ agent }: { agent?: string }) {
  const policiesPath = agent ? `/api/policies?agent=${encodeURIComponent(agent)}` : "/api/policies";
  let policies: any, detectors: any, probes: any, agents: any;
  try {
    [policies, detectors, probes, agents] = await Promise.all([
      api(policiesPath),
      safeApi("/api/detectors", { detectors: [], budget_ms: 0, detector_timeout_ms: 0 }),
      safeApi("/api/redteam/probes", { probes: [], runners: {} }),
      safeApi("/api/agents", { agents: [] }),
    ]);
  } catch (e: any) {
    return <ApiDown error={String(e?.message || e)} />;
  }

  const proposed = policies.policies.filter((p: any) => p.proposed);

  return (
    <>
      <p className="small muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Every policy starts in <strong>observe</strong> mode: it watches and records
        what it would have blocked, without actually blocking anything, so you can
        check it's not too trigger-happy before switching it to{" "}
        <strong>enforce</strong>, where it actually stops matching requests. A policy
        that starts blocking things the moment it's turned on is how a real safety
        rule ends up disabled by an annoyed engineer within a week — this two-step
        exists to prevent that.
      </p>

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
                      <Link href={`/policies/${p.key}`}>{p.name}</Link>
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
      <p className="sub" style={{ marginTop: -8 }}>
        One policy commonly governs many agents at once, matched by name pattern
        (e.g. "every agent starting with support-") rather than picked one at a time.
      </p>
      <form action="/policies" method="GET" className="chipbar" style={{ marginBottom: 4 }}>
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
        {agent && <Link href="/policies" className="chip">clear agent ×</Link>}
      </form>
      <div className="panel scroll-x">
        {policies.policies.length === 0 && agent ? (
          <Empty>No policy's declared scope matches &lsquo;{agent}&rsquo;.</Empty>
        ) : (
        <table>
          <thead>
            <tr><th>policy</th><th>description</th><th>version</th><th>mode</th><th className="num">rules</th></tr>
          </thead>
          <tbody>
            {policies.policies.map((p: any) => (
              <tr key={p.key}>
                <td>
                  <Link href={`/policies/${p.key}`}>{p.name}</Link>
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
        )}
      </div>

      <p className="small muted" style={{ marginTop: 10 }}>
        Simulate a change before promoting it:{" "}
        <code className="mono">nometria policy simulate -f candidate.yaml</code> — it
        exits non-zero when the change would newly block production traffic.
      </p>

      <h2>Detectors</h2>
      <p className="sub" style={{ marginTop: -8 }}>
        {detectors.detectors.filter((d: any) => d.enabled && d.available).length} of{" "}
        {detectors.detectors.length} available checks are actually turned on in this
        deployment
        {detectors.detectors.filter((d: any) => !d.available).length > 0 && (
          <> ({detectors.detectors.filter((d: any) => !d.available).length} not
          installed)</>
        )}
        . For the detail — how much each one costs, how often it's right, what's
        been suppressed — see the <Link href="/policies?tab=guardrails">Guardrail
        tuning tab</Link>.
      </p>

      <h2>Attack simulations available</h2>
      <p className="sub" style={{ marginTop: -8 }}>
        Scripted attempts to break an agent — get it to leak a secret, ignore its
        instructions, or say something it shouldn't — that can be run against any
        agent from the <Link href="/evals">Evaluation</Link> page to see whether it
        actually holds up, rather than assuming it does.
      </p>
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

/**
 * P3-12/13/14 — the tuning surface, which had an API and no page.
 *
 * The question this answers is not "is a detector configured" but "should I trust
 * it, and what is it costing me" — precision beside its sample size, latency as
 * percentiles rather than a mean, and every suppression with an expiry date.
 */
async function GuardrailTuningTab({ agent }: { agent?: string }) {
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
    return <ApiDown error={String(e?.message || e)} />;
  }

  const health = suppressions.health || {};
  const degraded = latency.degraded_rate || 0;

  return (
    <>
      <p className="small muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Guardrails are the automated checks that run on every message an agent sends
        or receives — catching things like a leaked password, a manipulated prompt,
        or an unsafe answer before a person sees it. This tab is for tuning them: are
        they actually catching real problems, are they slowing agents down, and are
        any of them wrong often enough that someone quietly turned them off (a
        "suppression," below) — which is worth knowing, since a check nobody trusts
        might as well not exist.
      </p>

      <form action="/policies" method="GET" className="chipbar" style={{ marginBottom: 4 }}>
        <input type="hidden" name="tab" value="guardrails" />
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
        {agent && <Link href="/policies?tab=guardrails" className="chip">clear agent ×</Link>}
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
        safety check disabled for being too slow. See the{" "}
        <Link href="/policies">Rules tab</Link> for which checks are installed at all.
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
                    {!d.available && (
                      <span className="tag warn">
                        unavailable
                        {d.unavailable_reason && <InfoTip text={d.unavailable_reason} />}
                      </span>
                    )}
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
                  <td className="small">
                    {s.active ? <Countdown at={s.expires_at} /> : <span className="tag">inactive</span>}
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
