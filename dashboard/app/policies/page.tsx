import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { ApiDown, Empty, Panel, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Policies({
  searchParams,
}: {
  searchParams: Promise<{ review_error?: string; agent?: string }>;
}) {
  const { review_error, agent } = await searchParams;
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
    return (
      <>
        <h1>Policies</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const proposed = policies.policies.filter((p: any) => p.proposed);

  return (
    <>
      <h1>Policies</h1>
      <p className="sub">
        The actual rules an agent has to follow — written once, and used both to
        decide what to block in real time and to prove to an auditor what's
        enforced. Every policy starts in <strong>observe</strong> mode: it watches
        and records what it would have blocked, without actually blocking anything,
        so you can check it's not too trigger-happy before switching it to{" "}
        <strong>enforce</strong>, where it actually stops matching requests. A policy
        that starts blocking things the moment it's turned on is how a real safety
        rule ends up disabled by an annoyed engineer within a week — this two-step
        exists to prevent that. Rule and control codes are decoded on the{" "}
        <Link href="/glossary">Glossary</Link> page.
      </p>

      {review_error && <div className="error">{review_error}</div>}

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
        been suppressed — see <Link href="/guardrails">Guardrails</Link>.
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
