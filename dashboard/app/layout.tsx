import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nometria Control Plane",
  description:
    "See every agent, control what it can do, prove it works, and demonstrate compliance.",
};

/** Grouped by the four questions an enterprise asks about any agent (PRD §2.2). */
const NAV: { group: string; items: [string, string][] }[] = [
  { group: "", items: [["Overview", "/"], ["Start here", "/start"]] },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
