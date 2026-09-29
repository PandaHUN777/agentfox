import Link from "next/link";
import { cookies } from "next/headers";
import { BrandLockup } from "@/components/marketing/brand";
import { SESSION_COOKIE } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ScrollReveal } from "@/components/marketing/motion";

/**
 * The public navigation bar.
 *
 * Sticky and translucent rather than fixed-and-scroll-aware: the same effect without a
 * client component and a scroll listener on every public page. Links point only at
 * pages a signed-out visitor can actually open, because a nav row that bounces someone
 * to a sign-in wall is worse than no row.
 */

// Three in-page anchors and three real pages. The anchors are what a visitor who
// wants to know what this does actually needs; the pages are the two things that
// need no account plus the source.
/* Four of the nine pages were reachable only from the footer, and "Open source"
   was a mislabelled anchor into a pricing block on the home page. These are the
   pages, named the way they are titled. */
/* Four, still. The product grew three pages and the header did not, because a
   header that lists every page is a header nobody reads — the sub-pages are
   one click down from /product and are in the footer and llms.txt.

   "Coding agents" replaces "How it works" in the row. It is the page a reader
   can act on in two commands, it is the wedge the product is actually sold
   on, and /how-it-works is a reference page people reach when they already
   want detail rather than one they browse to. */
const LINKS: [string, string][] = [
  ["Product", "/product"],
  ["Coding agents", "/hooks"],
  ["Coverage", "/coverage"],
  ["Pricing", "/pricing"],
];

/** Reachable from the mobile menu and the footer, not the header row. */
const MENU_EXTRA: [string, string][] = [
  ["MCP", "/mcp"],
  ["Control points", "/control-points"],
  ["How it works", "/how-it-works"],
  ["Benchmarks", "/benchmark"],
  ["Playground", "/playground"],
  ["Compare", "/compare"],
  ["Support", "/support"],
];

export const REPO = "https://github.com/architsharm/agentfox";

/**
 * Reads the session cookie, which makes this async and keeps it a Server
 * Component. The reason is item one of a list of things wrong with the old
 * structure: a signed-in visitor who reached the public site had a "Sign in"
 * button in front of them and no way back to their own dashboard. It is a UX
 * branch, not a security one — the nav renders nothing that is not already
 * public either way.
 */
export async function MarketingNav() {
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <>
      {/* Mounted from the nav because it is the one component on every
          marketing page and there is no marketing-only layout to hang it
          from. It renders nothing; it turns on the scroll-reveal that the
          stylesheet keeps switched off until a script says otherwise, so a
          page with no JavaScript is fully visible rather than fully blank. */}
      <ScrollReveal />
    <header className="mk-nav">
      <div className="mk-wrap mk-nav-inner">
        <Link href="/" className="mk-brand" aria-label="AgentFox home">
          <BrandLockup size={26} />
        </Link>
        <nav className="mk-nav-links" aria-label="Main">
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <div className="mk-nav-cta">
          {/* The theme control belongs here, not only behind a sign-in: the public
              pages are the ones a visitor meets first, and the choice they make
              here is the one they keep after signing in — same key, same control. */}
          <ThemeToggle compact />
          <Link href="/playground" className="mk-btn mk-btn-outline mk-nav-try">
            Try the playground
          </Link>
          <Link
            href={signedIn ? "/app" : "/login"}
            className="mk-btn mk-btn-primary"
            style={{ padding: "8px 14px" }}
          >
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
        </div>
      </div>

      <details className="mk-menu">
        <summary aria-label="Menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </summary>
        <div className="mk-menu-panel">
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
          {MENU_EXTRA.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </details>
    </header>
    </>
  );
}
