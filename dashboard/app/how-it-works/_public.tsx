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
          Governance, security and evidence for AI agents in production
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

export function PublicFooter() {
  return (
    <footer
      style={{
        marginTop: 48,
        paddingTop: 18,
        borderTop: "1px solid var(--hairline)",
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
        fontSize: 12.5,
        color: "var(--muted)",
      }}
    >
      <Wordmark size={16} />
      <Link href="/how-it-works" style={{ color: "var(--muted)" }}>
        How it works
      </Link>
      <Link href="/playground" style={{ color: "var(--muted)" }}>
        Playground
      </Link>
      <Link href="/benchmark" style={{ color: "var(--muted)" }}>
        Benchmarks
      </Link>
      <Link href="/login" style={{ color: "var(--muted)" }}>
        Sign in
      </Link>
    </footer>
  );
}
