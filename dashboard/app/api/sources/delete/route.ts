import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Hard delete (?hard=true) — irreversible, only ever offered on an already-
 * deprecated source in the UI (see /sources/page.tsx). Removes the record
 * entirely rather than keeping the "retired because it was wrong" signal.
 *
 * `key` travels in the POST body rather than the URL path — see deprecate/route.ts
 * for why (a catch-all route segment with static subroutes under it breaks
 * Next.js dev mode).
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
      `${API_BASE}/api/sources/${key.split("/").map(encodeURIComponent).join("/")}?hard=true`,
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
