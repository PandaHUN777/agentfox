/**
 * /sitemap.xml
 *
 * Only the URLs a signed-out visitor can actually open, which is exactly
 * middleware.ts's PUBLIC_PATHS minus the API prefix and the generated metadata
 * routes (an image is not a page). A sitemap that lists a URL
 * which answers with a redirect to /login is a crawl error reported back in Search
 * Console, so the authenticated app is absent rather than listed and disallowed.
 *
 * `changeFrequency` and `priority` are hints, not instructions, and they are set
 * from how these pages actually behave: the landing page and the product page
 * change when the product is described differently, the benchmarks change when a
 * benchmark is rerun, and the legal pages change when the service does.
 *
 * `lastModified` is the build time rather than a hardcoded date. Every one of these
 * pages is rendered from source in this repository, so a deployment is the only
 * thing that can change them, and stamping a date by hand is a date that goes stale
 * silently.
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const BUILT_AT = new Date();

type Entry = {
  path: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
};

const ROUTES: Entry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/product", changeFrequency: "weekly", priority: 0.9 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.8 },
  { path: "/playground", changeFrequency: "monthly", priority: 0.8 },
  { path: "/benchmark", changeFrequency: "monthly", priority: 0.7 },
  // /compare is the page a buyer searches for by name ("agentfox vs ..."), so it
  // ranks above the other secondary pages. /pricing is expected to exist whether or
  // not anything is priced, and /support is where an existing user goes, not a
  // searcher, which is why it sits lowest of the three.
  { path: "/compare", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.7 },
  { path: "/support", changeFrequency: "monthly", priority: 0.6 },
  // Low priority and rarely changing, but present: these are the pages a cautious
  // reader searches for by name before trusting a hosted demo with anything, and a
  // legal page that is not in the sitemap is one more reason to assume it is not
  // there. /legal is the hub, so it carries the other three.
  { path: "/legal", changeFrequency: "yearly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/security", changeFrequency: "yearly", priority: 0.4 },
  // /login is deliberately absent. It is public and crawlable (app/robots.ts allows
  // it on purpose, so the `noindex` on the page itself can be read at all), but a
  // sitemap is a list of URLs you are asking to have indexed, and app/login/page.tsx
  // asks for the opposite. Listing it anyway produces a "Submitted URL marked
  // noindex" error in Search Console for a page that is behaving exactly as intended.
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: BUILT_AT,
    changeFrequency,
    priority,
  }));
}
