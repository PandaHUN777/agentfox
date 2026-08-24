/**
 * Starts "Sign in with GitHub". This is the whole login flow — there is no
 * separate signup and no password — and it doubles as the repo-connection grant:
 * the same OAuth scope that proves who someone is also lets the callback hand the
 * gateway a token it can list and scan repos with (see routes/integrations.py).
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "gh_oauth_state";

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GitHub sign-in is not configured (GITHUB_CLIENT_ID is unset)." },
      { status: 503 },
    );
  }

  // Double-submit-cookie CSRF check: a value we set here as a cookie and also pass
  // as `state`, verified to match by the callback. No separate signing secret needed.
  const state = crypto.randomUUID();
  const callbackUrl = new URL("/api/auth/github/callback", req.nextUrl.origin);
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("scope", "repo read:user user:email");
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
