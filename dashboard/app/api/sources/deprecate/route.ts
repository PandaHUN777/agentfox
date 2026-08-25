import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Soft-retire a source: `key` travels in the POST body, not the URL path.
 *
 * A source key can itself contain slashes (a URI, a file path), which needs a
 * Next.js catch-all segment to route — but a catch-all folder with static
 * subroutes underneath it (`[...key]/deprecate`, `[...key]/delete`) trips a
 * "Catch-all must be the last part of the URL" error in dev mode. Reading the
 * key from the form body instead sidesteps the whole problem, and matches how
 * the edit/add forms on this page already work.
 */
export async function POST(req: NextRequest) {
  const target = new URL("/sources", req.nextUrl.origin);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const key = String(form.get("key") || "");
  if (!key) {
    target.searchParams.set("review_error", "missing source key");
    return NextResponse.redirect(target);
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/sources/${key.split("/").map(encodeURIComponent).join("/")}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", body.detail || res.statusText);
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
