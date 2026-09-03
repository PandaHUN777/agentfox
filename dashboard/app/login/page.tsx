import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";
import { Wordmark } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if ((await cookies()).get(SESSION_COOKIE)?.value) {
    redirect("/start");
  }
  const { error } = await searchParams;

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand">
          <Wordmark />
        </div>
        <small className="muted" style={{ display: "block", marginBottom: 18 }}>
          AI agent governance platform
        </small>
        <h1 style={{ fontSize: 20 }}>Welcome back</h1>
        <p className="sub" style={{ maxWidth: "none" }}>
          Sign in with GitHub to see your agents and connect a repo — the same grant
          lets us scan it for what needs governing.
        </p>
        {error && <div className="error small">{error}</div>}
        <a className="btn-github" href="/api/auth/github/login">
          Sign in with GitHub
        </a>
        <p className="small muted" style={{ marginTop: 18 }}>
          We only read code structure to detect what you're using — never execute it.
        </p>
      </div>
    </div>
  );
}
