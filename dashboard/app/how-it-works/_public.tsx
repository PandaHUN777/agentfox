import Link from "next/link";
import { Wordmark } from "@/components/Logo";

/**
 * Header and footer shared by the two public, signed-out pages: the landing page
 * (app/page.tsx, rendered when there is no session cookie) and this route.
 *
 * It lives under app/how-it-works/ rather than components/ because a concurrent
 * change owns components/ and app/* outside these two routes. A file in the app
 * directory that is not page.tsx/route.ts/layout.tsx is not a route, so the
 * underscore-prefixed name here is a private module, not a URL.
 *
 * Both pages render chromeless (see layout.tsx): the authenticated sidebar's every
 * row bounces a signed-out reader to /login, so these pages carry their own small
 * header instead. `textDecoration: "none"` is set inline on the pill links on
 * purpose: globals.css has `a:hover { text-decoration: underline }` and no
 * :hover override for .btn-primary, and an inline declaration outranks a
 * selector rule in every state.
 */

/**
 * One category name, used verbatim everywhere these two public pages describe what
 * the product is.
 *
 * Before this there were four in the first viewport: the browser tab said "AgentFox
 * Control Plane", the strapline said "Governance, security and evidence for AI agents
 * in production", the landing body said "a control plane for AI agents in production"
 * and the API root said "Governance, security and compliance for AI agents". A reader
 * who does not already know the product cannot tell whether those are four things or
 * one. The wording is the shortened form of the canonical description in
 * pyproject.toml. Exported so page.tsx and how-it-works/page.tsx use the string rather
 * than retyping it, which is how the drift happened in the first place.
 */
export const CATEGORY = "governance and security control plane for AI agents in production";
/** Sentence-initial form, for the strapline and anywhere it starts a line. */
export const CATEGORY_CAP = "Governance and security control plane for AI agents in production";

/** The repository is about to be public, and the pages cite it constantly. */
export const REPO = "https://github.com/architsharm/guardrails";

const LINKS: [string, string][] = [
  ["How it works", "/how-it-works"],
  ["Playground", "/playground"],
  ["Benchmarks", "/benchmark"],
];

export function PublicHeader({ current }: { current?: string }) {
  return (
    <header className="pg-header">
      <div>
        <Link href="/" style={{ display: "inline-flex", fontWeight: 640, textDecoration: "none" }}>
          <Wordmark />
        </Link>
        <p className="sub" style={{ margin: "4px 0 0" }}>
          {CATEGORY_CAP}
        </p>
      </div>
      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 16,
          fontSize: 13,
        }}
      >
        {LINKS.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            style={{
              color: href === current ? "var(--text)" : "var(--muted)",
              fontWeight: href === current ? 600 : 400,
            }}
          >
            {label}
          </Link>
        ))}
        <Link href="/login" className="btn-primary" style={{ textDecoration: "none" }}>
          Sign in
        </Link>
      </nav>
    </header>
  );
}

/**
 * Both public pages kept citing "the repository" without ever linking it, and a
 * reader could not find the licence, the source, a version, or any route for
 * reporting a security problem. Everything below is checked against a file in the
 * repository: the licence against LICENSE (Apache-2.0), the version against the
 * status line in README.md ("Status: MVP v0.3"), the reporting route against
 * SECURITY.md, and the single-maintainer line against `git shortlog`, which has one
 * author. No email address, company or team is named here, because none exists to
 * name: SECURITY.md routes a report through GitHub's private advisories instead.
 */
const FOOT_LINK = { color: "var(--muted)" };

export function PublicFooter() {
  return (
    <footer
      style={{
        marginTop: 48,
        paddingTop: 18,
        borderTop: "1px solid var(--hairline)",
        fontSize: 12.5,
        color: "var(--muted)",
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
        }}
      >
        <Wordmark size={16} />
        <Link href="/how-it-works" style={FOOT_LINK}>
          How it works
        </Link>
        <Link href="/playground" style={FOOT_LINK}>
          Playground
        </Link>
        <Link href="/benchmark" style={FOOT_LINK}>
          Benchmarks
        </Link>
        <Link href="/login" style={FOOT_LINK}>
          Sign in
        </Link>
        <a href={REPO} style={FOOT_LINK} target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        <a href={`${REPO}/blob/main/LICENSE`} style={FOOT_LINK} target="_blank" rel="noreferrer">
          Apache-2.0
        </a>
        <a href={`${REPO}/blob/main/SECURITY.md`} style={FOOT_LINK} target="_blank" rel="noreferrer">
          Report a vulnerability
        </a>
      </div>
      <div style={{ marginTop: 12, maxWidth: "76ch", color: "var(--faint)" }}>
        <p style={{ margin: "0 0 6px" }}>
          AgentFox, MVP v0.3. Licensed{" "}
          <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            Apache-2.0
          </a>
          , free to run, with the full licence text and all of the source in{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            the repository
          </a>
          .
        </p>
        <p style={{ margin: "0 0 6px" }}>
          Maintained in the open by one developer. There is no company behind it and no
          support contract, which is why{" "}
          <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">
            SECURITY.md
          </a>{" "}
          asks for patience on a fix timeline. Report a security problem through
          GitHub&rsquo;s private advisories rather than a public issue, as that file
          explains.
        </p>
        <p style={{ margin: 0 }}>
          This is an MVP. There is no single sign-on, a workspace is a single
          organisation, and it handles text only.
        </p>
      </div>
    </footer>
  );
}
