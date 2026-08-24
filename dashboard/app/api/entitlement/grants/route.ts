import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Custom rather than a shared proxy helper: GrantIn.classes is repeated checkbox
 * values, not a single flat field, so formData().getAll() is needed.
 */
export async function POST(req: NextRequest) {
  const target = new URL("/entitlement", req.nextUrl.origin);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const body = {
    resource: ((form.get("resource") as string) || "").trim(),
    principal: ((form.get("principal") as string) || "").trim(),
    principal_kind: ((form.get("principal_kind") as string) || "group").trim(),
    classes: form.getAll("classes").map(String),
  };

  try {
    const res = await fetch(`${API_BASE}/api/entitlement/grants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", resBody.detail || res.statusText);
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
