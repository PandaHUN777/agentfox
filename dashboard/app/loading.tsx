"use client";

/**
 * The shell that shows while a page's server fetches are still in flight.
 *
 * Deliberately a skeleton of the panel layout every page here uses (heading,
 * one line of context, a row of stat cards, a table panel) rather than a
 * spinner: a spinner says "something is happening", a skeleton says "this is
 * what is about to be here", and on a governance dashboard the difference
 * matters — a reader who can already see the shape does not have to re-orient
 * when the numbers land.
 *
 * A root `loading.tsx` covers every route under it, including the three that are
 * not dashboard pages at all (sign-in, playground, benchmark — see the chromeless
 * list in app/layout.tsx). Flashing a grid of stat cards in front of a sign-in
 * form would be a lie about what is loading, so this is a Client Component purely
 * to read the path and render nothing there.
 *
 * Styles are inline (plus one scoped <style> for the pulse) because
 * app/globals.css is shared and this file should not grow it.
 */

import { usePathname } from "next/navigation";

const CHROMELESS = ["/login", "/playground", "/benchmark"];

const SKELETON_CSS = `
@keyframes nm-skel-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }
.nm-skel { background: var(--dim-bg); border-radius: var(--r-1); animation: nm-skel-pulse 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .nm-skel { animation: none; } }
`;

function Bar({ w, h = 12 }: { w: number | string; h?: number }) {
  return <div className="nm-skel" style={{ width: w, height: h }} />;
}

export default function Loading() {
  const pathname = usePathname() || "";
  if (CHROMELESS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <div aria-busy="true" aria-live="polite">
      <style>{SKELETON_CSS}</style>
      <span className="visually-hidden" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
        Loading
      </span>

      <div style={{ marginBottom: 18 }}>
        <Bar w={220} h={22} />
        <div style={{ marginTop: 12 }}>
          <Bar w="min(58ch, 100%)" h={11} />
        </div>
        <div style={{ marginTop: 7 }}>
          <Bar w="min(40ch, 100%)" h={11} />
        </div>
      </div>

      <div className="cards">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card">
            <Bar w={54} h={24} />
            <div style={{ marginTop: 9 }}>
              <Bar w={82} h={9} />
            </div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="head">
          <Bar w={150} h={12} />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 24,
              padding: "13px 16px",
              borderBottom: i === 4 ? "none" : "1px solid var(--hairline)",
            }}
          >
            <Bar w={90} h={10} />
            <Bar w={130} h={10} />
            <div style={{ flex: 1 }}>
              <Bar w="70%" h={10} />
            </div>
            <Bar w={70} h={10} />
          </div>
        ))}
      </div>
    </div>
  );
}
