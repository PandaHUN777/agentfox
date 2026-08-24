import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Custom rather than a shared proxy helper: PrincipalIn.groups/clearances/purposes
 * are each their own array server-side, not flat strings, so the form's
 * comma-separated text inputs need splitting before they're forwarded.
 */
export async function POST(req: NextRequest) {
  const target = new URL("/entitlement", req.nextUrl.origin);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const split = (name: string) =>
    ((form.get(name) as string) || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const body = {
    subject: ((form.get("subject") as string) || "").trim(),
    display: ((form.get("display") as string) || "").trim(),
    groups: split("groups"),
    clearances: split("clearances"),
  };

  try {
    const res = await fetch(`${API_BASE}/api/entitlement/principals`, {
      method: "PUT",
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
