/**
 * /robots.txt
 *
 * The disallow list is the complement of middleware.ts's PUBLIC_PATHS rather than a
 * guess: every route in this app that is not in that list redirects a request with
 * no session cookie to /login, so a crawler that follows it gets the sign-in page
 * back under an app URL. Letting that happen puts a wall of near-identical /login
 * bodies in the index under a dozen different URLs, which is worse for the site
 * than those pages simply not being there.
 *
 * Serving /robots.txt at all needs it to be publicly reachable. It is, twice over:
 * middleware.ts's matcher excludes anything ending in `.txt`, and the path is in
 * PUBLIC_PATHS as well.
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Every top-level segment under app/ that requires a session, i.e. every directory
 * there that is not in middleware.ts's PUBLIC_PATHS. Listed as prefixes so the
 * nested routes (/agents/[slug], /evals/[key]/runs/[runId], and so on) are covered
 * without enumerating them.
 */
const AUTHENTICATED_PATHS = [
  "/agents",
  "/approvals",
  "/board",
  "/compliance",
  "/entitlement",
  "/escalation",
  "/evals",
  "/findings",
  "/glossary",
  "/guardrails",
  "/policies",
  "/settings",
  "/sources",
  "/start",
  "/traces",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // No trailing slash. `Disallow` is a prefix match, so "/agents" covers
        // both /agents and /agents/acme-support, whereas "/agents/" would have
        // left the index page of each section crawlable, which is the one page
        // in each section a crawler is most likely to try.
        disallow: [
          ...AUTHENTICATED_PATHS,
          // The route handlers under app/api. Nothing here is a document; the
          // OAuth callback in particular should never be fetched by a crawler.
          "/api/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
