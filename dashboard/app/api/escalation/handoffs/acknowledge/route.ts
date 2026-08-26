import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * "Someone has to act on it" only means something if there is a way to say "I've
 * got this" — otherwise every row in the queue looks perpetually unowned even
 * once a human has actually picked it up.
 */
export async function POST(req: NextRequest) {
  const target = new URL("/approvals", req.nextUrl.origin);
  target.searchParams.set("tab", "escalation");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const id = String(form.get("id") || "");
  if (!id) {
    target.searchParams.set("review_error", "missing hand-off id");
    return NextResponse.redirect(target);
  }

  try {
    const res = await fetch(`${API_BASE}/api/escalation/handoffs/${encodeURIComponent(id)}/acknowledge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", body.detail || res.statusText);
    } else {
      target.searchParams.set("review_notice", "acknowledged");
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
