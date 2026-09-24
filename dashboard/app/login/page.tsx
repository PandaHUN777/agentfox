import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/site";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";
import { Wordmark } from "@/components/Logo";

export const dynamic = "force-dynamic";

/**
 * Crawlable but not indexable, which is the right pair rather than a contradiction.
 *
 * app/robots.ts allows /login, because a `Disallow` would stop a crawler fetching
 * the page and therefore stop it ever seeing the `noindex` below. The `noindex`
 * itself is because a sign-in form is not a useful search result for anybody: the
 * queries it would answer are answered better by "/" or /how-it-works, and this is
 * also where every authenticated route redirects, so it is the page most at risk of
 * being indexed many times over under other URLs.
 *
 * It still carries a title, description and canonical, because those are what get
 * shown when somebody pastes the sign-in link into Slack.
 */
export const metadata: Metadata = publicPageMetadata({
  title: "Sign in or create a workspace",
  description:
    "Sign in to AgentFox with GitHub, which creates the workspace if you do not have one. The playground and the published benchmarks need no account at all.",
  path: "/login",
  noIndex: true,
});

/**
 * This page is the sign-up path as much as the sign-in one — a GitHub identity
 * nobody has seen before creates a new org on the far side of it — so it can't
 * greet everyone with "Welcome back". It also has to answer "what is this" for
 * a reader who arrived from a link and has no idea, and offer the one thing
 * that needs no account at all: the playground.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; expired?: string }>;
}) {
  const { error, expired } = await searchParams;
  // Middleware clears the stale cookie on its way here (see middleware.ts), so
  // by this point an expired session has no cookie left to redirect on.
  if (!expired && (await cookies()).get(SESSION_COOKIE)?.value) {
    redirect("/start");
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand">
          <Wordmark />
        </div>
        <small className="muted" style={{ display: "block", marginBottom: 18 }}>
          by Nometria
        </small>
        <h1 style={{ fontSize: 20 }}>Sign in or create a workspace</h1>
        <p className="sub" style={{ maxWidth: "none" }}>
          AgentFox keeps a register of every AI agent you run, the rules each one has
          to follow, and a record of what it actually did. Sign in with GitHub: if
          this is your first time, that creates a new workspace for you.
        </p>
        {expired && (
          <div className="error small" style={{ textAlign: "left", marginBottom: 16 }}>
            Your session expired, so you were signed out. Signing in again picks up
            where you left off.
          </div>
        )}
        {error && <div className="error small">{error}</div>}
        <a className="btn-github" href="/api/auth/github/login">
          Sign in with GitHub
        </a>
        <p className="small muted" style={{ marginTop: 18 }}>
          Signing in with GitHub is also what lets you connect a repository, so we can
          scan it for agents that need governing. We only read code structure to detect
          what you&rsquo;re using, never execute it.
        </p>
        <p className="small" style={{ marginTop: 18 }}>
          <Link href="/playground">Try the playground first</Link>
          <span className="muted">
            {" "}
            — send a prompt at a sample agent and watch what gets blocked. No account,
            nothing to install.
          </span>
        </p>
      </div>
    </div>
  );
}
