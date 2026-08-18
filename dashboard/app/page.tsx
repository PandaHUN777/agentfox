import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, ControlStatus, Panel, Severity, Stat, Verdict, pct, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Overview() {
  let agents: any, findings: any, traces: any, posture: any, version: any;
  try {
    [agents, findings, traces, posture, version] = await Promise.all([
      api("/api/agents"),
      api("/api/findings?status=open&limit=10"),
      api("/api/traces?limit=8"),
      api("/api/compliance/status"),
      api("/api/version"),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Overview</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const inv = agents.inventory;
  const counts = posture.counts || {};
  const assessed =
    (counts.effective || 0) + (counts.degraded || 0) + (counts.failing || 0);

  return (
    <>
      <h1>Overview</h1>
      <p className="sub">
        Every agent in the environment, what it is allowed to do, whether it works, and
        the evidence for all three.
      </p>

      <div className="cards">
        <Stat n={inv.agents} label="agents under management" />
        <Stat n={inv.shadow} label="shadow (ungoverned)" tone={inv.shadow ? "bad" : "ok"} />
        <Stat n={inv.unowned} label="without an owner" tone={inv.unowned ? "warn" : "ok"} />
        <Stat
          n={findings.findings.length}
          label="open findings"
          tone={findings.findings.length ? "warn" : "ok"}
        />
        <Stat n={pct(posture.effectiveness)} label="control effectiveness" />
      </div>

      <h2>Control posture</h2>
      <div className="panel">
        <div className="body">
          <div className="bar" title={`${assessed} controls assessed`}>
            <span className="eff" style={{ width: `${((counts.effective || 0) / (posture.controls || 1)) * 100}%` }} />
            <span className="deg" style={{ width: `${((counts.degraded || 0) / (posture.controls || 1)) * 100}%` }} />
            <span className="fail" style={{ width: `${((counts.failing || 0) / (posture.controls || 1)) * 100}%` }} />
          </div>
          <div className="row small muted" style={{ marginTop: 10 }}>
            <span><span className="tag ok">{counts.effective || 0}</span> effective</span>
            <span><span className="tag warn">{counts.degraded || 0}</span> degraded</span>
            <span><span className="tag bad">{counts.failing || 0}</span> failing</span>
            <span><span className="tag">{counts.not_implemented || 0}</span> not implemented</span>
          </div>
          {posture.failing_controls?.length > 0 && (
            <div className="small" style={{ marginTop: 12 }}>
              <span className="muted">failing: </span>
              {posture.failing_controls.map((k: string) => (
                <Link key={k} href="/compliance" className="mono" style={{ marginRight: 8 }}>
                  {k}
                </Link>
              ))}
            </div>
          )}
          <div className="small muted" style={{ marginTop: 12 }}>
            Status is computed from telemetry — detector coverage, decision coverage, audit-chain
            verification — not from an attestation form.
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 22 }}>
        <Panel title="Open findings" note={<Link href="/findings">all →</Link>}>
          {findings.findings.length === 0 ? (
            <div className="body muted small">Nothing open.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>severity</th>
                  <th>type</th>
                  <th>finding</th>
                </tr>
              </thead>
              <tbody>
                {findings.findings.map((f: any) => (
                  <tr key={f.id}>
                    <td><Severity value={f.severity} /></td>
                    <td className="mono small">{f.type}</td>
                    <td className="wrap small">{f.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Recent execution paths" note={<Link href="/traces">all →</Link>}>
          {traces.traces.length === 0 ? (
            <div className="body muted small">No traffic recorded yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>agent</th>
                  <th>verdict</th>
                  <th>when</th>
                </tr>
              </thead>
              <tbody>
                {traces.traces.map((t: any) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/traces/${t.id}`} className="mono small">
                        {t.agent}
                      </Link>
                    </td>
                    <td><Verdict value={t.verdict} /></td>
                    <td className="muted small">{ts(t.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <h2>Agents</h2>
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr>
              <th>agent</th>
              <th>environment</th>
              <th>risk tier</th>
              <th>owner</th>
              <th>framework</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {agents.agents.map((a: any) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/agents/${a.slug}`} className="mono">{a.slug}</Link>
                </td>
                <td className="small">{a.environment}</td>
                <td>
                  <span className={`tag ${a.risk_tier === "high" || a.risk_tier === "prohibited" ? "bad" : ""}`}>
                    {a.risk_tier}
                  </span>
                </td>
                <td className="small">
                  {a.owner_email || <span className="tag warn">unowned</span>}
                </td>
                <td className="small muted">{a.framework || "—"}</td>
                <td>
                  {a.registered ? (
                    <span className="tag ok">registered</span>
                  ) : (
                    <span className="tag bad">shadow</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Platform</h2>
      <div className="panel">
        <div className="body small mono muted">
          code {version.code_version} · catalog {version.catalog_version} (
          {version.catalog_review_status}) · engine {version.policy_engine} · provider{" "}
          {version.default_provider} · default mode {version.default_policy_mode} · fail{" "}
          {version.fail_mode} · budget {version.enforcement_budget_ms}ms · egress{" "}
          {String(version.egress_allowed)}
        </div>
      </div>
    </>
  );
}
