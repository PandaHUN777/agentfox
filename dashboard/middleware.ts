/**
 * The UX gate, not the security boundary — the gateway still 401s a missing, bad,
 * expired or revoked token on every request regardless of what happens here. This
 * just sends someone straight to /login instead of making them discover that from
 * an error on every page.
 *
 * Also stamps the request path onto a header so the root layout (a Server
 * Component) can tell it's rendering /login and skip the app chrome — Next.js has
 * no server-only "what page am I on" otherwise, short of a client component.
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/api";

// /playground is the public, unauthenticated demo (dashboard/app/playground) — it
// talks directly to the gateway's own unauthenticated `/api/playground/*` routes
// from the browser, never through this app's cookie-authenticated `api()` helper,
// so it needs no session here either.
//
// /benchmark is public for the same reason: it is the page the playground's
// "read the full benchmark" link points at, so it is read by people who have no
// account yet. It is a static page with no session and no API call.
//
// "/" and "/how-it-works" are public because the root URL is where an audience
// arriving from a link lands, and redirecting them to /login put a sign-in wall in
// front of a product with nothing anywhere saying what it is. "/" is not a page
// that is public *instead of* the app: app/page.tsx renders the landing page when
// there is no session cookie and the unchanged Overview when there is one, so a
// signed-in user sees no difference. The entry here only stops the redirect.
//
// Note the match below is `=== p` or `startsWith(p + "/")`, so the "/" entry matches
// the root path exactly and never the whole site: no path begins with "//".
const PUBLIC_PATHS = ["/", "/how-it-works", "/login", "/api/auth", "/playground", "/benchmark"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);

  // A page whose control-plane call came back 401/403 links here. The cookie is
  // still set and still looks fine to the check below, so without clearing it
  // the user is stuck in a loop: /login sees a cookie and bounces them back into
  // the app, which 401s again. This is the one place that can actually drop it —
  // a Server Component cannot set cookies. `expired=1` is what the login page
  // reads to explain what happened; the incoming value is never rendered.
  if (pathname === "/login" && req.nextUrl.searchParams.get("session") === "expired") {
    const url = new URL("/login", req.url);
    url.searchParams.set("expired", "1");
    const res = NextResponse.redirect(url);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const signedIn = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublic && !signedIn) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
