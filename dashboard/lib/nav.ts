/**
 * The site's information architecture, in one place.
 *
 * Four things used to carry their own copy of it — the header, the footer,
 * `sitemap.ts` and `llms.txt` — and the failure mode was always the same:
 * a page was added and three of the four never heard about it. The
 * machine-readable test exists because that happened. This file makes the
 * drift impossible rather than detectable.
 *
 * Every entry carries a `note`. That is not decoration: in the header menu
 * the note is rendered under the label, so the menu itself explains the
 * product rather than making the reader open six pages to find out which one
 * they wanted. It is also what `llms.txt` publishes, so the description an
 * assistant reads and the description a person reads are the same sentence,
 * and neither can go stale without the other.
 */

export type NavItem = {
  label: string;
  href: string;
  /**
   * The menu line. Short on purpose — at ten items a sentence each, the
   * product panel was 583px of prose and read as a page rather than a menu.
   * Six or seven words; if it needs a comma it is probably too long.
   */
  note: string;
  /**
   * The fuller line, for llms.txt. An assistant deciding what to recommend
   * has room for a sentence where a menu does not, and this is the one place
   * the extra clause earns its keep. Falls back to `note`.
   */
  summary?: string;
  /** Sitemap hints. Omitted for anything that should not be indexed. */
  sitemap?: { changeFrequency: "weekly" | "monthly" | "yearly"; priority: number };
};

export type NavSection = {
  /**
   * Required. The first section used to be allowed to have none, which put two
   * unlabelled links above two labelled groups and read as a mistake — every
   * dropdown worth copying labels every group, including the first.
   */
  heading: string;
  /** Which column of the panel this section sits in. Defaults to 1. */
  column?: 1 | 2;
  items: NavItem[];
};

export type NavGroup = {
  /** The header button. */
  label: string;
  sections: NavSection[];
};

/**
 * The product menu.
 *
 * Grouped the way a reader's question is shaped, which is not the way the
 * codebase is shaped. "Where it runs" is the first question someone with an
 * agent has, and "what it checks" is the second; the six areas the product is
 * internally organised into are an implementation fact that helps nobody
 * choose a page.
 */
export const PRODUCT: NavGroup = {
  label: "Product",
  sections: [
    {
      heading: "Start here",
      column: 1,
      items: [
        {
          label: "Overview",
          href: "/product",
          note: "The control plane, one page",
          summary: "Discover, govern, protect, test and prove: the control plane on one page.",
          sitemap: { changeFrequency: "weekly", priority: 0.9 },
        },
        {
          label: "How it works",
          href: "/how-it-works",
          note: "Runtime enforcement, end to end",
          summary: "Runtime enforcement on one call: the pipeline, the budget, the verdict, the audit trail.",
          sitemap: { changeFrequency: "monthly", priority: 0.8 },
        },
      ],
    },
    {
      heading: "Where it binds",
      column: 1,
      items: [
        {
          label: "Coding agents",
          href: "/hooks",
          note: "Hooks that can block a call",
          summary: "Agent hooks for coding agents, and which of the three can actually block a call.",
          sitemap: { changeFrequency: "weekly", priority: 0.9 },
        },
        {
          label: "MCP",
          href: "/mcp",
          note: "Tool poisoning and rug pulls",
          summary: "MCP security: tool poisoning and rug pulls checked at call time, and the risks we do not cover.",
          sitemap: { changeFrequency: "monthly", priority: 0.8 },
        },
        {
          label: "Control points",
          href: "/control-points",
          note: "One policy, six control points",
          summary: "Open enforcement: one policy, six control points, and what each one cannot see.",
          sitemap: { changeFrequency: "monthly", priority: 0.8 },
        },
      ],
    },
    {
      heading: "What it does",
      column: 2,
      items: [
        {
          label: "Discovery",
          href: "/discovery",
          note: "AI-SPM for agents and MCP",
          summary: "AI-SPM: agents, tools, MCP servers and skills, including ones that were never committed.",
          sitemap: { changeFrequency: "monthly", priority: 0.8 },
        },
        {
          label: "Capability grants",
          href: "/grants",
          note: "Least privilege on tool calls",
          summary: "Access control for agents: least-privilege grants, checked on the call, not on the wording.",
          sitemap: { changeFrequency: "monthly", priority: 0.8 },
        },
        {
          label: "Runtime guardrails",
          // Not /guardrails: middleware 308s that to the signed-in app, where
          // it has been a real page for longer than this one has existed.
          href: "/runtime",
          note: "Guards on prompts and actions",
          summary: "Runtime guardrails on input, output and tool calls. A detector that times out is recorded.",
          sitemap: { changeFrequency: "monthly", priority: 0.8 },
        },
        {
          label: "Evidence and audit",
          href: "/evidence",
          note: "An audit trail you can verify",
          summary: "An audit trail of every decision, with a verifier that does not use our code.",
          sitemap: { changeFrequency: "monthly", priority: 0.8 },
        },
        {
          label: "Compliance",
          // Not /compliance, for the same reason as /runtime above — and
          // /frameworks is the better URL anyway, because the page is about
          // seven of them.
          href: "/frameworks",
          note: "EU AI Act, NIST, OWASP, ATLAS",
          summary: "Compliance mapped to EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP and MITRE ATLAS.",
          sitemap: { changeFrequency: "monthly", priority: 0.8 },
        },
      ],
    },
  ],
};

