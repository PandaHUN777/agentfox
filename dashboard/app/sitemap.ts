/**
 * /sitemap.xml
 *
 * Only the six URLs a signed-out visitor can actually open, which is exactly
 * middleware.ts's PUBLIC_PATHS minus the API prefix. A sitemap that lists a URL
 * which answers with a redirect to /login is a crawl error reported back in Search
 * Console, so the authenticated app is absent rather than listed and disallowed.
 *
 * `changeFrequency` and `priority` are hints, not instructions, and they are set
 * from how these pages actually behave: the landing page and the product page
 * change when the product is described differently, the benchmarks change when a
 * benchmark is rerun, and /login has not changed in months.
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
  { path: "/login", changeFrequency: "yearly", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: BUILT_AT,
    changeFrequency,
    priority,
  }));
}
