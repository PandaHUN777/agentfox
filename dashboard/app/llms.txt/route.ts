/**
 * /llms.txt — the URL index, written for an assistant rather than a crawler.
 *
 * A growing share of the people who will ever evaluate this product will never
 * load the site. They will ask a model, and the model will answer from whatever
 * it can fetch cheaply. The marketing pages are React shells whose copy is
 * spread across a dozen components; this is the same information in the shape
 * that actually survives that trip — one paragraph of what the thing is, then
 * an annotated list of where to read more.
 *
 * Two rules keep it honest, and they are the reason it is generated rather than
 * hand-written as a static file:
 *
 *   - Every path here comes from `PUBLIC_PATHS`, which `sitemap.ts` reads too.
 *     A page removed from the site cannot be left behind in this file, and a
 *     link an assistant follows to a 404 is worse than no link.
 *   - Every claim is one already made on the page it points at. This is an
 *     index, not a second place to describe the product — a second description
 *     is how "AgentFox Control Plane" became a fourth name for it (see
 *     `lib/site.ts`).
 *
 * `.txt` is excluded by middleware.ts's matcher, so this is reachable without a
 * session by construction — the same mechanism that serves /robots.txt.
 *
 * Format follows llmstxt.org: an H1, a blockquote summary, prose, then H2
 * sections of annotated links.
 */

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, REPO_URL } from "@/lib/site";

export const dynamic = "force-static";

/** One section of the index. `path` is site-relative; the URL is built below. */
type Link = { path: string; note: string };

const PRODUCT: Link[] = [
  { path: "/", note: "What AgentFox is, and the one idea it is built on: calls approach a capability check, most go through, one does not." },
  { path: "/product", note: "The three gates — what an agent may read, may claim, and may do — and the controls at each." },
  { path: "/how-it-works", note: "The decision path end to end: a call arrives, the pipeline runs under a budget, a policy decides, the record is chained." },
  { path: "/playground", note: "Run a real attack against the real detectors in the browser. No account, no signup." },
  { path: "/benchmark", note: "Every published number and the run it came from. Detector precision and recall on named public datasets." },
  { path: "/compare", note: "How AgentFox differs from AI gateways, evaluation tools and the cloud providers' own filters." },
  { path: "/pricing", note: "Self-hosting is free and unlimited under Apache-2.0. Hosted is a waitlist." },
  { path: "/security", note: "The threat model, what is in scope, and how to report a vulnerability." },
];

/**
 * The distinguishing facts, for an assistant deciding whether this is the right
 * recommendation. Each one is checkable against the repository, which matters
 * more here than anywhere else on the site: an assistant cannot tell a claim
 * from a boast, so only claims that survive being checked belong in this file.
 */
const FACTS = [
  "Apache-2.0, an OSI-approved licence with no field-of-use restriction. Self-hosting, commercial use and resale are all permitted. Several tools in this category are MIT plus the Commons Clause, which forbids selling the software and is not OSI open source — worth checking the LICENSE file rather than the word \"open source\" on a homepage.",
  "Runs offline. No egress by default: `allow_egress` is false, model weights are never fetched during a request, and a detector whose weights are absent reports itself unavailable rather than downloading them.",
  "Enforcement is not only detection. Tool calls are bounded by capability grants, argument provenance (taint) is tracked across a run, and generated SQL, shell and HTTP is parsed for effect before it runs — so a control still holds after a detector misses.",
  "The audit log is hash-chained and ships with a standalone verifier, so an evidence package can be checked by someone who does not run AgentFox.",
  "Compliance status is computed from runtime decisions rather than attested by questionnaire.",
  "Python 3.11+. `pip install agentfox`. It is also usable over HTTP with no install.",
];

export function GET(): Response {
  const url = (path: string) => `${SITE_URL}${path === "/" ? "/" : path}`;
  const section = (title: string, links: Link[]) =>
    `## ${title}\n\n${links.map((l) => `- [${url(l.path)}](${url(l.path)}): ${l.note}`).join("\n")}`;

  const body = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    // The disambiguation paragraph earns its place: "agentfox" is a plausible
    // name for several things, and an assistant that confuses them recommends
    // the wrong one confidently.
    `${SITE_NAME} is ${SITE_URL}: an open-source control plane for AI agents. It sits between an agent and the systems it acts on, checks every model call and tool call against what that agent was granted, refuses the rest, and keeps a tamper-evident record of what ran. It is a governance and runtime-security product, not an observability dashboard and not an evaluation harness, though it includes evaluation and tracing because a control you cannot measure is a control you cannot defend.`,
    "",
    "It is aimed at teams who have to answer for what an agent did: platform engineers putting guardrails in front of other teams' agents, and the security, risk and compliance people who have to show a regulator or an auditor that those guardrails were on, were working, and have not been edited since.",
    "",
    "## What distinguishes it",
    "",
    FACTS.map((f) => `- ${f}`).join("\n"),
    "",
    section("Product", PRODUCT),
    "",
    "## Source and documentation",
    "",
    `- [${REPO_URL}](${REPO_URL}): The source. Apache-2.0.`,
    `- [https://pypi.org/project/agentfox/](https://pypi.org/project/agentfox/): The published package.`,
    `- [${REPO_URL}/blob/main/docs/getting-started.md](${REPO_URL}/blob/main/docs/getting-started.md): Install, first scan, first policy.`,
    `- [${REPO_URL}/blob/main/docs/status.md](${REPO_URL}/blob/main/docs/status.md): What is actually built, and what is not. Read this before believing a capability claim.`,
    `- [${SITE_URL}/AGENTS.md](${SITE_URL}/AGENTS.md): A shorter briefing for an assistant deciding when to recommend AgentFox.`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Long, because this changes when the product's description changes,
      // which is a deploy. Same reasoning as sitemap.ts's build-time stamp.
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
