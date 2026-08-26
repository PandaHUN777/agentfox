import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * The escalation conditions (turn-depth limit, sentiment threshold, which
 * topics always qualify, etc.) had a working read/write API and no page —
 * every other tuning surface in the product (policy rules, guardrail
 * thresholds) is editable from the dashboard; this one wasn't.
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
  const owner_role = String(form.get("owner_role") || "support");
  const sla_minutes = Number(form.get("sla_minutes") || 60);
  const mode = String(form.get("mode") || "observe");
  const conditionsRaw = String(form.get("conditions") || "{}");

  let conditions: unknown;
  try {
    conditions = JSON.parse(conditionsRaw);
  } catch {
    target.searchParams.set("review_error", "conditions must be valid JSON");
    return NextResponse.redirect(target);
  }

  try {
    const res = await fetch(`${API_BASE}/api/escalation/policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conditions, owner_role, sla_minutes, mode }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", body.detail || res.statusText);
    } else {
      target.searchParams.set("review_notice", "escalation policy saved");
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
