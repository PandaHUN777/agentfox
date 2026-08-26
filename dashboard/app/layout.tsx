import type { Metadata } from "next";
import { Albert_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";

const albertSans = Albert_Sans({ subsets: ["latin"], variable: "--font-sans" });
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, safeApi } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Wordmark } from "@/components/Logo";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { CommandSearch } from "@/components/CommandSearch";
import { SideNav } from "@/components/SideNav";
import { TopbarStats } from "@/components/TopbarStats";
import "./globals.css";

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
 * be able to guess which group a page lives in before clicking it. Ordered as
 * the natural pipeline: see what's running and what's wrong, configure what's
 * allowed, test whether it holds up, report on it.
 */
const NAV: { group: string; items: [string, string][] }[] = [
  {
    group: "",
    items: [
      ["Overview", "/"],
      ["Start here", "/start"],
    ],
  },
  {
    group: "Monitor",
    items: [
      ["Agents", "/agents"],
      ["Findings", "/findings"],
      ["Traces", "/traces"],
    ],
  },
  {
    group: "Govern",
    items: [
      ["Policies", "/policies"],
      ["Entitlement", "/entitlement"],
      ["Approvals", "/approvals"],
    ],
  },
  {
    group: "Quality",
    items: [
      ["Evaluation", "/evals"],
      ["Sources", "/sources"],
    ],
  },
  {
    group: "Reporting",
    items: [
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
  { label: "Guardrail tuning", href: "/policies?tab=guardrails", group: "Policies" },
  { label: "Escalation", href: "/approvals?tab=escalation", group: "Approvals" },
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

  let me: any = null;
  let attention: any = null;
  if (signedIn && !isLoginPage) {
    [me, attention] = await Promise.all([
      safeApi("/api/me", null),
      safeApi("/api/attention", { items: [], total: 0 }),
    ]);
  }

  return (
    <html lang="en" className={`${albertSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {isLoginPage ? (
          <main className="login-main">{children}</main>
        ) : (
          <div className="shell">
            <nav className="side">
              <div className="brand">
                <Wordmark />
                <small>agent governance control plane</small>
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
