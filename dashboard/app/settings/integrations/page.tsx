import Link from "next/link";
import { api, safeApi, ApiError } from "@/lib/api";
import { ApiDown, Panel, Empty, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

type Repo = {
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string;
  updated_at: string;
};

export default async function Integrations({
  searchParams,
}: {
  searchParams: Promise<{ scan_run_id?: string; scan_error?: string }>;
}) {
  const { scan_run_id, scan_error } = await searchParams;

  let repos: { github_login: string; repos: Repo[] } | null = null;
  let connectError: string | null = null;
  try {
    repos = await api("/api/integrations/github/repos");
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 404) {
      // not connected yet — not an error, the normal first-visit state
    } else {
      connectError = String(e?.message || e);
    }
  }

  const scan = scan_run_id
    ? await safeApi<any>(`/api/integrations/github/scans/${scan_run_id}`, null)
    : null;

  return (
    <>
      <h1>Connect</h1>
      <p className="sub">
        Point this at a real repository instead of seeded demo data: connect GitHub,
        pick a repo, and the static scanner (the same one behind{" "}
        <code className="mono">nometria check</code>) looks for LangChain/LangGraph/
        CrewAI/AutoGen usage — no import, no execution — and proposes draft agents
        and policies for you to review on the Agents and Policies pages. Nothing
        goes live until you approve it.
      </p>

      {scan_error && <div className="error">Scan failed: {scan_error}</div>}
      {scan && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="head">
            <span>Scan of {scan.repo_full_name}</span>
            <span className="note">{scan.status}</span>
          </div>
          <div className="body small">
            <div>Frameworks: {scan.summary?.frameworks?.join(", ") || "none detected"}</div>
            <div>
              Proposed:{" "}
              {scan.summary?.agents_proposed?.length || 0} agent(s),{" "}
              {scan.summary?.policies_proposed?.length || 0} polic{"y/ies"}
            </div>
            <div style={{ marginTop: 8 }}>
              <Link href="/agents">Review agents →</Link>
              {"  "}
              <Link href="/policies">Review policies →</Link>
            </div>
          </div>
        </div>
      )}

      {connectError && <ApiDown error={connectError} />}

      {!repos ? (
        <Panel title="GitHub">
          <div className="body">
            <p className="small muted">No GitHub account connected yet.</p>
            <a className="btn-github" style={{ display: "inline-block" }} href="/api/auth/github/login">
              Connect GitHub
            </a>
          </div>
        </Panel>
      ) : (
        <Panel title={`Repositories — ${repos.github_login}`} note={<a href="/api/auth/github/login">reconnect</a>}>
          {repos.repos.length === 0 ? (
            <Empty>No repositories visible to this GitHub account.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Branch</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {repos.repos.map((r) => (
                  <tr key={r.full_name}>
                    <td>
                      <div>{r.full_name}</div>
                      {r.description && <div className="small muted">{r.description}</div>}
                    </td>
                    <td className="mono small">{r.default_branch}</td>
                    <td className="small muted">{ts(r.updated_at)}</td>
                    <td>
                      <form action="/api/integrations/github/scan" method="POST">
                        <input type="hidden" name="repo_full_name" value={r.full_name} />
                        <input type="hidden" name="ref" value={r.default_branch} />
                        <button type="submit" className="btn-scan">
                          Scan
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </>
  );
}
