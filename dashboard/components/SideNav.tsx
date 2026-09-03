"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NavIcon } from "@/components/NavIcons";

export type NavItem = [label: string, href: string, sub?: boolean];

/**
 * The active-link highlight used to be computed server-side from a `pathname`
 * header set by middleware — correct on a fresh request, but browser back/forward
 * navigation doesn't reliably re-run that server render, so the highlight stuck on
 * whichever page you'd navigated *away* from. `usePathname()` is reactive to the
 * client router's actual current URL on every navigation type, so this can't drift.
 *
 * A handful of items point at one specific tab of a page it shares with another
 * nav row (e.g. "Guardrail tuning" is `/policies?tab=guardrails`, sitting next to
 * "Policies" at bare `/policies`). Those need the query string, not just the path,
 * compared — otherwise both rows light up together whichever tab is open. A bare
 * href is only treated as active when no sibling row's own tab qualifier matches
 * the tab that's actually open, so the parent row still highlights correctly on
 * that page's default (un-tabbed) view.
 */
export function SideNav({
  nav,
}: {
  nav: { group: string; items: NavItem[] }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const flatItems = nav.flatMap(({ items }) => items);

  const hasSiblingForCurrentTab = (path: string) =>
    currentTab !== null &&
    flatItems.some(([, href]) => {
      const [p, q] = href.split("?");
      return p === path && q && new URLSearchParams(q).get("tab") === currentTab;
    });

  return (
    <>
      {nav.map(({ group, items }) => (
        <div key={group || "root"}>
          {group && <div className="group">{group}</div>}
          {items.map(([label, href, sub]) => {
            const [hrefPath, hrefQuery] = href.split("?");
            const hrefTab = hrefQuery ? new URLSearchParams(hrefQuery).get("tab") : null;
            const pathMatches =
              hrefPath === "/" ? pathname === "/" : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
            const isActive = hrefTab
              ? pathMatches && currentTab === hrefTab
              : pathMatches && !hasSiblingForCurrentTab(hrefPath);
            return (
              <Link
                key={href}
                href={href}
                className={[isActive ? "active" : "", sub ? "sub" : ""].filter(Boolean).join(" ")}
              >
                {!sub && <NavIcon href={href} />}
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}
