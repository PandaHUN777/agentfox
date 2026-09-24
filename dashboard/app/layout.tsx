import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Albert_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

const albertSans = Albert_Sans({ subsets: ["latin"], variable: "--font-sans" });
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, safeApi } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Wordmark } from "@/components/Logo";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { CommandSearch } from "@/components/CommandSearch";
import { SideNav, type NavItem } from "@/components/SideNav";
import { TopbarStats } from "@/components/TopbarStats";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, HOME_TITLE, REPO_URL } from "@/lib/site";
import "./globals.css";
import "./marketing.css";

/**
 * Runs before paint so a stored theme choice never flashes the wrong colours.
 *
 * It only ever *departs* from light, which is rendered on <html> by the server.
 * Light being the default is the point: leaving the decision to the OS means a
 * visitor on a dark Mac meets a dark product on their first visit, having just come
 * from a marketing site that is designed light. "System" is still one of the three
 * choices in the sidebar; it is simply no longer the one nobody picked.
 *
 * The `catch` matters and is deliberately empty: localStorage throws outright in
 * some privacy modes, and the right outcome there is the light default already in
 * the markup.
 */
const THEME_INIT_SCRIPT = `(function(){try{var r=document.documentElement,t=localStorage.getItem("agentfox-theme");if(t==="system")r.removeAttribute("data-theme");else if(t==="dark")r.setAttribute("data-theme","dark");}catch(e){}})();`;

/**
 * Root metadata. Everything here is inherited by every route, so it holds only
 * what is true of the whole site; anything page-specific lives on the page.
 *
 * `metadataBase` is what turns the relative `canonical` and image paths below and
 * on every page into the absolute URLs a crawler and an unfurler need. It reads
 * the host from the environment (lib/site.ts) so a preview deployment does not
 * publish canonicals pointing at production.
 *
 * `title.template` means a page exports just its own name ("Glossary") and gets
 * "Glossary | AgentFox" in the tab and the unfurl. `title.default` is what a route
 * with no title of its own inherits.
 *
 * No `verification`, no `category`, and no keyword list beyond the six terms this
 * product is genuinely described by, because a longer list is not a ranking signal
 * and reads as stuffing to a human who views source.
 */
