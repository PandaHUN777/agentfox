import type { Metadata } from "next";
import Link from "next/link";
import { api, apiErrorProps } from "@/lib/api";
import { appPageMetadata } from "@/lib/site";
import { ApiDown, InfoTip, Severity, Stat, StatLink, findingTypeInfo, ts } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The dashboard, at `/app`.
 *
 * It used to be the signed-in branch of `/`, which had two consequences worth
 * writing down. A signed-in visitor could not reach the marketing site at all
 * without signing out — there was no URL that served it to them. And `/` was the
 * one route in the app whose chrome depended on a cookie, which is why both
 * `middleware.ts` and `layout.tsx` carried a special case for it.
 *
 * Every private route now lives under `/app`, so "is this page private" is a
 * prefix test rather than a list that has to be kept in step in three files.
 */
// `appPageMetadata`, not a literal: it also sets `alternates: { canonical: null }`,
// without which this page inherits the root layout's `canonical: "/"` and declares
// itself a duplicate of the marketing home page.
export const metadata: Metadata = appPageMetadata("Overview");

/**
 * Nobody opens a governance dashboard to ask "what do we have" — they open it to ask
 * "is anything wrong right now". A screen that leads with an inventory makes the
 * reader do the ranking themselves, so this one leads with what needs a human and
 * puts the inventory underneath.
 */
async function Overview() {
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
        <PageHeader title="Overview" />
        <ApiDown {...apiErrorProps(e)} />
      </>
    );
  }

  // Not connected and quiet are the same picture and opposite meanings. Saying which
  // one this is, is the single most useful thing this page does on day one.
  if (!onboarding.connected) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="hero empty">
          <div className="hero-title">Nothing is sending traffic yet</div>
          <p>Which is not the same as nothing being wrong. One line, and this fills in:</p>
          <code className="hero-code">import agentfox; agentfox.auto()</code>
          <p className="small muted">
            Every model call in the process, traced and recorded. Blocks nothing until
            you promote a policy.
          </p>
          <Link href="/app/start" className="cta">
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
      <PageHeader title="Overview" sub="What needs a person, most severe first." />

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
            <Stat
              n={counts.critical || 0}
              label="critical problems"
              tone={counts.critical ? "bad" : "ok"}
              hint="Issues serious enough that someone should look today — a customer-facing failure, a data exposure, something a regulator would ask about."
            />
            <Stat
              n={counts.high || 0}
              label="high-priority problems"
              tone={counts.high ? "warn" : "ok"}
              hint="Worth fixing this week — not an emergency, but not fine to ignore either."
            />
            <Stat
              n={counts.blocked_in_window || 0}
              label={`stopped automatically, last ${attention.window_hours}h`}
              hint="Requests a guardrail actually refused before they reached the customer — this is the system working, not a problem to fix."
            />
            <Stat
              n={counts.observed_in_window || 0}
              label={`flagged but allowed, last ${attention.window_hours}h`}
              hint="Requests a guardrail noticed and logged but didn't stop — the policy for this kind of issue is still in 'watch, don't block' mode."
            />
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
                {attention.items.slice(0, 6).map((item: any, i: number) => {
                  const typeInfo = findingTypeInfo(item.type);
                  return (
                    <tr key={i}>
                      <td>
                        <Severity value={item.severity} />
                      </td>
                      <td>
                        <Link href={item.href}>{item.title}</Link>
                        <div className="small muted">{typeInfo.blurb || typeInfo.label}</div>
                      </td>
                      <td className="mono small">{item.subject}</td>
                      <td className="small muted">{ts(item.at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {attention.total > 6 && (
              <div className="body small muted">
                {attention.total - 6} more — <Link href="/app/findings">see all findings</Link>
              </div>
            )}
          </div>
        </>
      )}

      <h2>Inventory</h2>
      <div className="cards">
        <StatLink n={inv.agents} label="agents under management" href="/app/agents" />
        <StatLink n={inv.shadow} label="unregistered" tone={inv.shadow ? "bad" : "ok"} href="/app/agents" hint="Sending traffic but never registered, so nobody is accountable for them. Shown as an 'Unregistered agent' finding too." />
        <StatLink n={inv.unowned} label="without an owner" tone={inv.unowned ? "warn" : "ok"} href="/app/agents" />
        <StatLink
          n={onboarding.counts.boundaries}
          label="knowledge boundaries"
          tone={onboarding.counts.boundaries ? "ok" : "warn"}
          href="/app/start"
        />
        <StatLink
          n={`${Math.round((posture.effectiveness || 0) * 100)}%`}
          label="control effectiveness"
          href="/app/compliance"
          hint="Of assessed controls only (effective ÷ effective+degraded+failing) — click through for the full breakdown, including not-yet-implemented controls."
        />
      </div>

      {onboarding.next && (
        <div className="note-panel">
          <strong>Next: {onboarding.next.title}.</strong>{" "}
          <InfoTip text={onboarding.next.detail} />{" "}
          <Link href="/app/start">Start here &rarr;</Link>
        </div>
      )}

      {/* Containment is what this product is actually for, and the numbers above do
          not measure it. Two sentences and a tooltip, where this was a ninety-word
          paragraph: the caveat is the part that must not be lost, so it is the part
          that moved into the tooltip rather than the part that got cut. */}
      <div className="note-panel">
        <strong>What holds when a guardrail is fooled.</strong> The counts above are
        text a detector caught. Underneath, every tool call is checked against what
        that agent was granted, reading no text at all.{" "}
        <InfoTip text="It checks which tool, what the arguments are, where those argument values came from, and how much damage the tool can do — so an irreversible call built out of untrusted content is refused or sent for approval even when nothing flagged the prompt. It depends entirely on tools being declared honestly: a tool recorded as read-only that is not read-only is not covered by any of this." />{" "}
        <Link href="/app/policies">See it on Policies &rarr;</Link>
      </div>
    </>
  );
}

export default async function DashboardPage() {
  return <Overview />;
}
