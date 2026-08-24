import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, safeApi } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Wordmark } from "@/components/Logo";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { CommandSearch } from "@/components/CommandSearch";
import { NavIcon } from "@/components/NavIcons";
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
      ["Connect", "/settings/integrations"],
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
      ["Guardrails", "/guardrails"],
      ["Entitlement", "/entitlement"],
    ],
  },
  {
    group: "Quality",
    items: [
      ["Evaluation", "/evals"],
      ["Escalation", "/escalation"],
      ["Sources", "/sources"],
    ],
  },
  {
    group: "Reporting",
    items: [
      ["Compliance", "/compliance"],
      ["Board view", "/board"],
    ],
  },
];

const NAV_FLAT = NAV.flatMap(({ group, items }) =>
  items.map(([label, href]) => ({ label, href, group: group || "Home" })),
);

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
    <html lang="en">
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
              {NAV.map(({ group, items }) => (
                <div key={group || "root"}>
                  {group && <div className="group">{group}</div>}
                  {items.map(([label, href]) => {
                    const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <Link key={href} href={href} className={isActive ? "active" : ""}>
                        <NavIcon href={href} />
                        <span>{label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
              <ThemeToggle />
            </nav>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              {signedIn && (
                <div className="topbar">
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
