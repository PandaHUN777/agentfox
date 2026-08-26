import Link from "next/link";
import { api, safeApi, ApiError } from "@/lib/api";
import { ApiDown, Panel, Empty } from "@/components/ui";
import { RepoTable } from "@/components/RepoTable";
import { TokenManager } from "@/components/TokenManager";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string }[] = [
  { key: "checklist", label: "Checklist" },
  { key: "connect", label: "Connect" },
  { key: "tokens", label: "API tokens" },
];

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

/**
 * Start here / Connect / API tokens used to be three separate nav items — all
 * three are "get this instance pointed at something real," just at different
 * steps, and splitting them cost three sidebar rows for one job. One page,
 * one URL, tabs — same pattern already proven on the Compliance page.
 */
export default async function Start({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    scan_run_id?: string;
    hosted_scan_run_id?: string;
    scan_error?: string;
  }>;
}) {
  const { tab: rawTab, scan_run_id, hosted_scan_run_id, scan_error } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab! : "checklist";

  return (
    <>
      <h1>Start here</h1>
      <p className="sub">
        Getting a fresh instance pointed at something real, end to end: connect a
        source, generate a token if you're integrating by hand, then work through
        what's still open. Codes like <span className="mono">P7</span> below
        reference this product's own numbering — see the{" "}
        <Link href="/glossary">Glossary</Link> if a term doesn't explain itself.
      </p>

      <div className="tabbar">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "checklist" ? "/start" : `/start?tab=${t.key}`}
            className={tab === t.key ? "active" : ""}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "checklist" && <ChecklistTab />}
      {tab === "connect" && (
        <ConnectTab scanRunId={scan_run_id} hostedScanRunId={hosted_scan_run_id} scanError={scan_error} />
      )}
      {tab === "tokens" && <TokensTab />}
    </>
  );
}

async function ChecklistTab() {
  let onboarding: any;
  try {
    onboarding = await api("/api/onboarding");
  } catch (e: any) {
    return <ApiDown error={String(e?.message || e)} />;
  }

  const { steps, completed, total, next, counts, connected } = onboarding;

  return (
    <>
      <div className="progress-line">
        <div className="progress-track">
          <span style={{ width: `${(completed / total) * 100}%` }} />
        </div>
        <span className="small muted">
          {completed} of {total} done
          {!connected && " · nothing is sending traffic yet"}
        </span>
      </div>

      <ol className="steps">
        {steps.map((step: any, i: number) => (
          <li key={step.id} className={step.done ? "done" : next?.id === step.id ? "now" : ""}>
            <span className="marker">{step.done ? "✓" : i + 1}</span>
            <div className="step-body">
              <div className="step-title">
                {step.title}
                {next?.id === step.id && <span className="tag accent">next</span>}
              </div>
              {step.id === "connect" ? (
                <Link href="/start?tab=connect" className="btn-github" style={{ display: "inline-block", marginBottom: 6 }}>
                  {step.done ? "Manage connection" : "Connect →"}
                </Link>
              ) : step.id === "boundary" ? (
                <Link href="/agents" className="cta" style={{ display: "inline-block", marginBottom: 6 }}>
                  {step.done ? "Manage knowledge boundaries →" : "Pick an agent to declare a boundary for →"}
                </Link>
              ) : (
                <code className="step-cmd">{step.command}</code>
              )}
              <div className="small muted">{step.detail}</div>
            </div>
          </li>
        ))}
      </ol>

      <h2>What is connected</h2>
      <div className="cards">
        <Mini n={counts.github_connections} label="github accounts" />
        <Mini n={counts.agents} label="agents" />
        <Mini n={counts.traces} label="traces" />
        <Mini n={counts.decisions} label="decisions" />
        <Mini n={counts.enforcing} label="enforced" />
        <Mini n={counts.boundaries} label="knowledge boundaries" />
        <Mini n={counts.sources} label="tiered sources" />
      </div>

      <div className="note-panel">
        <strong>Why observe mode is the default — with one exception.</strong> A
        governance layer that starts refusing production traffic because someone added
        an import is indefensible, however correct its policy — so the content-based
        policies (prompt injection, PII, safety) start in observe and only enforce once
        you promote them in the last step. <strong>Tool containment is different</strong>:
        it reasons about the action itself (which tool, with what arguments, from what
        provenance), not about prompt text, so it's much less prone to false positives —
        and it ships enforcing from the moment you install, on purpose, because it's the
        one control meant to hold even when everything upstream of it — including a
        content filter — got fooled. See it on the{" "}
        <Link href="/policies">Policies page</Link>.
      </div>

      <div className="note-panel">
        <strong>Not every detector is on by default.</strong> Some (Microsoft Presidio
        for PII, IBM Granite Guardian for safety, NVIDIA NeMo Guardrails, Guardrails AI)
        need extra install steps — a package extra, a self-hosted deployment, or
        licence acceptance — and aren't running in every deployment. Check what's
        actually active for yours on the{" "}
        <Link href="/policies?tab=guardrails">Guardrail tuning tab</Link> before assuming
        step 7 gives you full coverage.
      </div>
    </>
  );
}

function Mini({ n, label }: { n: number; label: string }) {
  return (
    <div className={`card ${n ? "" : "empty"}`}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
  );
}

type Repo = {
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string;
  updated_at: string;
};

async function ConnectTab({
  scanRunId,
  hostedScanRunId,
  scanError,
}: {
  scanRunId?: string;
  hostedScanRunId?: string;
  scanError?: string;
}) {
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

  const scan = scanRunId
    ? await safeApi<any>(`/api/integrations/github/scans/${scanRunId}`, null)
    : null;
  const hostedScan = hostedScanRunId
    ? await safeApi<any>(`/api/integrations/github/scans/${hostedScanRunId}`, null)
    : null;

  return (
    <>
      <p className="sub" style={{ marginTop: 16 }}>
        Two ways to point this at something real instead of seeded demo data,
        depending on what you can (or want to) share: hand over read access to a
        repository, or just point at a live API you already run. Either way nothing
        goes live until you approve it on the Agents and Policies pages. This finds
        the <strong>agents</strong> themselves — the code or endpoint that answers
        requests. Looking to register the data those agents read from instead — a
        database, wiki, or knowledge base used for retrieval? That&rsquo;s{" "}
        <Link href="/sources">Sources</Link>.
      </p>

      {scanError && <div className="error">Scan failed: {scanError}</div>}

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

      {!repos ? (
        // Neither option is connected yet — both cards are compact, so a
        // side-by-side comparison actually works here.
        <div className="grid2" style={{ alignItems: "start" }}>
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

          <HostedApiPanel />
        </div>
      ) : (
        // GitHub is connected — the repo table needs real width to be usable,
        // so it gets the full page instead of being squeezed into a half
        // column next to a form a fraction of its size.
        <>
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

          <div style={{ maxWidth: 480, marginTop: 20 }}>
            <HostedApiPanel />
          </div>
        </>
      )}
    </>
  );
}

function HostedApiPanel() {
  return (
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
  );
}

function TokensTab() {
  return (
    <>
      <p className="sub" style={{ marginTop: 16 }}>
        For the CLI and SDK — a token acts as you, scoped to your workspace. Set it as{" "}
        <code className="mono">NOMETRIA_API_TOKEN</code> or pass it as a bearer token to
        the gateway directly.
      </p>
      <TokenManager />
    </>
  );
}