/**
 * The second dropdown.
 *
 * Named Resources because that is what this slot is called on every site a
 * visitor has already used, and a header is the one place to spend nothing on
 * originality — someone looking for a benchmark scans for the word they
 * expect. The differentiator keeps its name one level down, as the heading of
 * the group it belongs to.
 *
 * The playground is deliberately not in here. It is the thing we most want a
 * stranger to do and it needs no account, so burying it two interactions deep
 * was working against the only conversion this site has.
 */
export const RESOURCES: NavGroup = {
  label: "Resources",
  sections: [
    {
      heading: "Evidence",
      column: 1,
      items: [
        {
          label: "Coverage",
          href: "/coverage",
          note: "Red team coverage, gaps included",
          summary:
            "116 ways an agent can fail, scored against what AgentFox catches, and cut by cause: external, internal, autonomous, intrinsic. 105 executed against the running product nightly; the gaps are listed too.",
          sitemap: { changeFrequency: "weekly", priority: 0.8 },
        },
        {
          label: "Benchmarks",
          href: "/benchmark",
          note: "Results, including the losses",
          summary: "Benchmarks and methodology: every published number, including the ones we lose.",
          sitemap: { changeFrequency: "monthly", priority: 0.7 },
        },
        {
          label: "Compare",
          href: "/compare",
          note: "Governance and runtime security",
          summary: "How AI governance platforms and runtime tools compare, including where they beat us.",
          sitemap: { changeFrequency: "monthly", priority: 0.8 },
        },
      ],
    },
    {
      heading: "Project",
      column: 2,
      items: [
        {
          label: "Security",
          href: "/security",
          note: "Threat model and disclosure",
          summary: "Security: the threat model, what is in scope, and how to report a vulnerability.",
          sitemap: { changeFrequency: "yearly", priority: 0.4 },
        },
        {
          label: "Support",
          href: "/support",
          note: "How to get help",
          summary: "Support: where to ask, and that there is no promised response time.",
          sitemap: { changeFrequency: "monthly", priority: 0.6 },
        },
      ],
    },
  ],
};

/**
 * Flat header links, after the two dropdowns.
 *
 * The playground first, because it is the one thing on this site a stranger
 * can do in ten seconds with no account, and it was previously three
 * interactions away inside a menu.
 */
export const FLAT: NavItem[] = [
  {
    label: "Playground",
    href: "/playground",
    note: "Red team it. No account",
    summary: "Red team a running agent in the browser: prompt injection and a tool call. No account.",
    sitemap: { changeFrequency: "monthly", priority: 0.8 },
  },
  {
    label: "Pricing",
    href: "/pricing",
    note: "Free to self-host, forever",
    summary: "Self-hosting is free and unlimited under Apache-2.0. Hosted is a waitlist.",
    sitemap: { changeFrequency: "monthly", priority: 0.7 },
  },
];

/** Not in the header. Real pages all the same, reachable from the footer. */
export const SECONDARY: NavItem[] = [
  {
    label: "Legal",
    href: "/legal",
    note: "The hub for the two below",
    sitemap: { changeFrequency: "yearly", priority: 0.4 },
  },
  {
    label: "Privacy",
    href: "/privacy",
    note: "What the hosted demo stores",
    sitemap: { changeFrequency: "yearly", priority: 0.4 },
  },
  {
    label: "Terms",
    href: "/terms",
    note: "Terms for the hosted service",
    sitemap: { changeFrequency: "yearly", priority: 0.3 },
  },
];

export const GROUPS: NavGroup[] = [PRODUCT, RESOURCES];

/** The landing page, which belongs in the sitemap and in no menu. */
export const HOME: NavItem = {
  label: "AgentFox",
  href: "/",
          note: "What this is, in one idea",
          summary: "What AgentFox is, and the one idea it is built on: calls approach a capability check, most go through, one does not.",
  sitemap: { changeFrequency: "weekly", priority: 1 },
};

/** Every page, in one list. The thing four files used to each keep their own copy of. */
export const ALL_PAGES: NavItem[] = [
  HOME,
  ...GROUPS.flatMap((g) => g.sections.flatMap((s) => s.items)),
  ...FLAT,
  ...SECONDARY,
];

export const ALL_PATHS: string[] = ALL_PAGES.map((p) => p.href);
