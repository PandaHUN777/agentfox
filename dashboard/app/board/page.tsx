import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, DraftCaveat, Panel, Stat, StatLink, pct } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function Board() {
  let v: any;
  try {
    v = await api("/api/board");
  } catch (e: any) {
    return (
      <>
        <h1>Board view</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const inv = v.inventory;
  const f = v.open_findings;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Board view</h1>
          <p className="sub" style={{ marginBottom: 0 }}>
            The printable snapshot — one page for someone outside the team: agent
            population by risk class, control effectiveness, open findings, and the
            regulatory calendar, frozen at the moment you generate it. For day-to-day
            monitoring, use <Link href="/">Overview</Link> instead — this page won't
            update itself while you're looking at it. Generated{" "}
            {v.generated_at?.slice(0, 19)}.
            {v.seed_agents > 0 && (
              <>
                {" "}<span className="tag" style={{ marginLeft: 4 }}>
                  {v.seed_agents} of {inv.agents} agent(s) below {v.seed_agents === 1 ? "is" : "are"} sample data from `nometria seed`
                </span>
              </>
            )}
          </p>
        </div>
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
