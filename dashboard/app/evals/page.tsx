import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { ApiDown, InfoTip, Panel, Stat, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Evals({
  searchParams,
}: {
  searchParams: Promise<{ review_error?: string; review_notice?: string; drift_agent?: string; drift_scorer?: string }>;
}) {
  const { review_error, review_notice, drift_agent, drift_scorer } = await searchParams;
  let suites: any, runs: any, scorers: any, campaigns: any, slos: any, agents: any;
  try {
    [suites, runs, scorers, campaigns, slos, agents] = await Promise.all([
      api("/api/eval/suites"),
      api("/api/eval/runs?limit=20"),
      safeApi("/api/eval/scorers", { scorers: [], runners: {} }),
      safeApi("/api/redteam/campaigns", { campaigns: [] }),
      safeApi("/api/eval/slos", { slos: [] }),
      safeApi("/api/agents", { agents: [] }),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Evaluation</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  let drift: any = null;
  if (drift_agent && drift_scorer) {
    drift = await safeApi(
      `/api/eval/drift?agent=${encodeURIComponent(drift_agent)}&scorer=${encodeURIComponent(drift_scorer)}`,
      null,
    );
  }

  const latest = runs.runs[0];
  const latestSuite = latest
    ? suites.suites.find((s: any) => s.id === latest.suite_id)
    : null;

  return (
    <>
      <h1>Evaluation</h1>
      <p className="sub">
        Did your agent actually get the answer right — not just avoid saying
        anything unsafe. Run a set of known questions against an agent, grade every
        answer automatically, and get a pass rate you can track over time instead of
        spot-checking a few transcripts by hand.
      </p>

      <div className="cards">
        <Stat n={suites.suites.length} label="suites" hint="Named collections of test cases with expected behavior — the unit an eval run scores against." />
        <Stat n={runs.runs.length} label="recent runs" hint="Suite runs in the last window, across every runner (native, Ragas when installed, etc.)." />
        <Stat n={scorers.scorers.length} label="scorers" hint="Metrics available to score a run — groundedness, exact-match, and any others a runner exposes." />
        <Stat n={campaigns.campaigns.length} label="red-team campaigns" hint="Adversarial probe runs against one agent — see 'Red-team posture' below to run one." />
      </div>

      {review_error && <div className="error">{review_error}</div>}
      {review_notice && <div className="note-panel">{review_notice}</div>}

      {latest?.summary?.scorers && (
        <>
          <h2>Latest run</h2>
          <Panel
            title={`${latest.runner} · ${latest.mode} · ${latest.summary.cases} cases`}
            note={ts(latest.created_at)}
          >
            <table>
              <thead>
                <tr><th>scorer</th><th className="num">mean</th><th className="num">min</th><th className="num">max</th><th className="num">pass rate</th></tr>
              </thead>
              <tbody>
                {Object.entries(latest.summary.scorers).map(([k, v]: any) => (
                  <tr key={k}>
                    <td className="mono small">{k}</td>
                    <td className="num">{v.mean}</td>
                    <td className="num muted">{v.min}</td>
                    <td className="num muted">{v.max}</td>
                    <td className="num">
                      {v.pass_rate === null ? "—" : (
                        <span className={`tag ${v.pass_rate >= 0.9 ? "ok" : v.pass_rate >= 0.7 ? "warn" : "bad"}`}>
                          {Math.round(v.pass_rate * 100)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          {latest.summary.failing_count > 0 && (
            <p className="small" style={{ marginTop: 10 }}>
              <span className="tag bad">{latest.summary.failing_count}</span>{" "}
              <span className="muted">
                case(s) flagged.{" "}
                {latestSuite ? (
                  <>
                    <Link href={`/evals/${latestSuite.key}`}>Promote a production failure</Link>{" "}
                    into this suite as a regression case.
                  </>
                ) : (
                  "Promote a production failure into a suite as a regression case."
                )}
              </span>
            </p>
          )}
        </>
      )}

      <h2>
        Reliability &amp; SLOs
        <InfoTip text="A declared reliability target for one agent+scorer pair — e.g. '95% of sampled production answers stay grounded, measured weekly.' Error budget tracks how much room is left before that target is breached." />
      </h2>
      <div className="panel">
        {(slos.slos || []).length === 0 ? (
          <div className="body muted small">
            No SLOs declared yet — declare one below.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>agent</th>
                <th>scorer</th>
                <th>objective</th>
                <th className="num">target</th>
                <th className="num">attainment</th>
                <th className="num">error budget</th>
                <th>drift</th>
              </tr>
            </thead>
            <tbody>
              {slos.slos.map((s: any) => (
                <tr key={s.slo_id}>
                  <td className="small"><Link href={`/agents/${s.agent}`}>{s.agent}</Link></td>
                  <td className="mono small">{s.scorer}</td>
                  <td className="small wrap muted" style={{ maxWidth: 260 }}>{s.objective || "—"}</td>
                  <td className="num small">{s.target ?? "—"}</td>
                  <td className="num small">
                    {s.attainment === undefined ? (
                      <span className="muted">no data</span>
                    ) : (
                      <span className={`tag ${s.status === "burned" ? "bad" : "ok"}`}>
                        {Math.round(s.attainment * 100)}%
                      </span>
                    )}
                  </td>
                  <td className="num small">
                    {s.error_budget_remaining === undefined ? (
                      "—"
                    ) : (
                      <span className={s.error_budget_remaining > 0 ? "" : "tag bad"}>
                        {Math.round(s.error_budget_remaining * 100)}%
                      </span>
                    )}
                  </td>
                  <td className="small">
                    <Link href={`/evals?drift_agent=${encodeURIComponent(s.agent)}&drift_scorer=${encodeURIComponent(s.scorer)}#drift`}>
                      check drift →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="body" style={{ borderTop: "1px solid var(--border)" }}>
          <form action="/api/eval/slos" method="POST" className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <select
              name="agent" required
              style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            >
              <option value="">agent…</option>
              {(agents.agents || []).map((a: any) => (
                <option key={a.slug} value={a.slug}>{a.slug}</option>
              ))}
            </select>
            <select
              name="scorer" required
              style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            >
              <option value="">scorer…</option>
              {(scorers.scorers || []).map((s: any) => (
                <option key={s.key} value={s.key}>{s.key}</option>
              ))}
            </select>
            <input
              type="text" name="objective" placeholder="objective, e.g. '95% of answers stay grounded'"
              style={{ flex: 1, minWidth: 220, padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            />
            <select
              name="window" defaultValue="7d"
              style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            >
              <option value="1d">1 day</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
            <input
              type="number" name="target" step="0.01" min="0" max="1" defaultValue="0.9" required
              style={{ width: 80, padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            />
            <button type="submit" className="btn-primary">Declare SLO</button>
          </form>
        </div>
      </div>

      <h2>
        Score real production traffic
        <InfoTip text="Runs the same scorers an offline suite uses (groundedness, task completion, silent failure) against traces already recorded for an agent — no synthetic model call, no suite to author first. This is what an SLO's 'attainment' above is actually measured from." />
      </h2>
      <p className="sub" style={{ marginTop: -8 }}>
        Fastest way to get a real number: pick an agent that has traffic and sample it,
        rather than writing hand-authored cases first.
      </p>
      <form action="/api/eval/online" method="POST" className="row" style={{ gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        <select
          name="agent" required defaultValue=""
          style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
        >
          <option value="" disabled>choose an agent…</option>
          {(agents.agents || []).map((a: any) => (
            <option key={a.slug} value={a.slug}>{a.slug}</option>
          ))}
        </select>
        <select
          name="since_days" defaultValue="30"
          style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
        >
          <option value="1">last 1 day</option>
          <option value="7">last 7 days</option>
          <option value="30">last 30 days</option>
          <option value="90">last 90 days</option>
        </select>
        <button type="submit" className="btn-scan">Sample &amp; score</button>
      </form>

      {drift_agent && drift_scorer && (
        <div id="drift" className={`note-panel ${drift?.drifted ? "" : ""}`} style={{ borderLeftColor: drift?.drifted ? "var(--bad)" : "var(--accent)" }}>
          <strong>
            Drift check: {drift_agent} / {drift_scorer}
            <InfoTip text="Whether this scorer's results have shifted from its own baseline — measured by PSI (population stability index), a standard statistic for how much a distribution has moved. Above ~0.1 usually means 'worth a look'; above ~0.25 usually means something real changed." />
          </strong>
          {!drift || drift.drifted === null ? (
            <div>
              Insufficient online samples in the current and baseline windows to compare —
              this needs production traffic sampled via <code className="mono">POST /api/eval/online</code> first.
            </div>
          ) : (
            <div>
              {drift.drifted ? (
                <>Drifted ({drift.band}) — shift score {drift.psi?.toFixed(3)}, mean moved from{" "}
                {drift.mean_baseline?.toFixed(3)} to {drift.mean_current?.toFixed(3)}.</>
              ) : (
                <>No significant drift — shift score {drift.psi?.toFixed(3)}, mean {drift.mean_current?.toFixed(3)}{" "}
                (baseline {drift.mean_baseline?.toFixed(3)}).</>
              )}
              {" "}Compared {drift.n_current} recent sample(s) against {drift.n_baseline} baseline sample(s).
            </div>
          )}
        </div>
      )}

      <h2>Suites</h2>
      {suites.suites.length === 0 && (
        <p className="small muted" style={{ marginTop: -8 }}>
          No suite has ever been created for this org — that's why this reads 0, not
          because evaluation is broken. Create one below, or promote a real production
          trace into it once it exists.
        </p>
      )}
      <div className="panel">
        <table>
          <thead><tr><th>suite</th><th>description</th><th>tags</th><th className="num">cases</th></tr></thead>
          <tbody>
            {suites.suites.map((s: any) => (
              <tr key={s.id}>
                <td className="mono small"><Link href={`/evals/${s.key}`}>{s.key}</Link></td>
                <td className="small wrap muted" style={{ maxWidth: 460 }}>{s.description}</td>
                <td className="small muted">{(s.tags || []).join(", ")}</td>
                <td className="num">{s.cases}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="body" style={{ borderTop: "1px solid var(--border)" }}>
          <form action="/api/eval/suites" method="POST" className="row" style={{ gap: 6 }}>
            <input
              type="text" name="key" placeholder="key, e.g. support-quality" required
              style={{ width: 200, padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            />
            <input
              type="text" name="name" placeholder="name (optional)"
              style={{ width: 200, padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            />
            <input
              type="text" name="description" placeholder="description (optional)"
              style={{ flex: 1, minWidth: 200, padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
            />
            <button type="submit" className="btn-primary">Create suite</button>
          </form>
        </div>
      </div>

      <h2>Red-team posture</h2>
      <form action="/api/redteam/campaigns" method="POST" className="row" style={{ gap: 8, marginBottom: 10, alignItems: "center" }}>
        <select
          name="agent"
          required
          defaultValue=""
          style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
        >
          <option value="" disabled>choose an agent…</option>
          {(agents.agents || []).map((a: any) => (
            <option key={a.slug} value={a.slug}>{a.slug}</option>
          ))}
        </select>
        <button type="submit" className="btn-scan">Run built-in probes</button>
        <span className="small muted">
          Or from the CLI: <code className="mono">nometria redteam run &lt;agent&gt;</code>
        </span>
      </form>
      <div className="panel">
        {campaigns.campaigns.length === 0 ? (
          <div className="body muted small">
            No campaigns yet — pick an agent above and run one.
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>campaign</th><th>runner</th><th className="num">probes</th><th className="num">blocked</th><th className="num">got through</th><th className="num">posture</th><th>when</th></tr>
            </thead>
            <tbody>
              {campaigns.campaigns.map((c: any) => (
                <tr key={c.id}>
                  <td className="small">{c.name}</td>
                  <td className="small muted">{c.runner}</td>
                  <td className="num">{c.summary?.probes_run}</td>
                  <td className="num">{c.summary?.attacks_blocked}</td>
                  <td className="num">
                    {c.summary?.attacks_succeeded ? (
                      <span className="tag bad">{c.summary.attacks_succeeded}</span>
                    ) : "0"}
                  </td>
                  <td className="num">
                    <span className={`tag ${c.summary?.posture_score >= 0.9 ? "ok" : "warn"}`}>
                      {Math.round((c.summary?.posture_score ?? 0) * 100)}%
                    </span>
                  </td>
                  <td className="small muted">{ts(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Scorers</h2>
      <div className="panel scroll-x">
        <table>
          <thead><tr><th>scorer</th><th>kind</th><th>direction</th><th className="num">threshold</th></tr></thead>
          <tbody>
            {scorers.scorers.map((s: any) => (
              <tr key={s.key}>
                <td className="mono small">{s.key}</td>
                <td className="small muted">{s.kind}</td>
                <td className="small muted">
                  {s.higher_is_better ? "higher is better" : "lower is better"}
                </td>
                <td className="num small">{s.threshold ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
