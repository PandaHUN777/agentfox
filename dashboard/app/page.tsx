import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, Severity, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Nobody opens a governance dashboard to ask "what do we have" — they open it to ask
 * "is anything wrong right now". A screen that leads with an inventory makes the
 * reader do the ranking themselves, so this one leads with what needs a human and
 * puts the inventory underneath.
 */
export default async function Overview() {
  let attention: any, onboarding: any, agents: any, posture: any;
  try {
    [attention, onboarding, agents, posture] = await Promise.all([
      api("/api/attention"),
      api("/api/onboarding"),
      api("/api/agents"),
      api("/api/compliance/status"),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Overview</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  // Not connected and quiet are the same picture and opposite meanings. Saying which
  // one this is, is the single most useful thing this page does on day one.
  if (!onboarding.connected) {
    return (
      <>
        <h1>Overview</h1>
        <div className="hero empty">
          <div className="hero-title">Nothing is sending traffic yet</div>
          <p>
            That is not the same as nothing being wrong. Add one line to your entry point
            and this page fills in from real requests:
          </p>
          <code className="hero-code">import nometria; nometria.auto()</code>
          <p className="small muted">
            Governs every model call in the process — traced, evaluated, audited, and
            blocking nothing until you say so.
          </p>
          <Link href="/start" className="cta">
            Start here →
          </Link>
        </div>
      </>
    );
  }

  const counts = attention.counts || {};
  const inv = agents.inventory;

  return (
    <>
      <h1>Overview</h1>
      <p className="sub">
        What needs a human, first. Inventory and posture are underneath.
      </p>

      {attention.quiet ? (
        <div className="hero ok">
          <div className="hero-title">Nothing needs attention</div>
          <p className="small muted">
            {onboarding.counts.traces} trace(s) governed,{" "}
            {onboarding.counts.enforcing > 0
              ? `${onboarding.counts.enforcing} decision(s) enforced`
              : "all decisions in observe mode — recorded, nothing blocked"}
            .
          </p>
        </div>
      ) : (
        <>
          <div className="cards">
            <div className={`card ${counts.critical ? "bad" : "ok"}`}>
              <div className="n">{counts.critical || 0}</div>
              <div className="l">critical</div>
            </div>
            <div className={`card ${counts.high ? "warn" : "ok"}`}>
              <div className="n">{counts.high || 0}</div>
              <div className="l">high</div>
            </div>
            <div className="card">
              <div className="n">{counts.blocked_in_window || 0}</div>
              <div className="l">blocked in {attention.window_hours}h</div>
            </div>
            <div className="card">
              <div className="n">{counts.observed_in_window || 0}</div>
              <div className="l">observed, not blocked</div>
            </div>
          </div>

          <h2>Needs attention</h2>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>what</th>
                  <th>subject</th>
                  <th>when</th>
                </tr>
              </thead>
              <tbody>
                {attention.items.map((item: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <Severity value={item.severity} />
                    </td>
                    <td>
                      <Link href={item.href}>{item.title}</Link>
                      <div className="small muted mono">{item.type}</div>
                    </td>
                    <td className="mono small">{item.subject}</td>
                    <td className="small muted">{ts(item.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {attention.total > attention.items.length && (
              <div className="body small muted">
                {attention.total - attention.items.length} more —{" "}
                <Link href="/findings">see all findings</Link>
              </div>
            )}
          </div>
        </>
      )}

      <h2>Inventory</h2>
      <div className="cards">
        <Card n={inv.agents} label="agents under management" href="/agents" />
        <Card n={inv.shadow} label="shadow (ungoverned)" tone={inv.shadow ? "bad" : "ok"} href="/agents" />
        <Card n={inv.unowned} label="without an owner" tone={inv.unowned ? "warn" : "ok"} href="/agents" />
        <Card
          n={onboarding.counts.boundaries}
          label="knowledge boundaries"
          tone={onboarding.counts.boundaries ? "ok" : "warn"}
          href="/start"
        />
        <Card
          n={`${Math.round((posture.effectiveness || 0) * 100)}%`}
          label="control effectiveness"
          href="/compliance"
        />
      </div>

      {onboarding.next && (
        <div className="note-panel">
          <strong>Next: {onboarding.next.title}.</strong> {onboarding.next.detail}{" "}
          <Link href="/start">Start here →</Link>
        </div>
      )}
    </>
  );
}

function Card({
  n,
  label,
  tone,
  href,
}: {
  n: number | string;
  label: string;
  tone?: string;
  href: string;
}) {
  return (
    <Link href={href} className={`card link ${tone || ""}`}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </Link>
  );
}
