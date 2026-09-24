import Link from "next/link";
import { cookies } from "next/headers";
import { api, apiErrorProps, SESSION_COOKIE } from "@/lib/api";
import { ApiDown, Severity, Stat, StatLink, findingTypeInfo, ts } from "@/components/ui";
import { CATEGORY } from "./how-it-works/_public";
import { MarketingNav } from "@/components/marketing/nav";
import { Hero } from "@/components/marketing/hero";
import { Evidence, HowItWorks, Honesty, FAQ, CTA, Footer } from "@/components/marketing/sections";
import { Capabilities } from "@/components/marketing/capabilities";
import { Editions, WhyOpen } from "@/components/marketing/editions";

export const dynamic = "force-dynamic";

/**
 * layout.tsx titles every page "Nometria Control Plane", which was a fourth name for
 * the product in the first viewport alongside the strapline, the landing body line
 * and the API root's own description. A page-level export overrides the layout's
 * static title for this route only, so "/" now carries the same category name the
 * body uses. layout.tsx is owned by a concurrent change and is not touched.
 */
export const metadata = {
  title: `Nometria: ${CATEGORY}`,
  description:
    "Nometria checks every tool call an agent makes against what that agent was granted, and refuses the ones outside it, even after a prompt injection has convinced the model.",
};

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
        <h1>Overview</h1>
        <ApiDown {...apiErrorProps(e)} />
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
      <p className="sub">What needs a person, most severe first.</p>

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
                {attention.total - 6} more — <Link href="/findings">see all findings</Link>
              </div>
            )}
          </div>
        </>
      )}

      <h2>Inventory</h2>
      <div className="cards">
        <StatLink n={inv.agents} label="agents under management" href="/agents" />
        <StatLink n={inv.shadow} label="unregistered" tone={inv.shadow ? "bad" : "ok"} href="/agents" hint="Sending traffic but never registered, so nobody is accountable for them. Shown as an 'Unregistered agent' finding too." />
        <StatLink n={inv.unowned} label="without an owner" tone={inv.unowned ? "warn" : "ok"} href="/agents" />
        <StatLink
          n={onboarding.counts.boundaries}
          label="knowledge boundaries"
          tone={onboarding.counts.boundaries ? "ok" : "warn"}
          href="/start"
        />
        <StatLink
          n={`${Math.round((posture.effectiveness || 0) * 100)}%`}
          label="control effectiveness"
          href="/compliance"
          hint="Of assessed controls only (effective ÷ effective+degraded+failing) — click through for the full breakdown, including not-yet-implemented controls."
        />
      </div>

      {onboarding.next && (
        <div className="note-panel">
          <strong>Next: {onboarding.next.title}.</strong> {onboarding.next.detail}{" "}
          <Link href="/start">Start here →</Link>
        </div>
      )}

      {/* Containment is the thing this product is actually for, and until now it
          appeared once, in body text, on Start here. Three sentences on the page
          everyone lands on, with the dependency stated rather than skipped. */}
      <div className="note-panel">
        <strong>What holds when a guardrail is fooled.</strong> The numbers above
        count text that a detector caught. The control underneath them does not read
        text at all: it checks the action — which tool, what arguments, where those
        arguments came from, and how much damage the tool can do — so an irreversible
        call built out of untrusted content is refused or sent for approval even when
        nothing flagged the prompt. It depends entirely on tools being declared
        honestly; a tool recorded as read-only that isn't, is not covered.{" "}
        <Link href="/policies">See it on Policies →</Link>
      </div>
    </>
  );
}

/* --- Public landing page --------------------------------------------------
 *
 * "/" is the URL a launch audience arrives at, and a signed-out visitor sees this
 * instead of a sign-in wall. The two things that need no account (the playground
 * and the benchmark evidence) are the two things it points at hardest.
 *
 * The page is composed entirely from components/marketing/*, which carry their own
 * stylesheet (app/marketing.css, the `.mk-*` layer) so the marketing surface and the
 * signed-in app can each look right without either one constraining the other. The
 * design language is the one this team already ships on dayotter.com.
 *
 * Every figure in those sections is copied from README.md or app/benchmark/page.tsx,
 * both of which name the results file each number comes from. Nothing is restated
 * from memory, and anything needing a new number links to /benchmark instead.
 */

function Landing() {
  return (
    <div className="mk">
      <MarketingNav />
      <main>
        {/* What it is, what is in it, whether it works, how you adopt it, what it
            costs, what it cannot do, and four questions. Proof sits after the product
            rather than before it: "8 of 8 contained" means nothing to someone who has
            not yet been told what containment is. The long version of each pillar is
            /product, because this page's job is to get someone to the playground or
            the repository, not to be the documentation. */}
        <Hero />
        <Capabilities />
        <Evidence />
        <HowItWorks />
        <Editions />
        <WhyOpen />
        <Honesty />
        <FAQ n={4} more />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

/**
 * "/" serves two different people. A signed-out visitor gets the public landing
 * page above; a signed-in user gets exactly the Overview they had before, with no
 * change to it.
 *
 * The cookie is the branch because it is the same signal middleware.ts and
 * layout.tsx use, so all three agree on one definition of "signed in" and the
 * chrome cannot disagree with the body. It is a UX branch, not a security one:
 * the landing page reads nothing and calls nothing, and Overview's own data comes
 * from the gateway, which still authenticates every request it serves.
 */
export default async function Home() {
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  if (!signedIn) return <Landing />;
  return <Overview />;
}
