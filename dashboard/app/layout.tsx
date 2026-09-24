import type { Metadata } from "next";
import { Albert_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

const albertSans = Albert_Sans({ subsets: ["latin"], variable: "--font-sans" });
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, safeApi } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Wordmark } from "@/components/Logo";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { CommandSearch } from "@/components/CommandSearch";
import { SideNav, type NavItem } from "@/components/SideNav";
import { TopbarStats } from "@/components/TopbarStats";
import "./globals.css";
import "./marketing.css";

// Runs before paint so a stored theme choice never flashes the wrong colors on load.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("nometria-theme");if(t&&t!=="system")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Nometria Control Plane",
  description:
    "See every agent, control what it can do, prove it works, and demonstrate compliance.",
};

/**
 * Plain, predictable category nouns rather than a rhetorical-question framing
 * ("What is it" / "Does it work") — a newcomer scanning the sidebar once should
 * be able to guess which group a page lives in before clicking it.
 *
 * Grouping and labels follow the four-stage lifecycle (Discover / Monitor /
 * Test / Govern) that recurs across the AI-agent-governance and AI-security
 * category researched for this pass — Noma, Pillar Security, HiddenLayer,
 * SplxAI, Lasso, and Cisco AI Defense all converge on some version of
 * discover-what-exists -> test/validate -> runtime-protect -> govern. Two
 * splits from the previous grouping follow that research directly:
 *
 * - "Discover" (Agents, Sources) is pulled out on its own because "Discover"
 *   is the single most consistently-used word across that whole category for
 *   exactly this — an inventory of what exists (agents, MCP servers, data
 *   sources) — not a Nometria-specific choice.
 * - "Monitor" keeps Findings and Traces, since those are the ongoing-activity
 *   record rather than the inventory itself, and "Monitor" was never actually
 *   flagged as unclear by the research — only "Quality" and the standalone
 *   "Reporting" group of one were.
 *
 * Compliance sits in Govern, not its own "Reporting" group of one — every
 * comparable governance product treats framework/control mapping as part of
 * governance, not a separate top-level stage, and a group with a single row
 * was just an extra click for no organizing benefit.
 *
 * Guardrail tuning and Escalation get their own (indented, `sub: true`) rows
 * rather than living only as tabs a user has to already know to click into —
 * both are substantial pages in their own right (per-detector precision/
 * latency/suppressions data; the missed-escalation and hand-off queue) that
 * were previously reachable only after landing on Policies/Approvals first.
 */
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "",
    items: [
      ["Overview", "/"],
      ["Start here", "/start"],
    ],
  },
  {
    group: "Discover",
    items: [
      ["Agents", "/agents"],
      ["Verified sources", "/sources"],
    ],
  },
  {
    group: "Monitor",
    items: [
      ["Findings", "/findings"],
      ["Traces", "/traces"],
    ],
  },
  {
    group: "Test",
    items: [
      ["Evaluation", "/evals"],
    ],
  },
  {
    group: "Govern",
    items: [
      ["Policies", "/policies"],
      ["Guardrail tuning", "/policies?tab=guardrails", true],
      ["Access Control", "/entitlement"],
      ["Approvals", "/approvals"],
      ["Escalation", "/approvals?tab=escalation", true],
      ["Compliance", "/compliance"],
    ],
  },
];

/**
 * Destinations that used to be their own sidebar item before the nav was
 * consolidated into tabs — findable by name in search even though the
 * sidebar itself only shows the parent page. Losing a sidebar item is not
 * the same as losing the ability to find the thing by typing its name.
 */
const NAV_SEARCH_ONLY: { label: string; href: string; group: string }[] = [
  { label: "Connect GitHub", href: "/start?tab=connect", group: "Start here" },
  { label: "Connect a hosted API", href: "/start?tab=connect", group: "Start here" },
  { label: "API tokens", href: "/start?tab=tokens", group: "Start here" },
  { label: "Board view", href: "/compliance?tab=board", group: "Compliance" },
  { label: "Glossary", href: "/glossary", group: "Reference" },
];

const NAV_FLAT = NAV.flatMap(({ group, items }) =>
  items.map(([label, href]) => ({ label, href, group: group || "Home" })),
).concat(NAV_SEARCH_ONLY);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  // Set by middleware.ts. Falls back to showing the chrome — an unset header means
  // middleware didn't run (e.g. some dev edge cases), and hiding the whole app by
  // default on an edge case is the wrong failure direction.
  const pathname = (await headers()).get("x-pathname") || "";
  const isLoginPage = pathname === "/login";
  // The public playground (/playground) is unauthenticated by design (see
  // middleware.ts) and has its own minimal header — the authenticated sidebar/
  // topbar chrome would be both wrong (nothing here is signed in) and a giveaway
  // of internal nav to an anonymous visitor.
  // /benchmark is public and is linked from the playground, so a signed-out visitor
  // reaches it. Wrapping it in the app chrome would hand them a sidebar whose every
  // row bounces to sign-in.
  //
  // The same reasoning covers the two pages added for signed-out visitors:
  // /how-it-works is public explanation and carries its own header, and "/" is the
  // public landing page *only when there is no session*. A signed-in user asking for
  // "/" still gets Overview inside the full app chrome, exactly as before, which is
  // why the root check is the one entry here that depends on `signedIn`.
  const isPublicHome = pathname === "/" && !signedIn;
  const isChromelessPage =
    isLoginPage ||
    isPublicHome ||
    pathname.startsWith("/how-it-works") ||
    pathname.startsWith("/playground") ||
    pathname.startsWith("/benchmark");

  let me: any = null;
  let attention: any = null;
  if (signedIn && !isChromelessPage) {
    [me, attention] = await Promise.all([
      safeApi("/api/me", null),
      safeApi("/api/attention", { items: [], total: 0 }),
    ]);
  }

  return (
    <html lang="en" className={`${albertSans.variable} ${GeistMono.variable} ${GeistSans.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {isChromelessPage ? (
          <main className="login-main">{children}</main>
        ) : (
          <div className="shell">
            <nav className="side">
              <div className="brand">
                <Wordmark />
                <small>AI agent governance platform</small>
              </div>
              <SideNav nav={NAV} />
              <ThemeToggle />
            </nav>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              {signedIn && (
                <div className="topbar">
                  {attention?.counts && <TopbarStats counts={attention.counts} />}
                  <CommandSearch nav={NAV_FLAT} />
                  <NotificationsBell items={attention?.items?.slice(0, 6) || []} total={attention?.total || 0} />
                  {me && <AccountMenu email={me.email} workspace={me.workspace} role={me.role} />}
                </div>
              )}
              <main>{children}</main>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
