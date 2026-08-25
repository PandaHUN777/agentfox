"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/NavIcons";

/**
 * The active-link highlight used to be computed server-side from a `pathname`
 * header set by middleware — correct on a fresh request, but browser back/forward
 * navigation doesn't reliably re-run that server render, so the highlight stuck on
 * whichever page you'd navigated *away* from. `usePathname()` is reactive to the
 * client router's actual current URL on every navigation type, so this can't drift.
 */
export function SideNav({
  nav,
}: {
  nav: { group: string; items: [string, string][] }[];
}) {
  const pathname = usePathname();
  return (
    <>
      {nav.map(({ group, items }) => (
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
    </>
  );
}

export function GlossaryLink() {
  const pathname = usePathname();
  return (
    <Link
      href="/glossary"
      className={pathname === "/glossary" ? "active" : ""}
      style={{ marginTop: 4, fontSize: 12 }}
    >
      <span>Glossary — what the jargon means</span>
    </Link>
  );
}
