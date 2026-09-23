import Link from "next/link";
import { api, safeApi, apiErrorProps } from "@/lib/api";
import { ApiDown, Empty, InfoTip, Panel, Severity, Stat, agentName } from "@/components/ui";
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
        actually working. A detector decides whether something is there; a policy
        decides what happens about it, which is why a policy can be watching
        (<span className="mono">observe</span>) or actually stopping things
        (<span className="mono">enforce</span>). Read what is in force below, and check
        the mode column before assuming anything is being blocked. Rule and control
        codes are decoded on the <Link href="/glossary">Glossary</Link> page.
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
    return <ApiDown {...apiErrorProps(e)} />;
  }

  const proposed = policies.policies.filter((p: any) => p.proposed);

  return (
    <>
      {/* The product's own claim, stated where a reader is actually looking at
          policies, instead of only in a paragraph on Start here. Written to be
          checkable: it says what containment reasons over, and what it depends
          on, rather than promising that injections cannot get through. */}
      <div className="note-panel" style={{ marginTop: 14 }}>
        <strong>Tool containment: the rule that holds after a filter is fooled.</strong>{" "}
        Most rules here read the text of a request. One does not. Tool containment
        looks at the action instead: which tool is being called, what its arguments
        are, where those arguments came from, and how much damage the tool can do.
        An irreversible tool called with arguments that came out of a retrieved
        document or another tool's output needs a human, whether or not any detector
        flagged the text that led there. That is why an injection can succeed at
        convincing the model and still not get the action executed.{" "}
        <strong>It is only as good as the declarations behind it:</strong> a tool
        recorded as <code className="mono">read</code> that actually moves money is
        not contained by anything. The four impact tiers are{" "}
        <code className="mono">read</code>, <code className="mono">write</code>,{" "}
        <code className="mono">high_impact</code> and{" "}
        <code className="mono">irreversible</code>, declared per tool — see{" "}
        <Link href="/agents">Agents</Link> for what each of yours is recorded as, and
        the <Link href="/glossary">Glossary</Link> for the terms.
      </div>

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
        <label htmlFor="policies-agent-filter" className="chipbar-label">agent:</label>
        <select
          id="policies-agent-filter"
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
        {/* Two different nothings. A filter that matched nothing is a dead end to
            back out of; no policies at all is a workspace nobody has connected
            yet, and the fix for that is on another page entirely. Gating only on
            `agent` sent the second case a bare column header and no sentence. */}
        {policies.policies.length === 0 ? (
          agent ? (
            <Empty>
              No policy's declared scope matches &lsquo;{agentName(agents, agent)}&rsquo;.
              Policies are scoped by name pattern, so an agent can be covered by a
              policy that never names it. Clear the filter to see all of them.
            </Empty>
          ) : (
            <Empty>
              No policies yet. Policies arrive with the code they govern: connect a
              repository on <Link href="/start?tab=connect">Start here</Link> and the
              scan proposes a starting set, in observe mode, for you to review here.
            </Empty>
          )
        ) : (
        <table>
          <thead>
            <tr>
              <th>policy</th><th>description</th><th>version</th>
              <th>
                mode
                <InfoTip text="Every policy starts in observe: it watches and records what it would have blocked, without blocking anything, so you can check it's not too trigger-happy before switching it to enforce. A policy that starts blocking the moment it's turned on is how a real safety rule ends up disabled by an annoyed engineer within a week." />
              </th>
              <th className="num">rules</th>
            </tr>
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
        {/* This list comes from a `safeApi` fallback, so an empty array here is
            just as likely to mean the probes call failed as it is to mean there
            are none — either way, column headers over nothing said neither. */}
        {probes.probes.length === 0 ? (
          <Empty>
            No attack simulations are listed. They ship with the product, so an empty
            list here usually means the control plane could not be asked for them
            rather than that none exist. Reload, and if it stays empty the deployment
            is missing its probe library.
          </Empty>
        ) : (
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
                <td><Severity value={p.severity} /></td>
                <td className="small mono muted">{p.owasp_id || "—"}</td>
                <td className="small mono muted">{p.atlas_id || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Wrapped runners:{" "}
        {Object.entries(probes.runners || {}).map(([n, ok]) => (
          <span key={n} className={`tag ${ok ? "ok" : ""}`} style={{ marginRight: 6 }}>
            {n}{ok ? "" : " (not installed)"}
          </span>
        ))}
      </p>

      <ChangeProposals />
    </>
  );
}

/**
 * The improvement loop has a full API and a `nometria proposals` command group and
 * no screen at all, so a dashboard user has no way to learn it exists, let alone
 * that there may be proposals waiting on their decision. Until there is a page for
 * it, saying so plainly here is better than the current silence.
 */
function ChangeProposals() {
  return (
    <>
      <h2>Change proposals</h2>
      <p className="sub" style={{ marginTop: -8 }}>
        This product proposes changes to its own configuration rather than making
        them. Reading and deciding proposals is on the command line and the HTTP API
        today. There is no screen for it.
      </p>
      <div className="note-panel" style={{ marginTop: 0 }}>
        <p style={{ marginTop: 0 }}>
          A <strong>proposal</strong> is one change someone or something wants to make
          to a policy, a rule threshold or another piece of governance configuration.
          It carries the diff, the evidence that prompted it, and the trail of every
          decision taken on it. It moves from proposed to proven, approved, canary,
          applied and verified, or it ends rejected, rolled back or superseded.
        </p>
        <p>
          Each proposal is labelled by <strong>direction</strong>: whether it tightens
          a control, loosens one, or does neither. The direction is computed from the
          diff against the live configuration, not taken from whoever filed it.{" "}
          <strong>A loosening change is never applied automatically.</strong> A
          loosening at org level needs two different approvers, and undoing a
          tightening counts as a loosening, so only a person can do that too.
        </p>
        <p style={{ marginBottom: 0 }}>
          Approving a proposal is not evidence that it worked.{" "}
          <span className="mono">proposals verify</span> is the separate step that
          records whether the applied change did what it promised, and a verification
          marked failed rolls the change back unless rolling back would itself loosen a
          control.
        </p>
      </div>
      <div className="panel scroll-x" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr><th>to do this</th><th>command</th><th>over HTTP</th></tr>
          </thead>
          <tbody>
            <tr>
              <td className="small">See what is waiting</td>
              <td className="mono small">nometria proposals list --status proposed</td>
              <td className="mono small muted">GET /api/proposals?status=</td>
            </tr>
            <tr>
              <td className="small">Read one in full</td>
              <td className="mono small">nometria proposals show ID</td>
              <td className="mono small muted">GET /api/proposals/{"{id}"}</td>
            </tr>
            <tr>
              <td className="small">Decide on one</td>
              <td className="mono small">nometria proposals approve ID --actor you --note &quot;...&quot;</td>
              <td className="mono small muted">POST /api/proposals/{"{id}"}/decide</td>
            </tr>
            <tr>
              <td className="small">Put it into effect</td>
              <td className="mono small">nometria proposals apply ID</td>
              <td className="mono small muted">POST /api/proposals/{"{id}"}/apply</td>
            </tr>
            <tr>
              <td className="small">Undo it</td>
              <td className="mono small">nometria proposals rollback ID --reason &quot;...&quot;</td>
              <td className="mono small muted">POST /api/proposals/{"{id}"}/rollback</td>
            </tr>
            <tr>
              <td className="small">Record whether it worked</td>
              <td className="mono small">nometria proposals verify ID --actor you</td>
              <td className="mono small muted">POST /api/proposals/{"{id}"}/verify</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10, maxWidth: "78ch" }}>
        Apply, rollback and verify need the <span className="mono">policy_production</span>{" "}
        permission. The actor is taken from whoever is authenticated, not from a
        field you fill in. One source of proposals is the{" "}
        <Link href="/policies?tab=guardrails">Guardrail tuning tab</Link>: false
        positives labelled there become proposed rule changes.
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
    return <ApiDown {...apiErrorProps(e)} />;
  }

  const health = suppressions.health || {};
  const degraded = latency.degraded_rate || 0;

  return (
    <>
      <p className="small muted" style={{ marginTop: 4, marginBottom: 12 }}>
        Are these checks catching real problems, slowing agents down, or quietly
        turned off by someone who stopped trusting them?
      </p>

      <form action="/policies" method="GET" className="chipbar" style={{ marginBottom: 4 }}>
        <input type="hidden" name="tab" value="guardrails" />
        <label htmlFor="guardrails-agent-filter" className="chipbar-label">agent:</label>
        <select
          id="guardrails-agent-filter"
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

      <div className="note-panel">
        <strong>A false positive can become a proposed rule change, not just a
        suppression.</strong>{" "}
        <span className="mono">nometria proposals from-labels --days 30</span> reads the
        false positives labelled above and files them as proposed cut-off changes to the
        rules that produced them. It files proposals and applies nothing; a person still
        decides each one. The same work runs daily on its own as the{" "}
        <span className="mono">tuning.propose</span> job, so proposals can be waiting
        even if you never run the command. There is no screen for them yet, so read them
        with <span className="mono">nometria proposals list</span>. What they are and how
        deciding works is on the <Link href="/policies">Rules tab</Link>.
      </div>
    </>
  );
}