/**
 * Tints the browser chrome on mobile to the page's own ground, so the status bar
 * stops sitting in a different colour from the app underneath it. Two entries
 * rather than one: a single value would be wrong in whichever theme it is not.
 *
 * These are `--bg` in each theme, by hand. A media-query meta tag cannot read a
 * custom property, so if the ramp in globals.css moves, these move with it.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    template: "%s | AgentFox",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "AI agent governance",
    "AI agent security",
    "prompt injection",
    "tool call authorisation",
    "LLM guardrails",
    "agent audit trail",
  ],
  authors: [{ name: "AgentFox", url: REPO_URL }],
  // No `images` key in either block. app/opengraph-image.tsx and
  // app/twitter-image.tsx sit at the root of app/, and the file convention applies
  // them to every route beneath automatically, with a content hash in the URL that
  // busts a social network's image cache when the card changes. Listing an image
  // here as well is how a page ends up emitting two `og:image` tags pointing at
  // two different URLs for the same picture and letting the unfurler choose.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: "/",
    title: HOME_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  alternates: { canonical: "/" },
};

/**
 * Plain, predictable category nouns rather than a rhetorical-question framing
 * ("What is it" / "Does it work") — a newcomer scanning the sidebar once should
 * be able to guess which group a page lives in before clicking it.
 *
 * Grouping and labels follow the four-stage lifecycle (Discover / Monitor /
 * Test / Govern) that recurs across the AI-agent-governance and AI-security
 * category researched for this pass — Noma, Pillar Security, HiddenLayer,
 * SplxAI, Lasso, and Cisco AI Defense all converge on some version of
 * discover-what-exists -> test/validate -> runtime-protect -> govern. Two
 * splits from the previous grouping follow that research directly:
 *
 * - "Discover" (Agents, Sources) is pulled out on its own because "Discover"
 *   is the single most consistently-used word across that whole category for
 *   exactly this — an inventory of what exists (agents, MCP servers, data
 *   sources) — not an AgentFox-specific choice.
 * - "Monitor" keeps Findings and Traces, since those are the ongoing-activity
 *   record rather than the inventory itself, and "Monitor" was never actually
 *   flagged as unclear by the research — only "Quality" and the standalone
 *   "Reporting" group of one were.
 *
 * Compliance sits in Govern, not its own "Reporting" group of one — every
 * comparable governance product treats framework/control mapping as part of
 * governance, not a separate top-level stage, and a group with a single row
 * was just an extra click for no organizing benefit.
 *
 * Guardrail tuning and Escalation are NOT rows. They are tabs on Policies and on
 * Approvals, and they were also listed here as indented children of those two
 * rows — the same destination in the sidebar twice, drawn in a weaker style the
 * second time. A sidebar row and a tab on the page it opens are two controls for
 * one thing, and the reader has to work out that they agree. They are in
 * NAV_SEARCH_ONLY below instead, so typing the name still finds them.
 */
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "",
    items: [
      ["Overview", "/app"],
      ["Start here", "/app/start"],
    ],
  },
  {
    group: "Discover",
    items: [
      ["Agents", "/app/agents"],
      ["Verified sources", "/app/sources"],
    ],
  },
  {
    group: "Monitor",
    items: [
      ["Findings", "/app/findings"],
      ["Traces", "/app/traces"],
    ],
  },
  {
    group: "Test",
    items: [
      ["Evaluation", "/app/evals"],
    ],
  },
  {
    group: "Govern",
    items: [
      ["Policies", "/app/policies"],
      ["Access control", "/app/entitlement"],
      ["Approvals", "/app/approvals"],
      ["Compliance", "/app/compliance"],
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
  { label: "Connect GitHub", href: "/app/start?tab=connect", group: "Start here" },
  { label: "Connect a hosted API", href: "/app/start?tab=connect", group: "Start here" },
  { label: "API tokens", href: "/app/start?tab=tokens", group: "Start here" },
  { label: "Guardrail tuning", href: "/app/policies?tab=guardrails", group: "Policies" },
  { label: "Escalation", href: "/app/approvals?tab=escalation", group: "Approvals" },
  { label: "Board view", href: "/app/compliance?tab=board", group: "Compliance" },
  { label: "Glossary", href: "/app/glossary", group: "Reference" },
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
  /**
   * The app chrome — sidebar, topbar — belongs to the app, and the app is
   * everything under `/app`.
   *
   * This used to be a fourteen-entry list of public prefixes, one of which ("/")
   * depended on whether there was a session, because `/` served the marketing page
   * to signed-out visitors and the dashboard to signed-in ones. Both are gone. The
   * dashboard has its own URL, so `/` is the marketing page for everybody, and a
   * signed-in visitor can read the public site without signing out — which they
   * could not do before, because no URL served it to them.
   *
   * The list was also the wrong shape: it grew every time a public page was added
   * and shrank never, and a page whose prefix was forgotten came out with the
   * marketing nav nested inside the app sidebar.
   */
  const isAppPage = pathname === "/app" || pathname.startsWith("/app/");

  let me: any = null;
  let attention: any = null;
  if (signedIn && isAppPage) {
    [me, attention] = await Promise.all([
      safeApi("/api/me", null),
      safeApi("/api/attention", { items: [], total: 0 }),
    ]);
  }

  return (
    /* `data-theme="light"` is rendered here, on the server, and not only written by
       the script below. It is the default, so rendering it is what makes the markup
       React hydrates against match the DOM the script produced for the visitor who
       has chosen nothing — which is almost everybody. Stamping it from the script
       alone put an attribute on <html> that the server HTML did not have, and React
       reported a hydration mismatch on every first load.

       `suppressHydrationWarning` covers the remaining two cases, where the script
       legitimately disagrees with the server: a visitor who picked Dark, and one who
       picked System. It applies to this element's own attributes only, not to its
       subtree, so nothing else on the page stops being checked. */
    <html
      lang="en-GB"
      data-theme="light"
      suppressHydrationWarning
      className={`${albertSans.variable} ${GeistMono.variable} ${GeistSans.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {!isAppPage ? (
          /* A div, not a <main>. Every public page renders its own <main>, so this
             was nesting one inside another — invalid, and it silently applied the
             app's `max-width: 1400px` and 32px side padding to the whole marketing
             site. The hero's full-bleed wash stopped 52px short of each edge and
             nobody could see why. */
          <div className="login-main">{children}</div>
        ) : (
          <div className="shell">
            <nav className="side">
              {/* The mark and the name only. "by Nometria" sat under both of them
                  as a block, which put it under the fox rather than under the
                  word, and at 11px in a 224px rail it read as a stray caption.
                  The parent brand belongs where there is room for it: the public
                  footer and the sign-in page both carry it. */}
              <Link href="/app" className="brand" aria-label="Overview">
                <Wordmark />
              </Link>
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
