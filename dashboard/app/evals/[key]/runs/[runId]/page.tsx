import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, Panel, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RunDetail({
  params,
}: {
  params: Promise<{ key: string; runId: string }>;
}) {
  const { key, runId } = await params;
  let run: any;
  try {
    run = await api(`/api/eval/runs/${runId}`);
  } catch (e: any) {
    return (
      <>
        <h1>Run</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  return (
    <>
      <h1 className="mono">{run.id}</h1>
      <p className="sub">
        <Link href={`/evals/${key}`}>{key}</Link>{" "}
        <span className="mono small muted">{run.runner}</span>{" "}
        <span className={`tag ${run.status === "completed" ? "ok" : run.status === "failed" ? "bad" : "warn"}`}>
          {run.status}
        </span>{" "}
        <span className="small muted">{ts(run.created_at)}</span>
      </p>

      {run.summary?.scorers && (
        <>
          <h2>Summary</h2>
          <Panel title={`${run.mode} · ${run.summary.cases} cases`}>
            <table>
              <thead>
                <tr><th>scorer</th><th className="num">mean</th><th className="num">min</th><th className="num">max</th><th className="num">pass rate</th></tr>
              </thead>
              <tbody>
                {Object.entries(run.summary.scorers).map(([k, v]: any) => (
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
        </>
      )}

      <h2>Case results</h2>
      <div className="panel scroll-x">
        {(run.results || []).length === 0 ? (
          <div className="body muted small">No results recorded.</div>
        ) : (
          <table>
            <thead>
              <tr><th>case</th><th>scorer</th><th className="num">score</th><th>passed</th><th>output</th></tr>
            </thead>
            <tbody>
              {run.results.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="mono small">{r.case_id}</td>
                  <td className="small muted">{r.scorer}</td>
                  <td className="num small">{r.score}</td>
                  <td>
                    <span className={`tag ${r.passed ? "ok" : "bad"}`}>{r.passed ? "pass" : "fail"}</span>
                  </td>
                  <td className="small wrap muted" style={{ maxWidth: 300 }}>
                    {typeof r.output === "string" ? r.output : JSON.stringify(r.output)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
