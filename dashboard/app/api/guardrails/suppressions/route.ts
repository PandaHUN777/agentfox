import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Accept a filed false positive as a scoped, expiring exception. Only reachable
 * from a `false_positive` feedback row (see the Guardrail tuning tab on
 * /policies) — the backend itself rejects any other label, this just keeps the
 * form from being offered at all.
 */
export async function POST(req: NextRequest) {
  const target = new URL("/policies", req.nextUrl.origin);
  target.searchParams.set("tab", "guardrails");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const body: Record<string, unknown> = {};
  for (const key of ["feedback_id", "scope", "reason"]) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim()) body[key] = value.trim();
  }
  const ttlDays = form.get("ttl_days");
  if (typeof ttlDays === "string" && ttlDays.trim()) body.ttl_days = Number(ttlDays);
  body.exact = form.get("exact") === "on";

  try {
    const res = await fetch(`${API_BASE}/api/guardrails/suppressions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", resBody.detail || res.statusText);
    } else {
      target.searchParams.set("review_notice", "suppression created");
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
