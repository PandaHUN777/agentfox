import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * "This detection was wrong" — filed from wherever a detection is actually shown
 * (Trace detail), not a separate form nobody would find. Redirects back to
 * whatever page the form was submitted from, same plain-form-POST pattern as the
 * rest of the review actions.
 */
export async function POST(req: NextRequest) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const form = await req.formData();
  const returnTo = String(form.get("return_to") || "/policies?tab=guardrails");
  const target = new URL(returnTo, req.nextUrl.origin);
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const body: Record<string, string> = {};
  for (const key of ["decision_id", "label", "detector_key", "entity_type", "note"]) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim()) body[key] = value.trim();
  }

  try {
    const res = await fetch(`${API_BASE}/api/guardrails/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", resBody.detail || res.statusText);
    } else {
      target.searchParams.set("review_notice", "feedback recorded");
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
