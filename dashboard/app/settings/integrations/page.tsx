import Link from "next/link";
import { api, safeApi, ApiError } from "@/lib/api";
import { ApiDown, Panel, Empty } from "@/components/ui";
import { RepoTable } from "@/components/RepoTable";

export const dynamic = "force-dynamic";

type Repo = {
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string;
  updated_at: string;
};

const inputStyle = {
  width: "100%",
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
} as const;

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
        {label}
      </label>
      <input style={inputStyle} {...props} />
    </div>
  );
}

export default async function Integrations({
  searchParams,
}: {
  searchParams: Promise<{
    scan_run_id?: string;
    hosted_scan_run_id?: string;
    scan_error?: string;
  }>;
}) {
  const { scan_run_id, hosted_scan_run_id, scan_error } = await searchParams;

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
  const hostedScan = hosted_scan_run_id
    ? await safeApi<any>(`/api/integrations/github/scans/${hosted_scan_run_id}`, null)
    : null;

  return (
    <>
      <h1>Connect</h1>
      <p className="sub">
        Two ways to point this at something real instead of seeded demo data,
        depending on what you can (or want to) share: hand over read access to a
        repository, or just point at a live API you already run. Either way nothing
        goes live until you approve it on the Agents and Policies pages.
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

      {hostedScan && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="head">
            <span>Scan of {hostedScan.summary?.endpoint_url || "your API"}</span>
            <span className="note">{hostedScan.status}</span>
          </div>
          <div className="body small">
            <div>
              Operations found: {Object.values(hostedScan.summary?.sites || {}).reduce(
                (a: number, b: any) => a + Number(b),
                0,
              )}
            </div>
            <div>
              Proposed:{" "}
              {hostedScan.summary?.agents_proposed?.length || 0} agent(s),{" "}
              {hostedScan.summary?.policies_proposed?.length || 0} polic{"y/ies"}
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

      <div className="grid2" style={{ alignItems: "start" }}>
        {!repos ? (
          <Panel title="Give us codebase access">
            <div className="body">
              <p className="small muted">
                We statically read your code (the same scanner behind{" "}
                <code className="mono">nometria check</code>) for LangChain/LangGraph/
                CrewAI/AutoGen usage — no import, no execution. No account connected
                yet.
              </p>
              <a
                className="btn-github"
                style={{ display: "inline-block" }}
                href="/api/auth/github/login"
              >
                Connect GitHub
              </a>
            </div>
          </Panel>
        ) : (
          <div>
            <p className="small muted" style={{ maxWidth: "70ch" }}>
              This is every repository the GitHub account{" "}
              <strong>{repos.github_login}</strong> can see — your own projects and
              anything shared with you, personal or your company's. We only read code
              structure to guess what AI frameworks you're using; we never run,
              execute, or modify anything in it. Look for the{" "}
              <span className="tag ok">company account</span> tag to spot your
              organization's repos among personal ones.
            </p>
            <Panel
              title={`Repositories — ${repos.github_login}`}
              note={<a href="/api/auth/github/login">reconnect</a>}
            >
              {repos.repos.length === 0 ? (
                <Empty>No repositories visible to this GitHub account.</Empty>
              ) : (
                <RepoTable repos={repos.repos} />
              )}
            </Panel>
          </div>
        )}

        <Panel title="Or point us at a hosted API">
          <div className="body">
            <p className="small muted" style={{ marginTop: 0 }}>
              No repo access needed. Give us the live endpoint and, if you have one,
              its OpenAPI/Swagger spec URL — we fetch and read the spec document only,
              never call the API itself, and propose a draft agent from what it
              describes.
            </p>
            <form action="/api/integrations/hosted-api/scan" method="POST" className="stack">
              <Field
                label="API endpoint"
                type="url"
                name="endpoint_url"
                placeholder="https://api.yourcompany.com"
                required
              />
              <Field
                label="OpenAPI / Swagger spec URL (optional)"
                type="url"
                name="openapi_spec_url"
                placeholder="https://api.yourcompany.com/openapi.json"
              />
              <Field
                label="Docs URL (optional)"
                type="url"
                name="docs_url"
                placeholder="https://docs.yourcompany.com"
              />
              <Field
                label="What does it do?"
                type="text"
                name="purpose"
                placeholder="Internal support-ticket assistant"
              />
              <button type="submit" className="btn-scan">
                Connect &amp; scan
              </button>
            </form>
          </div>
        </Panel>
      </div>
    </>
  );
}
