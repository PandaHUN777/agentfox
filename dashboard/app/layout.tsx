import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nometria Control Plane",
  description:
    "See every agent, control what it can do, prove it works, and demonstrate compliance.",
};

/** Grouped by the four questions an enterprise asks about any agent (PRD §2.2). */
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
    group: "What is it",
    items: [
      ["Agents", "/agents"],
      ["Findings", "/findings"],
    ],
  },
  {
    group: "What can it do",
    items: [
      ["Policies", "/policies"],
      ["Guardrails", "/guardrails"],
      ["Entitlement", "/entitlement"],
    ],
  },
  {
    group: "Does it work",
    items: [
      ["Evaluation", "/evals"],
      ["Escalation", "/escalation"],
      ["Sources", "/sources"],
    ],
  },
  {
    group: "Can we prove it",
    items: [
      ["Traces", "/traces"],
      ["Compliance", "/compliance"],
      ["Board view", "/board"],
    ],
  },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  // Set by middleware.ts. Falls back to showing the chrome — an unset header means
  // middleware didn't run (e.g. some dev edge cases), and hiding the whole app by
  // default on an edge case is the wrong failure direction.
  const pathname = (await headers()).get("x-pathname") || "";
  const isLoginPage = pathname === "/login";

  return (
    <html lang="en">
      <body>
        {isLoginPage ? (
          <main className="login-main">{children}</main>
        ) : (
          <div className="shell">
            <nav className="side">
              <div className="brand">
                Nometria
                <small>agent governance control plane</small>
              </div>
              {NAV.map(({ group, items }) => (
                <div key={group || "root"}>
                  {group && <div className="group">{group}</div>}
                  {items.map(([label, href]) => (
                    <Link key={href} href={href}>
                      {label}
                    </Link>
                  ))}
                </div>
              ))}
              {signedIn && (
                <form action="/api/auth/logout" method="POST" className="nav-signout">
                  <button type="submit">Sign out</button>
                </form>
              )}
            </nav>
            <main>{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
