import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, ControlStatus, DraftCaveat, Stat, pct, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputStyle = {
  width: "100%",
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  marginTop: 4,
} as const;

const TABS: { key: string; label: string }[] = [
  { key: "controls", label: "Controls" },
  { key: "frameworks", label: "Frameworks" },
  { key: "obligations", label: "Obligations" },
  { key: "risk", label: "Risk register" },
  { key: "evidence", label: "Evidence & reports" },
];

export default async function Compliance({
  searchParams,
}: {
  searchParams: Promise<{ review_error?: string; tab?: string }>;
}) {
  const { review_error, tab: rawTab } = await searchParams;
  // Controls is the default because /findings and /policies deep-link to
  // /compliance#<control-key> — a control anchor that lands on the wrong tab
  // never scrolls into view, so the tab that owns those anchors has to be first.
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab! : "controls";

  let controls: any, frameworks: any, obligations: any, register: any, evidencePackages: any;
  try {
    [controls, frameworks, obligations, register, evidencePackages] = await Promise.all([
      api("/api/controls"),
      api("/api/frameworks"),
      api("/api/obligations"),
      api("/api/risk/register"),
      api("/api/evidence"),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Compliance</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const counts = controls.posture.counts || {};
  const catalogLoaded = controls.controls.length > 0;
  const assessed = (counts.effective || 0) + (counts.degraded || 0) + (counts.failing || 0);

  return (
    <>
      <h1>Compliance</h1>
      <p className="sub">
        {catalogLoaded
          ? "One control set mapped to seven frameworks. Control status is "
          : "One control set maps to seven frameworks, once the catalog below is loaded. Control status is "}
        <strong>computed from telemetry</strong> — detector coverage, decision coverage,
        audit-chain verification — not attested on a form. That is a claim only an
        inline, agent-native platform can make.
      </p>

      {review_error && <div className="error">{review_error}</div>}

      {!catalogLoaded && (
        <div className="hero empty" style={{ marginBottom: 20 }}>
          <div className="hero-title">Control catalog not loaded</div>
          <p>
            This deployment has never loaded the reference control catalog — the
            fixed set of ~40 controls and their mappings to EU AI Act, NIST AI RMF,
            ISO/IEC 42001 and the rest. Until it is, every count below reads zero,
            which looks like a broken product rather than a missing one-time setup
            step. Loading it is idempotent — safe to run again later when the
            catalog version changes.
          </p>
          <form action="/api/compliance/sync" method="POST">
            <button type="submit" className="btn-primary">
              Load control catalog
            </button>
          </form>
        </div>
      )}

      <DraftCaveat />

      <div className="cards">
        <Stat n={controls.controls.length} label="controls" />
        <Stat n={counts.effective || 0} label="effective" tone="ok" />
        <Stat n={counts.degraded || 0} label="degraded" tone="warn" />
        <Stat n={counts.failing || 0} label="failing" tone={counts.failing ? "bad" : "ok"} />
        <Stat n={counts.not_implemented || 0} label="not implemented" tone={counts.not_implemented ? "warn" : "ok"} />
        <Stat
          n={pct(controls.posture.effectiveness)}
          label="effectiveness"
          hint={`Of ${assessed} assessed control(s) — effective ÷ (effective + degraded + failing). The ${counts.not_implemented || 0} not-yet-implemented control(s) are excluded from this ratio, not counted as failing.`}
        />
      </div>
      <p className="small muted" style={{ marginTop: -8, marginBottom: 18 }}>
        Effectiveness is measured against the {assessed} control(s) with telemetry to assess — not against all {controls.controls.length}.
      </p>

      <div className="tabbar">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "controls" ? "/compliance" : `/compliance?tab=${t.key}`}
            className={tab === t.key ? "active" : ""}
          >
            {t.label}
            <span className="tab-count">
              {t.key === "controls" && controls.controls.length}
              {t.key === "frameworks" && frameworks.frameworks.length}
              {t.key === "obligations" && obligations.obligations.length}
              {t.key === "risk" && register.register.length}
              {t.key === "evidence" && evidencePackages.packages.length}
            </span>
          </Link>
        ))}
      </div>

      {tab === "controls" && (
        <>
          <h2 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Controls</span>
            {catalogLoaded && (
              <form action="/api/compliance/compute" method="POST">
                <button type="submit" className="btn-scan" style={{ fontWeight: 400 }}>
                  Recompute status from telemetry
                </button>
              </form>
            )}
          </h2>
          <div className="legend">
            <span className="legend-item"><span className="legend-swatch ok" /> effective</span>
            <span className="legend-item"><span className="legend-swatch warn" /> degraded</span>
            <span className="legend-item"><span className="legend-swatch bad" /> failing</span>
            <span className="legend-item"><span className="legend-swatch dim" /> not implemented / not applicable</span>
          </div>
          <div className="panel scroll-x">
            <table>
              <thead>
                <tr><th>control</th><th>objective</th><th>status</th><th>evidence / rationale</th></tr>
              </thead>
              <tbody>
                {controls.controls.map((c: any) => (
                  <tr key={c.key} id={c.key}>
                    <td>
                      <div className="mono small" title={c.key}>{c.key}</div>
                      <div className="small muted">{c.title}</div>
                      <div className="mono muted" style={{ fontSize: 11 }}>
                        {(c.implemented_by || []).join(" ")}
                      </div>
                    </td>
                    <td className="small wrap muted" style={{ maxWidth: 330 }}>{c.objective}</td>
                    <td><ControlStatus value={c.status} /></td>
                    <td className="small wrap muted" style={{ maxWidth: 380 }}>{c.rationale || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "frameworks" && (
        <>
          <h2>Frameworks</h2>
          <div className="panel scroll-x">
            <table>
              <thead>
                <tr>
                  <th>framework</th><th className="num">controls mapped</th>
                  <th className="num">mappings</th><th className="num">reviewed</th><th>status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {frameworks.frameworks.map((f: any) => (
                  <tr key={f.framework}>
                    <td>
                      <div>{f.title}</div>
                      <div className="small muted wrap" style={{ maxWidth: 460 }}>{f.description}</div>
                    </td>
                    <td className="num">{f.controls_mapped}/{f.controls_total}</td>
                    <td className="num">{f.mappings_total}</td>
                    <td className="num">{f.mappings_reviewed}</td>
                    <td>
                      <span className={`tag ${f.review_status === "reviewed" ? "ok" : "warn"}`}>
                        {f.review_status}
                      </span>
                    </td>
                    <td>
                      <Link href={`/compliance/frameworks/${f.framework}`} className="small">
                        Review mappings →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {frameworks.frameworks.map((f: any) =>
            f.declared_gaps?.length ? (
              <div key={f.framework} style={{ marginTop: 18 }}>
                <h3>{f.title} — declared gaps</h3>
                <ul className="small muted" style={{ marginTop: 0 }}>
                  {f.declared_gaps.map((g: string) => <li key={g}>{g}</li>)}
                </ul>
              </div>
            ) : null,
          )}
        </>
      )}

      {tab === "obligations" && (
        <>
          <h2>Regulatory obligations</h2>
          <div className="panel scroll-x">
            <table>
              <thead>
                <tr>
                  <th>date</th><th>framework</th><th>obligation</th><th>status</th>
                  <th className="num">agents in scope</th><th>build by</th>
                </tr>
              </thead>
              <tbody>
                {obligations.obligations.map((o: any, i: number) => (
                  <tr key={i}>
                    <td className="small mono">{(o.effective_date || "").slice(0, 10)}</td>
                    <td className="small muted">{o.framework}</td>
                    <td>
                      <div className="small">{o.title}</div>
                      <div className="small muted wrap" style={{ maxWidth: 400 }}>{o.description}</div>
                    </td>
                    <td>
                      <span className={`tag ${o.status === "live" ? "ok" : "warn"}`}>{o.status}</span>
                    </td>
                    <td className="num">{o.agents_in_scope_count}</td>
                    <td className="small muted">{(o.target_readiness || "—").slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "risk" && (
        <>
          <h2>Risk register</h2>
          <p className="small muted" style={{ marginTop: -6, marginBottom: 14 }}>
            An unassessed agent isn't a data gap you fix by waiting — someone has to
            look at it and record a class and a residual risk. Expand a row to do that.
          </p>
          <div className="panel scroll-x">
            <table>
              <thead>
                <tr><th>agent</th><th>risk tier</th><th>EU class</th><th>residual</th><th>assessor</th><th>next review</th><th></th></tr>
              </thead>
              <tbody>
                {register.register.map((r: any) => (
                  <tr key={r.agent}>
                    <td className="mono small">{r.agent}</td>
                    <td><span className={`tag ${r.risk_tier === "high" ? "bad" : ""}`}>{r.risk_tier}</span></td>
                    <td className="small">
                      {r.eu_ai_act_class || <span className="tag warn">not assessed</span>}
                    </td>
                    <td className="small muted">{r.residual_risk || "—"}</td>
                    <td className="small muted">{r.assessor || "—"}</td>
                    <td className="small muted">
                      {r.review_overdue ? (
                        <span className="tag bad">overdue</span>
                      ) : (r.next_review_at || "—").slice(0, 10)}
                    </td>
                    <td>
                      <details>
                        <summary className="small">{r.eu_ai_act_class ? "Reassess" : "Assess"}</summary>
                        <form
                          action={`/api/risk/assessments/${r.agent}`}
                          method="POST"
                          className="stack"
                          style={{ marginTop: 8, minWidth: 220 }}
                        >
                          <label className="small muted" style={{ display: "block" }}>
                            EU AI Act class
                            <select name="eu_ai_act_class" defaultValue="" style={inputStyle}>
                              <option value="">Let the platform propose one</option>
                              <option value="minimal">Minimal</option>
                              <option value="limited">Limited</option>
                              <option value="high">High</option>
                              <option value="prohibited">Prohibited</option>
                            </select>
                          </label>
                          <label className="small muted" style={{ display: "block" }}>
                            Residual risk
                            <select name="residual_risk" defaultValue="low" style={inputStyle}>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </label>
                          <label className="small muted" style={{ display: "block" }}>
                            Signed off by
                            <input
                              type="email"
                              name="signed_off_by"
                              placeholder="you@yourcompany.com"
                              style={inputStyle}
                            />
                          </label>
                          <button type="submit" className="btn-primary" style={{ fontSize: 12 }}>
                            Record assessment
                          </button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "evidence" && (
        <>
          <h2>Evidence & reports</h2>
          <p className="small muted" style={{ marginTop: -6, marginBottom: 14 }}>
            An auditor-ready zip: what was in scope, what the agent actually did, which
            policy version was in force, and a standalone script that re-derives the
            audit-chain hash without trusting this platform or calling its API. Draft
            (unreviewed) framework mappings are always excluded — reviewed on the{" "}
            <a href="/compliance?tab=frameworks">Frameworks tab</a>.
          </p>

          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="head"><span>Build a package</span></div>
            <form action="/api/evidence" method="POST" className="body stack">
              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                    Agents (comma-separated slugs, blank = all)
                  </label>
                  <input type="text" name="agents" placeholder="support-triage, refund-bot" style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                    Controls (comma-separated keys, blank = all)
                  </label>
                  <input type="text" name="controls" placeholder="NOM-RTG-01" style={inputStyle} />
                </div>
              </div>
              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                    Period from (blank = unbounded)
                  </label>
                  <input type="date" name="period_from" style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                    Period to (blank = now)
                  </label>
                  <input type="date" name="period_to" style={inputStyle} />
                </div>
              </div>
              <button type="submit" className="btn-primary">Build evidence package</button>
            </form>
          </div>

          {evidencePackages.packages.length === 0 ? (
            <div className="hero empty">
              <div className="hero-title">No evidence packages built yet</div>
              <p>Build one above — it takes a few seconds and nothing is deleted by building another.</p>
            </div>
          ) : (
            <div className="panel scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>built</th><th>requested by</th><th>scope</th>
                    <th>chain</th><th>counts</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {evidencePackages.packages.map((p: any) => (
                    <tr key={p.id}>
                      <td className="small muted">{ts(p.built_at)}</td>
                      <td className="small muted">{p.requested_by}</td>
                      <td className="small muted">
                        {(p.scope?.agents || ["*"]).join(", ")} / {(p.scope?.controls || ["*"]).join(", ")}
                      </td>
                      <td>
                        <span className={`tag ${p.chain_valid ? "ok" : "bad"}`}>
                          {p.chain_valid ? "verified" : "broken"}
                        </span>
                      </td>
                      <td className="small muted">
                        {Object.entries(p.counts || {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}
                      </td>
                      <td>
                        <a href={`/api/evidence/${p.id}/download`} className="small">Download →</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
