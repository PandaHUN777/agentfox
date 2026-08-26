import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

export async function POST(req: NextRequest) {
  const target = new URL("/policies", req.nextUrl.origin);
  target.searchParams.set("tab", "guardrails");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const id = String(form.get("id") || "");
  if (!id) {
    target.searchParams.set("review_error", "missing suppression id");
    return NextResponse.redirect(target);
  }

  try {
    const res = await fetch(`${API_BASE}/api/guardrails/suppressions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", body.detail || res.statusText);
    } else {
      target.searchParams.set("review_notice", "suppression revoked");
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
