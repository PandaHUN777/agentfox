import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { ApiDown, Panel, Stat, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Evals({
  searchParams,
}: {
  searchParams: Promise<{ review_error?: string }>;
}) {
  const { review_error } = await searchParams;
  let suites: any, runs: any, scorers: any, campaigns: any;
  try {
    [suites, runs, scorers, campaigns] = await Promise.all([
      api("/api/eval/suites"),
      api("/api/eval/runs?limit=20"),
      safeApi("/api/eval/scorers", { scorers: [], runners: {} }),
      safeApi("/api/redteam/campaigns", { campaigns: [] }),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Evaluation</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const latest = runs.runs[0];

  return (
    <>
      <h1>Evaluation & reliability</h1>
      <p className="sub">
        The widest solved-vs-unsolved gap in the stack: teams can see their agents but
        cannot judge them. This is the pillar that governs whether the agent{" "}
        <em>worked</em>, not only whether it was safe.
      </p>

      <div className="cards">
        <Stat n={suites.suites.length} label="suites" />
        <Stat n={runs.runs.length} label="recent runs" />
        <Stat n={scorers.scorers.length} label="scorers" />
        <Stat n={campaigns.campaigns.length} label="red-team campaigns" />
      </div>

      {review_error && <div className="error">{review_error}</div>}

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
                case(s) flagged. Promote a production failure into this suite with{" "}
                <code className="mono">POST /api/eval/suites/&#123;key&#125;/cases/from-trace</code>.
              </span>
            </p>
          )}
        </>
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
            <button type="submit" className="btn-approve">Create suite</button>
          </form>
        </div>
      </div>

      <h2>Red-team posture</h2>
      <div className="panel">
        {campaigns.campaigns.length === 0 ? (
          <div className="body muted small">
            No campaigns yet — run <code className="mono">nometria redteam run &lt;agent&gt;</code>.
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
