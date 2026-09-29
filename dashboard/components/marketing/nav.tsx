import Link from "next/link";
import { cookies } from "next/headers";
import { BrandLockup } from "@/components/marketing/brand";
import { SESSION_COOKIE } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ScrollReveal } from "@/components/marketing/motion";
import { NavMenu } from "@/components/marketing/menu";
import { FLAT, GROUPS, SECONDARY } from "@/lib/nav";

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
/* The header row is two dropdowns and one link, and the lists behind them
   live in lib/nav.ts along with the footer's, the sitemap's and llms.txt's.
   Four files used to keep their own copy of the same information
   architecture and the failure was always the same: a page was added and
   three of them never heard about it.

   Bare labels are the thing being fixed here. A menu that says "Discovery /
   Grants / Guardrails" makes a visitor open three pages to find out which
   one they wanted; each item carries a sentence, so the menu explains the
   product instead. */

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
          {GROUPS.map((group) => (
            <NavMenu key={group.label} group={group} />
          ))}
          {FLAT.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
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
        {/* On a phone this is the entire navigation, so it carries every
            page rather than a curated few — grouped the same way the
            dropdowns are, so the two do not disagree about what the product
            is made of. */}
        <div className="mk-menu-panel">
          {GROUPS.map((group) =>
            group.sections.map((section, i) => (
              <div key={`${group.label}-${section.heading ?? i}`} className="mk-burger-group">
                <p>{section.heading ?? group.label}</p>
                {section.items.map((item) => (
                  <Link key={item.href} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </div>
            )),
          )}
          {[...FLAT, ...SECONDARY].map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
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
