import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Fetches the source's actual content and hashes it against what was last
 * recorded — the difference between "this source is tiered" (a human's claim)
 * and "we went and checked" (see /sources/page.tsx).
 *
 * `key` travels in the POST body rather than the URL path — see
 * deprecate/route.ts for why.
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
      `${API_BASE}/api/sources/${key.split("/").map(encodeURIComponent).join("/")}/validate`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      target.searchParams.set("review_error", body.detail || res.statusText);
    } else if (body.status === "changed") {
      target.searchParams.set(
        "review_notice",
        `${key}: content changed since it was last validated`,
      );
    } else if (body.status === "unreachable") {
      target.searchParams.set("review_error", `${key}: ${body.reason || "could not be fetched"}`);
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
