import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, ControlStatus, DraftCaveat, InfoTip, Panel, Stat, StatLink, pct, ts } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

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
  { key: "board", label: "Board" },
];

export default async function Compliance({
  searchParams,
}: {
  searchParams: Promise<{ review_error?: string; review_notice?: string; tab?: string }>;
}) {
  const { review_error, review_notice, tab: rawTab } = await searchParams;
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
        <strong>computed from telemetry</strong>, not attested on a form. Unfamiliar
        terms or codes like <span className="mono">NOM-AUD-01</span> are decoded on
        the <Link href="/glossary">Glossary</Link> page.
      </p>

      {review_error && <div className="error">{review_error}</div>}
      {review_notice && <div className="note-panel">{review_notice}</div>}

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
        <Stat n={counts.effective || 0} label="effective" tone="ok" />
        <Stat n={counts.degraded || 0} label="degraded" tone="warn" />
        <Stat n={counts.failing || 0} label="failing" tone={counts.failing ? "bad" : "ok"} />
        <Stat n={counts.not_implemented || 0} label="not implemented" tone={counts.not_implemented ? "warn" : "ok"} />
        <Stat
          n={counts.not_computed || 0}
          label="not computed"
          hint="Cataloged but never assessed — no status has been computed for these controls yet, which is different from 'not implemented' (assessed, and found to have no evidence source)."
        />
        <Stat
          n={pct(controls.posture.effectiveness)}
          label="effectiveness"
          hint={`Measured against the ${assessed} control(s) with telemetry to assess, not all ${controls.controls.length} — effective ÷ (effective + degraded + failing). The ${counts.not_implemented || 0} not-yet-implemented control(s) are excluded from this ratio, not counted as failing.`}
        />
      </div>

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
              <div className="row" style={{ gap: 10 }}>
                {counts.not_computed > 0 && (
                  <span className="small muted">
                    {counts.not_computed} never computed — needs real traffic, not a click.{" "}
                    <Link href="/start">Connect an agent</Link>
                  </span>
                )}
                <form action="/api/compliance/compute" method="POST">
                  <button type="submit" className="btn-scan" style={{ fontWeight: 400 }}>
                    Recompute status from telemetry
                  </button>
                </form>
              </div>
            )}
          </h2>
          <div className="panel scroll-x">
            <table>
              <thead>
                <tr>
                  <th>control</th>
                  <th>what it checks</th>
                  <th>
                    status
                    <InfoTip text="Effective (green): telemetry confirms it works. Degraded (amber): partially confirmed. Failing (red): telemetry contradicts it. Grey: not implemented, not applicable, or not computed yet — a control catalogued but never assessed, which is different from failing." />
                  </th>
                  <th>evidence / rationale</th>
                </tr>
              </thead>
              <tbody>
                {controls.controls.map((c: any) => (
                  <tr key={c.key} id={c.key}>
                    <td className="small wrap" style={{ maxWidth: 240 }}>
                      {c.title}
                      <div className="mono small muted" title="Internal code, cross-referenced on the Glossary page">
                        {c.key}
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
                  <tr key={i} id={o.reference ? `obligation-${encodeURIComponent(o.reference)}` : undefined}>
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
                    <td className="mono small"><Link href={`/agents/${r.agent}`}>{r.agent}</Link></td>
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
            (unreviewed) framework mappings are included too, each tagged with a{" "}
            <strong>DRAFT — UNVERIFIED / NOT LEGAL ADVICE</strong> chip so it's obvious
            what still needs review — reviewed on the{" "}
            <a href="/compliance?tab=frameworks">Frameworks tab</a>. Building a package is
            itself logged to the audit chain, after the package's own contents are already
            computed — so a package can never include a record of its own creation, and its
            audit-entry count will always be one behind "Verify audit chain integrity"
            checked right after. That's expected, not a discrepancy.
          </p>

          <form action="/api/audit/verify" method="POST" style={{ marginBottom: 20 }}>
            <button type="submit" className="btn-scan">Verify audit chain integrity now</button>{" "}
            <span className="small muted">
              Independently re-derives the hash chain over every audit entry — the same check
              a package runs at build time, without needing to build one first.
            </span>
          </form>

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
                  {evidencePackages.packages.map((p: any) => {
                    const counts = p.counts || {};
                    const substantive = ["traces", "decisions", "control_statuses", "eval_runs", "findings"];
                    const isEmpty = substantive.every((k) => !counts[k]);
                    return (
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
                          {isEmpty && (
                            <div className="tag warn" style={{ marginBottom: 4 }}>
                              empty — nothing to show an auditor yet
                            </div>
                          )}
                          {Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}
                        </td>
                        <td>
                          <a href={`/api/evidence/${p.id}/download`} className="small">Download →</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "board" && <BoardTab />}
    </>
  );
}

/**
 * The printable snapshot — one page for someone outside the team: agent
 * population by risk class, control effectiveness, open findings, and the
 * regulatory calendar, frozen at the moment it's generated. Used to live at
 * its own /board URL; now a tab here since it's the same data this page
 * already computes, just summarized for print instead of browsed by table.
 */
async function BoardTab() {
  let v: any;
  try {
    v = await api("/api/board");
  } catch (e: any) {
    return <ApiDown error={String(e?.message || e)} />;
  }

  const inv = v.inventory;
  const f = v.open_findings;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginTop: 16 }}>
        <p className="small muted" style={{ maxWidth: "70ch" }}>
          For day-to-day monitoring, use <Link href="/">Overview</Link> instead —
          this snapshot won't update itself while you're looking at it. Generated{" "}
          {v.generated_at?.slice(0, 19)}.
          {v.seed_agents > 0 && (
            <>
              {" "}<span className="tag" style={{ marginLeft: 4 }}>
                {v.seed_agents} of {inv.agents} agent(s) below {v.seed_agents === 1 ? "is" : "are"} sample data from `nometria seed`
              </span>
            </>
          )}
        </p>
        <PrintButton />
      </div>

      <div className="cards">
        <StatLink n={inv.agents} label="agents under management" href="/agents" />
        <StatLink
          n={v.high_risk_agents.length}
          label="high-risk agents"
          tone={v.high_risk_agents.length ? "warn" : "ok"}
          href="/agents"
        />
        <StatLink
          n={inv.shadow}
          label="ungoverned"
          tone={inv.shadow ? "bad" : "ok"}
          href="/agents"
          hint="Traffic observed from an agent that was never registered — see the Agents page."
        />
        <StatLink
          n={v.unassessed_agents.length}
          label="unassessed"
          tone={v.unassessed_agents.length ? "warn" : "ok"}
          href="/compliance?tab=risk"
          hint="Agents with no EU AI Act risk classification on file — see the Risk register."
        />
        <StatLink
          n={f.total}
          label="open findings"
          tone={f.by_severity?.critical ? "bad" : f.total ? "warn" : "ok"}
          href="/findings"
        />
        <Stat
          n={pct(v.overall_posture.effectiveness)}
          label="control effectiveness"
          hint="Effective ÷ (effective + degraded + failing) among assessed controls — excludes not-yet-implemented controls from the ratio. See the framework table below for the full breakdown."
        />
      </div>

      <div className="grid2" style={{ marginTop: 22 }}>
        <Panel title="Agents by risk class">
          <table>
            <tbody>
              {Object.entries(v.agents_by_risk_class).map(([k, n]: any) => (
                <tr key={k}>
                  <td>
                    <span className={`tag ${k === "high" || k === "prohibited" ? "bad" : ""}`}>{k}</span>
                  </td>
                  <td className="num">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {v.high_risk_agents.length > 0 && (
            <div className="body small muted">
              high-risk:{" "}
              {v.high_risk_agents.map((slug: string, i: number) => (
                <span key={slug} className="mono">
                  {i > 0 && ", "}
                  <Link href={`/agents/${slug}`}>{slug}</Link>
                </span>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Open findings by severity">
          <table>
            <tbody>
              {Object.entries(f.by_severity || {}).map(([k, n]: any) => (
                <tr key={k}>
                  <td>
                    <Link href={`/findings?severity=${k}`}>
                      <span className={`tag ${k === "critical" || k === "high" ? "bad" : k === "medium" ? "warn" : ""}`}>{k}</span>
                    </Link>
                  </td>
                  <td className="num">{n}</td>
                </tr>
              ))}
              {Object.keys(f.by_severity || {}).length === 0 && (
                <tr><td className="muted small">none open</td></tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      <h2>Control effectiveness by framework</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr>
              <th>framework</th><th className="num">controls</th><th className="num">effective</th>
              <th className="num">degraded</th><th className="num">failing</th>
              <th className="num">not implemented</th><th className="num">not computed</th>
              <th className="num">effectiveness</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(v.control_posture).map(([fw, p]: any) => (
              <tr key={fw}>
                <td className="mono small">
                  <Link href={`/compliance/frameworks/${fw}`}>{fw}</Link>
                </td>
                <td className="num">{p.controls}</td>
                <td className="num"><span className="tag ok">{p.counts.effective}</span></td>
                <td className="num"><span className="tag warn">{p.counts.degraded}</span></td>
                <td className="num">
                  {p.counts.failing ? <span className="tag bad">{p.counts.failing}</span> : "0"}
                </td>
                <td className="num muted">{p.counts.not_implemented}</td>
                <td className="num muted">{p.counts.not_computed}</td>
                <td className="num">{pct(p.effectiveness)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Regulatory clock</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr><th>date</th><th>obligation</th><th>status</th><th className="num">days</th><th className="num">agents in scope</th></tr>
          </thead>
          <tbody>
            {[...v.live_obligations, ...v.upcoming_obligations].map((o: any, i: number) => (
              <tr key={i}>
                <td className="small mono">{(o.effective_date || "").slice(0, 10)}</td>
                <td className="small">
                  <Link href={`/compliance?tab=obligations#obligation-${encodeURIComponent(o.reference || "")}`}>
                    {o.title}
                  </Link>{" "}
                  <span className="muted mono">{o.reference}</span>
                </td>
                <td><span className={`tag ${o.status === "live" ? "ok" : "warn"}`}>{o.status}</span></td>
                <td className="num small muted">{o.days_until > 0 ? o.days_until : "—"}</td>
                <td className="num">{o.agents_in_scope_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DraftCaveat text={v.caveat} />
    </>
  );
}
