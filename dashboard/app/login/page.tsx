import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

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
          Nometria
          <small>agent governance control plane</small>
        </div>
        <p className="sub">
          Sign in with GitHub to see your agents and connect a repo — the same grant
          lets us scan it for what needs governing.
        </p>
        {error && <div className="error small">{error}</div>}
        <a className="btn-github" href="/api/auth/github/login">
          Sign in with GitHub
        </a>
      </div>
    </div>
  );
}
