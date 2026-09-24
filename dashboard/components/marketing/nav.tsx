import Link from "next/link";
import { BrandLockup } from "@/components/marketing/brand";

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
const LINKS: [string, string][] = [
  ["Product", "/product"],
  ["Open source", "/#editions"],
  ["Playground", "/playground"],
  ["Benchmarks", "/benchmark"],
];

export const REPO = "https://github.com/architsharm/guardrails";

export function MarketingNav() {
  return (
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
            Source
          </a>
        </nav>
        <div className="mk-nav-cta">
          <Link href="/playground" className="mk-btn mk-btn-ghost">
            Try it
          </Link>
          <Link href="/login" className="mk-btn mk-btn-primary" style={{ padding: "8px 14px" }}>
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
